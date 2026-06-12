"""OAuth helpers for Octogen MCP clients and cron jobs."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import time
import urllib.parse
from pathlib import Path
from typing import Any

import httpx

from octogen_ai_sdk.errors import OctogenMCPError

DEFAULT_AUTHKIT_DOMAIN = "https://auth.octogen.ai"
DEFAULT_MCP_RESOURCE = "https://mcp.octogen.ai"
DEFAULT_MCP_TOKEN_ENDPOINT = "https://auth.octogen.ai/oauth2/token"
DEFAULT_MCP_LOGIN_PORT = 8765
DEFAULT_MCP_SCOPE = "openid profile email offline_access"
DEFAULT_CONFIG_DIR = Path("~/.config/octogen").expanduser()
DEFAULT_CLIENT_ID_FILE = DEFAULT_CONFIG_DIR / "mcp.client-id"
DEFAULT_REFRESH_TOKEN_FILE = DEFAULT_CONFIG_DIR / "mcp.refresh"
TIMEOUT_SECONDS = 30.0


def generate_pkce() -> tuple[str, str]:
    """Return ``(code_verifier, code_challenge)`` for PKCE-S256."""
    verifier = base64.urlsafe_b64encode(os.urandom(32)).rstrip(b"=").decode("ascii")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def build_authorize_url(
    *,
    authorization_endpoint: str,
    client_id: str,
    redirect_uri: str,
    resource: str,
    state: str,
    code_challenge: str,
    scope: str = DEFAULT_MCP_SCOPE,
) -> str:
    """Build an OAuth authorize URL with PKCE and the MCP resource indicator."""
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "resource": resource,
        "scope": scope,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return authorization_endpoint + "?" + urllib.parse.urlencode(params)


def decode_jwt_aud(token: str) -> Any:
    """Best-effort unverified decode of a JWT ``aud`` claim."""
    parts = token.split(".")
    if len(parts) < 2:
        return None
    segment = parts[1]
    try:
        payload = json.loads(
            base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))
        )
    except Exception:  # noqa: BLE001 - display helper only
        return None
    return payload.get("aud") if isinstance(payload, dict) else None


def fetch_auth_server_metadata(
    client: httpx.Client,
    *,
    authkit_domain: str = DEFAULT_AUTHKIT_DOMAIN,
    timeout: float = TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Fetch RFC 8414 authorization-server metadata from AuthKit."""
    url = f"{authkit_domain.rstrip('/')}/.well-known/oauth-authorization-server"
    response = client.get(url, timeout=timeout)
    response.raise_for_status()
    metadata = response.json()
    for key in ("authorization_endpoint", "token_endpoint", "registration_endpoint"):
        if not metadata.get(key):
            raise OctogenMCPError(f"AS metadata missing {key}: {url}")
    return metadata


def register_public_client(
    client: httpx.Client,
    *,
    registration_endpoint: str,
    redirect_uri: str,
    client_name: str = "octogen-mcp-login",
    scope: str = DEFAULT_MCP_SCOPE,
    timeout: float = TIMEOUT_SECONDS,
) -> str:
    """Register a public DCR client and return its ``client_id``."""
    response = client.post(
        registration_endpoint,
        json={
            "client_name": client_name,
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
            "scope": scope,
        },
        timeout=timeout,
    )
    response.raise_for_status()
    body = response.json()
    client_id = body.get("client_id")
    if not client_id:
        raise OctogenMCPError(
            f"DCR response missing client_id: {json.dumps(body)[:200]}"
        )
    return str(client_id)


def exchange_authorization_code(
    client: httpx.Client,
    *,
    token_endpoint: str,
    code: str,
    code_verifier: str,
    client_id: str,
    redirect_uri: str,
    timeout: float = TIMEOUT_SECONDS,
) -> tuple[str, str | None]:
    """Exchange an authorization code for ``(access_token, refresh_token)``."""
    response = client.post(
        token_endpoint,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "code_verifier": code_verifier,
        },
        headers={"Accept": "application/json"},
        timeout=timeout,
    )
    response.raise_for_status()
    body = response.json()
    access_token = body.get("access_token")
    if not access_token:
        raise OctogenMCPError(
            f"token endpoint returned no access_token: {json.dumps(body)[:200]}"
        )
    return str(access_token), body.get("refresh_token")


def refresh_access_token(
    client: httpx.Client,
    *,
    token_endpoint: str = DEFAULT_MCP_TOKEN_ENDPOINT,
    refresh_token: str,
    client_id: str,
    timeout: float = TIMEOUT_SECONDS,
) -> tuple[str, str | None]:
    """Exchange a public-client refresh token for ``(access, new_refresh)``."""
    response = client.post(
        token_endpoint,
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
        },
        headers={"Accept": "application/json"},
        timeout=timeout,
    )
    response.raise_for_status()
    body = response.json()
    access_token = body.get("access_token")
    if not access_token:
        raise OctogenMCPError("refresh exchange returned no access_token")
    return str(access_token), body.get("refresh_token")


def capture_authorization_response(
    *,
    port: int = DEFAULT_MCP_LOGIN_PORT,
    timeout_seconds: float = 300.0,
) -> dict[str, str]:
    """Capture the OAuth redirect query on a localhost callback."""
    from http.server import BaseHTTPRequestHandler, HTTPServer

    captured: dict[str, str] = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            pass

        def do_GET(self) -> None:
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if "code" in query or "error" in query:
                captured.update({key: values[0] for key, values in query.items()})
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(
                    b"<h2>Octogen MCP login complete. You can close this tab.</h2>"
                )
            else:
                self.send_response(404)
                self.end_headers()

    server = HTTPServer(("127.0.0.1", port), Handler)
    server.timeout = 1
    deadline = time.monotonic() + timeout_seconds
    try:
        while (
            time.monotonic() < deadline
            and "code" not in captured
            and "error" not in captured
        ):
            server.handle_request()
    finally:
        server.server_close()
    if not captured:
        raise TimeoutError(
            f"no redirect captured on :{port} within {timeout_seconds:.0f}s"
        )
    return captured


def read_text_file(path: Path) -> str:
    try:
        return path.expanduser().read_text().strip()
    except OSError as exc:
        raise OctogenMCPError(f"Could not read {path}: {exc}") from exc


def write_secret_file(path: Path, value: str) -> None:
    """Write a one-line secret with owner-only file permissions."""
    resolved = path.expanduser()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(resolved, flags, 0o600)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(f"{value}\n")
    finally:
        try:
            os.chmod(resolved, 0o600)
        except OSError:
            pass


class MCPRefreshTokenProvider:
    """Callable access-token provider backed by a rotating refresh token."""

    def __init__(
        self,
        *,
        client_id: str,
        refresh_token: str | None,
        refresh_token_file: Path | None,
        token_endpoint: str = DEFAULT_MCP_TOKEN_ENDPOINT,
        timeout: float = TIMEOUT_SECONDS,
        http_client: httpx.Client | None = None,
    ) -> None:
        self._client_id = client_id
        self._refresh_token = refresh_token
        self._refresh_token_file = refresh_token_file
        self._token_endpoint = token_endpoint
        self._timeout = timeout
        self._http_client = http_client
        self._access_token: str | None = None

    def __call__(self) -> str:
        if self._access_token:
            return self._access_token
        refresh_token = self._read_refresh_token()
        client = self._http_client or httpx.Client(timeout=self._timeout)
        close_client = self._http_client is None
        try:
            access_token, new_refresh = refresh_access_token(
                client,
                token_endpoint=self._token_endpoint,
                refresh_token=refresh_token,
                client_id=self._client_id,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise OctogenMCPError(f"MCP refresh-token exchange failed: {exc}") from exc
        finally:
            if close_client:
                client.close()
        if (
            isinstance(new_refresh, str)
            and new_refresh
            and new_refresh != refresh_token
        ):
            self._refresh_token = new_refresh
            if self._refresh_token_file is not None:
                write_secret_file(self._refresh_token_file, new_refresh)
        self._access_token = access_token
        return self._access_token

    def _read_refresh_token(self) -> str:
        if self._refresh_token_file is not None:
            token = read_text_file(self._refresh_token_file)
            if token:
                return token
        if self._refresh_token:
            return self._refresh_token
        raise OctogenMCPError("MCP refresh token is empty.")
