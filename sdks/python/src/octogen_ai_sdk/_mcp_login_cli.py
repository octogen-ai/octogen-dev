"""Bootstrap OAuth credentials for Octogen MCP cron jobs."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import webbrowser
from pathlib import Path
from typing import Any

import httpx

from octogen_ai_sdk.errors import OctogenMCPError
from octogen_ai_sdk.mcp_auth import (
    DEFAULT_AUTHKIT_DOMAIN,
    DEFAULT_CLIENT_ID_FILE,
    DEFAULT_MCP_LOGIN_PORT,
    DEFAULT_MCP_RESOURCE,
    DEFAULT_MCP_SCOPE,
    DEFAULT_REDIRECT_URI_FILE,
    DEFAULT_REFRESH_TOKEN_FILE,
    capture_authorization_response,
    decode_jwt_aud,
    exchange_authorization_code,
    fetch_auth_server_metadata,
    generate_pkce,
    read_text_file,
    refresh_access_token,
    register_public_client,
    write_secret_file,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="octogen-mcp-login",
        description=(
            "Run an OAuth browser login and write refresh-token/client-id files "
            "for Octogen MCP cron tools."
        ),
    )
    parser.add_argument(
        "--authkit-domain",
        default=DEFAULT_AUTHKIT_DOMAIN,
        help=f"Octogen AuthKit domain. Defaults to {DEFAULT_AUTHKIT_DOMAIN}.",
    )
    parser.add_argument(
        "--resource",
        default=DEFAULT_MCP_RESOURCE,
        help=f"OAuth resource/audience. Defaults to {DEFAULT_MCP_RESOURCE}.",
    )
    parser.add_argument(
        "--scope",
        default=DEFAULT_MCP_SCOPE,
        help="OAuth scopes to request.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_MCP_LOGIN_PORT,
        help="Localhost callback port.",
    )
    parser.add_argument(
        "--client-id",
        default=os.getenv("OCTOGEN_MCP_CLIENT_ID"),
        help="Reuse an existing public OAuth client id instead of registering one.",
    )
    parser.add_argument(
        "--client-id-file",
        default=os.getenv("OCTOGEN_MCP_CLIENT_ID_FILE", str(DEFAULT_CLIENT_ID_FILE)),
        help="Where to read/write the public OAuth client id.",
    )
    parser.add_argument(
        "--redirect-uri",
        default=os.getenv("OCTOGEN_MCP_REDIRECT_URI"),
        help="Registered OAuth redirect URI. Required when reusing --client-id.",
    )
    parser.add_argument(
        "--redirect-uri-file",
        default=os.getenv(
            "OCTOGEN_MCP_REDIRECT_URI_FILE",
            str(DEFAULT_REDIRECT_URI_FILE),
        ),
        help="Where to read/write the redirect URI registered for the client id.",
    )
    parser.add_argument(
        "--refresh-token-file",
        default=os.getenv(
            "OCTOGEN_MCP_REFRESH_TOKEN_FILE",
            str(DEFAULT_REFRESH_TOKEN_FILE),
        ),
        help="Where to write the rotating MCP OAuth refresh token.",
    )
    browser = parser.add_mutually_exclusive_group()
    browser.add_argument(
        "--open",
        dest="open_browser",
        action="store_true",
        default=True,
        help="Open the authorize URL in the default browser. This is the default.",
    )
    browser.add_argument(
        "--no-open",
        dest="open_browser",
        action="store_false",
        help="Print the authorize URL without opening a browser.",
    )
    verify = parser.add_mutually_exclusive_group()
    verify.add_argument(
        "--verify",
        dest="verify",
        action="store_true",
        default=True,
        help="Verify the refresh token with one headless refresh. This is the default.",
    )
    verify.add_argument(
        "--no-verify",
        dest="verify",
        action="store_false",
        help="Skip the post-login refresh-token verification.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=300.0,
        help="Seconds to wait for the browser redirect.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args(argv)

    client_id_file = Path(args.client_id_file).expanduser()
    redirect_uri_file = Path(args.redirect_uri_file).expanduser()
    refresh_token_file = Path(args.refresh_token_file).expanduser()
    requested_redirect_uri = (
        args.redirect_uri or f"http://127.0.0.1:{args.port}/callback"
    )

    try:
        with httpx.Client() as client:
            metadata = fetch_auth_server_metadata(
                client,
                authkit_domain=args.authkit_domain,
            )
            resolved = _resolve_client_registration(
                explicit_client_id=args.client_id,
                client_id_file=client_id_file,
                explicit_redirect_uri=args.redirect_uri,
                redirect_uri_file=redirect_uri_file,
                requested_redirect_uri=requested_redirect_uri,
            )
            if resolved is None:
                client_id = register_public_client(
                    client,
                    registration_endpoint=metadata["registration_endpoint"],
                    redirect_uri=requested_redirect_uri,
                )
                redirect_uri = requested_redirect_uri
            else:
                client_id, redirect_uri = resolved
            verifier, challenge = generate_pkce()
            state = (
                base64.urlsafe_b64encode(os.urandom(16)).rstrip(b"=").decode("ascii")
            )
            authorize_url = _build_authorize_url_from_metadata(
                metadata,
                client_id=client_id,
                redirect_uri=redirect_uri,
                resource=args.resource,
                state=state,
                code_challenge=challenge,
                scope=args.scope,
            )

            print(
                "Open this URL and sign in with your Octogen catalog-partner account:",
                file=sys.stderr,
            )
            print(authorize_url, file=sys.stderr, flush=True)
            if args.open_browser:
                webbrowser.open(authorize_url)
            print(
                f"Waiting for OAuth redirect on {redirect_uri}...",
                file=sys.stderr,
                flush=True,
            )

            captured = capture_authorization_response(
                port=_localhost_redirect_port(redirect_uri),
                timeout_seconds=args.timeout,
            )
            if captured.get("error"):
                raise OctogenMCPError(f"authorize failed: {captured}")
            if captured.get("state") != state:
                raise OctogenMCPError("state mismatch; aborting login")
            access_token, refresh_token = exchange_authorization_code(
                client,
                token_endpoint=metadata["token_endpoint"],
                code=captured["code"],
                code_verifier=verifier,
                client_id=client_id,
                redirect_uri=redirect_uri,
            )
            if not refresh_token:
                raise OctogenMCPError(
                    "no refresh_token returned; offline_access was not granted"
                )
            access_aud = decode_jwt_aud(access_token)
            verified_aud: Any = None
            if args.verify:
                verify_access, verify_refresh, _expires_in = refresh_access_token(
                    client,
                    token_endpoint=metadata["token_endpoint"],
                    refresh_token=refresh_token,
                    client_id=client_id,
                )
                verified_aud = decode_jwt_aud(verify_access)
                refresh_token = verify_refresh or refresh_token

        write_secret_file(client_id_file, client_id)
        write_secret_file(redirect_uri_file, redirect_uri)
        write_secret_file(refresh_token_file, refresh_token)
    except (httpx.HTTPError, OSError, TimeoutError, OctogenMCPError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        payload = {
            "client_id": client_id,
            "client_id_file": str(client_id_file),
            "redirect_uri": redirect_uri,
            "redirect_uri_file": str(redirect_uri_file),
            "refresh_token_file": str(refresh_token_file),
            "resource": args.resource,
            "access_token_aud": access_aud,
            "verified_access_token_aud": verified_aud,
            "verified": bool(args.verify),
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        _print_success(
            client_id=client_id,
            client_id_file=client_id_file,
            redirect_uri=redirect_uri,
            redirect_uri_file=redirect_uri_file,
            refresh_token_file=refresh_token_file,
            resource=args.resource,
            access_aud=access_aud,
            verified_aud=verified_aud,
            verified=bool(args.verify),
        )
    return 0


def _resolve_client_registration(
    *,
    explicit_client_id: str | None,
    client_id_file: Path,
    explicit_redirect_uri: str | None,
    redirect_uri_file: Path,
    requested_redirect_uri: str,
) -> tuple[str, str] | None:
    if explicit_client_id:
        if not explicit_redirect_uri:
            raise OctogenMCPError(
                "Reusing --client-id requires --redirect-uri matching that "
                "client's registered redirect URI."
            )
        return explicit_client_id, explicit_redirect_uri
    if client_id_file.exists() and redirect_uri_file.exists():
        client_id = read_text_file(client_id_file)
        redirect_uri = read_text_file(redirect_uri_file)
        if client_id and redirect_uri == requested_redirect_uri:
            return client_id, redirect_uri
    return None


def _localhost_redirect_port(redirect_uri: str) -> int:
    from urllib.parse import urlparse

    parsed = urlparse(redirect_uri)
    if parsed.hostname not in {"localhost", "127.0.0.1"} or parsed.port is None:
        raise OctogenMCPError(
            "octogen-mcp-login requires a localhost redirect URI with an explicit port."
        )
    return parsed.port


def _build_authorize_url_from_metadata(
    metadata: dict[str, Any],
    *,
    client_id: str,
    redirect_uri: str,
    resource: str,
    state: str,
    code_challenge: str,
    scope: str,
) -> str:
    from octogen_ai_sdk.mcp_auth import build_authorize_url

    return build_authorize_url(
        authorization_endpoint=str(metadata["authorization_endpoint"]),
        client_id=client_id,
        redirect_uri=redirect_uri,
        resource=resource,
        state=state,
        code_challenge=code_challenge,
        scope=scope,
    )


def _print_success(
    *,
    client_id: str,
    client_id_file: Path,
    redirect_uri: str,
    redirect_uri_file: Path,
    refresh_token_file: Path,
    resource: str,
    access_aud: Any,
    verified_aud: Any,
    verified: bool,
) -> None:
    print("Octogen MCP login complete.")
    print(f"client id file      : {client_id_file}")
    print(f"redirect URI file   : {redirect_uri_file}")
    print(f"refresh token file  : {refresh_token_file}")
    print(f"redirect URI        : {redirect_uri}")
    print(f"resource            : {resource}")
    print(f"access token aud    : {access_aud!r}")
    if verified:
        print(f"verified refresh aud: {verified_aud!r}")
    print()
    print("Use these for cron:")
    print(f"export OCTOGEN_MCP_CLIENT_ID_FILE={client_id_file}")
    print(f"export OCTOGEN_MCP_REDIRECT_URI_FILE={redirect_uri_file}")
    print(f"export OCTOGEN_MCP_REFRESH_TOKEN_FILE={refresh_token_file}")
    print()
    print("Or, if you prefer to store the client id directly:")
    print(f"export OCTOGEN_MCP_CLIENT_ID={client_id}")
    print(f"export OCTOGEN_MCP_REDIRECT_URI={redirect_uri}")
    print(f"export OCTOGEN_MCP_REFRESH_TOKEN_FILE={refresh_token_file}")


if __name__ == "__main__":
    raise SystemExit(main())
