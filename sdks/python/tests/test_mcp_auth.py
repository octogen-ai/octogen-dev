from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
from octogen_ai_sdk import _mcp_login_cli as login_cli
from octogen_ai_sdk import mcp_auth


def test_build_authorize_url_includes_resource_and_pkce() -> None:
    url = mcp_auth.build_authorize_url(
        authorization_endpoint="https://auth.example.test/oauth2/authorize",
        client_id="client_123",
        redirect_uri="http://localhost:8765/callback",
        resource="https://mcp.octogen.ai",
        state="state-1",
        code_challenge="challenge-1",
    )

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert query["client_id"] == ["client_123"]
    assert query["resource"] == ["https://mcp.octogen.ai"]
    assert query["code_challenge"] == ["challenge-1"]
    assert query["code_challenge_method"] == ["S256"]


def test_register_public_client_posts_dcr_payload() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(201, json={"client_id": "client_new"})

    client = httpx.Client(transport=httpx.MockTransport(handler))

    client_id = mcp_auth.register_public_client(
        client,
        registration_endpoint="https://auth.example.test/register",
        redirect_uri="http://localhost:8765/callback",
    )

    assert client_id == "client_new"
    body = requests[0].read().decode()
    assert '"token_endpoint_auth_method":"none"' in body
    assert '"refresh_token"' in body
    assert '"http://localhost:8765/callback"' in body


def test_refresh_token_provider_persists_rotated_token(tmp_path: Path) -> None:
    token_file = tmp_path / "octogen-mcp.refresh"
    token_file.write_text("refresh-old\n")
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "access_token": "access-1",
                "refresh_token": "refresh-new",
                "expires_in": 300,
            },
        )

    provider = mcp_auth.MCPRefreshTokenProvider(
        client_id="client_123",
        refresh_token=None,
        refresh_token_file=token_file,
        token_endpoint="https://auth.example.test/oauth2/token",
        timeout=5.0,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert provider() == "access-1"
    assert provider() == "access-1"
    assert token_file.read_text() == "refresh-new\n"
    assert token_file.with_suffix(".refresh.lock").exists()
    assert len(requests) == 1
    assert b"refresh_token=refresh-old" in requests[0].content
    assert b"client_id=client_123" in requests[0].content
    assert oct(os.stat(token_file).st_mode & 0o777) == "0o600"


def test_refresh_token_provider_refreshes_after_access_token_expiry(
    tmp_path: Path, monkeypatch
) -> None:
    token_file = tmp_path / "octogen-mcp.refresh"
    token_file.write_text("refresh-old\n")
    requests: list[httpx.Request] = []
    now = 1000.0

    def monotonic() -> float:
        return now

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "access_token": f"access-{len(requests)}",
                "refresh_token": f"refresh-{len(requests)}",
                "expires_in": 300,
            },
        )

    monkeypatch.setattr(mcp_auth.time, "monotonic", monotonic)
    provider = mcp_auth.MCPRefreshTokenProvider(
        client_id="client_123",
        refresh_token=None,
        refresh_token_file=token_file,
        token_endpoint="https://auth.example.test/oauth2/token",
        timeout=5.0,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert provider() == "access-1"
    now = 1271.0
    assert provider() == "access-2"
    assert token_file.read_text() == "refresh-2\n"
    assert len(requests) == 2


def test_refresh_token_provider_caches_when_expires_in_missing(tmp_path: Path) -> None:
    token_file = tmp_path / "octogen-mcp.refresh"
    token_file.write_text("refresh-old\n")
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={"access_token": "access-1", "refresh_token": "refresh-new"},
        )

    provider = mcp_auth.MCPRefreshTokenProvider(
        client_id="client_123",
        refresh_token=None,
        refresh_token_file=token_file,
        token_endpoint="https://auth.example.test/oauth2/token",
        timeout=5.0,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert provider() == "access-1"
    assert provider() == "access-1"
    assert len(requests) == 1


def test_login_requires_redirect_uri_for_explicit_reused_client(
    tmp_path: Path,
) -> None:
    try:
        login_cli._resolve_client_registration(
            explicit_client_id="client_123",
            client_id_file=tmp_path / "mcp.client-id",
            explicit_redirect_uri=None,
            redirect_uri_file=tmp_path / "mcp.redirect-uri",
            requested_redirect_uri="http://localhost:8765/callback",
        )
    except mcp_auth.OctogenMCPError as exc:
        assert "--redirect-uri" in str(exc)
    else:
        raise AssertionError("explicit client id without redirect URI should fail")


def test_login_reuses_file_client_only_for_matching_redirect_uri(
    tmp_path: Path,
) -> None:
    client_id_file = tmp_path / "mcp.client-id"
    redirect_uri_file = tmp_path / "mcp.redirect-uri"
    client_id_file.write_text("client_123\n")
    redirect_uri_file.write_text("http://localhost:8765/callback\n")

    assert login_cli._resolve_client_registration(
        explicit_client_id=None,
        client_id_file=client_id_file,
        explicit_redirect_uri=None,
        redirect_uri_file=redirect_uri_file,
        requested_redirect_uri="http://localhost:8765/callback",
    ) == ("client_123", "http://localhost:8765/callback")
    assert (
        login_cli._resolve_client_registration(
            explicit_client_id=None,
            client_id_file=client_id_file,
            explicit_redirect_uri=None,
            redirect_uri_file=redirect_uri_file,
            requested_redirect_uri="http://localhost:9999/callback",
        )
        is None
    )


def test_write_secret_file_creates_private_parent(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "mcp.client-id"

    mcp_auth.write_secret_file(path, "client_123")

    assert path.read_text() == "client_123\n"
    assert oct(os.stat(path).st_mode & 0o777) == "0o600"
