"""The operations added in SDK 0.2.0, plus the API-key environment fallback."""

from __future__ import annotations

import warnings
from collections.abc import Iterator
from contextlib import contextmanager

import httpx
import pytest
import respx

from octogen_ai_sdk import (
    API_KEY_ENV_VAR,
    DEPRECATED_API_KEY_ENV_VAR,
    OPERATIONS,
    OctogenClient,
    resolve_operation_path,
)
from octogen_ai_sdk import client as client_module

BASE_URL = "https://api.octogen.ai/v1"


@contextmanager
def warnings_as_errors() -> Iterator[None]:
    """Turn any warning raised inside the block into a test failure."""
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        yield


TASK_JSON = {
    "taskId": "task-1",
    "domain": "shop.example",
    "status": "running",
    "phase": "sampling_products",
    "phaseLabel": "Sampling products",
    "progressPercent": 40,
}


def test_resolve_operation_path_substitutes_and_encodes() -> None:
    assert (
        resolve_operation_path(
            "/coverage/url-lists/{urlListId}", {"urlListId": "task-1/../x"}
        )
        == "/coverage/url-lists/task-1%2F..%2Fx"
    )
    assert resolve_operation_path("/domains") == "/domains"


@pytest.mark.parametrize("path_params", [{}, {"urlListId": "   "}])
def test_resolve_operation_path_refuses_a_blank_parameter(
    path_params: dict[str, str],
) -> None:
    with pytest.raises(ValueError, match="urlListId"):
        resolve_operation_path("/coverage/url-lists/{urlListId}", path_params)


def test_operations_declare_distinct_verb_and_path_pairs() -> None:
    pairs = [(op.method, op.path) for op in OPERATIONS.values()]
    assert len(pairs) == len(set(pairs))


@respx.mock
async def test_get_me_returns_the_callers_identity() -> None:
    respx.get(f"{BASE_URL}/me").mock(
        return_value=httpx.Response(
            200,
            json={
                "principal": "api_key",
                "organization": {
                    "id": "0f5b1c9e-6d4a-4a1f-9f0e-2c7b8a9d1e33",
                    "name": "Acme Co",
                    "slug": "acme-co",
                    "type": "catalog_partner",
                },
                "key": {
                    "id": "3f9c1a2b",
                    "prefix": "octo_live_3f9c1a2b4d",
                    "source": "coding_agent",
                },
                "quotas": {},
                "rateLimit": {
                    "limit": 3000,
                    "remaining": 2998,
                    "resetAt": "2026-08-20T14:31:00Z",
                },
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        me = await client.get_me()

    assert me.principal == "api_key"
    assert me.organization is not None
    assert me.organization.slug == "acme-co"
    assert me.key is not None
    assert me.key.prefix == "octo_live_3f9c1a2b4d"
    assert me.key.source == "coding_agent"
    assert me.quotas is not None
    assert me.quotas.model_dump() == {}
    assert me.rate_limit is not None
    assert me.rate_limit.remaining == 2998


@respx.mock
async def test_get_me_reads_an_org_less_super_admin_bearer() -> None:
    respx.get(f"{BASE_URL}/me").mock(
        return_value=httpx.Response(
            200,
            json={
                "principal": "super_admin",
                "rateLimit": {
                    "limit": 6000,
                    "remaining": 5999,
                    "resetAt": "2026-08-20T14:31:00Z",
                },
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        me = await client.get_me()

    assert me.principal == "super_admin"
    assert me.organization is None
    assert me.key is None


@respx.mock
async def test_resolve_product_from_html_posts_html_and_url() -> None:
    route = respx.post(f"{BASE_URL}/products/resolve-from-html").mock(
        return_value=httpx.Response(
            200,
            json={
                "source": "on_demand",
                "product": {
                    "uuid": None,
                    "productUrl": "https://shop.example/p/1",
                },
                "requestedUrl": "https://shop.example/p/1?variant=blue",
                "resolution": {"completeness": "complete", "method": "json_ld"},
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        resolved = await client.resolve_product_from_html(
            html="<html></html>",
            url="https://shop.example/p/1?variant=blue",
        )

    assert route.calls.last.request.read() == (
        b'{"html":"<html></html>","url":"https://shop.example/p/1?variant=blue"}'
    )
    assert resolved.source == "on_demand"
    assert resolved.requested_url == "https://shop.example/p/1?variant=blue"


@respx.mock
async def test_resolve_product_from_html_omits_url_entirely() -> None:
    route = respx.post(f"{BASE_URL}/products/resolve-from-html").mock(
        return_value=httpx.Response(
            200,
            json={
                "source": "on_demand",
                "product": {"uuid": None, "productUrl": "https://shop.example/p/1"},
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        await client.resolve_product_from_html(html="<html></html>")

    # `extra="forbid"` on the request model: a `"url": null` would be a 422.
    assert route.calls.last.request.read() == b'{"html":"<html></html>"}'


async def test_resolve_product_from_html_rejects_empty_html() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError):
            await client.resolve_product_from_html(html="")


@pytest.mark.parametrize(
    "method,path", [("lookup_product", "lookup"), ("parse_product_alias", "parse")]
)
@respx.mock
async def test_lookup_product_sends_match_mode_only_when_asked(
    method: str, path: str
) -> None:
    body = {
        "source": "indexed",
        "product": {"uuid": "p1", "productUrl": "https://www.etro.com/us-en/x.html"},
    }
    route = respx.post(f"{BASE_URL}/products/{path}").mock(
        return_value=httpx.Response(200, json=body)
    )

    async with OctogenClient(api_key="key") as client:
        await getattr(client, method)("https://www.etro.com/us-en/x.html")
        assert b"matchMode" not in route.calls.last.request.read()

        await getattr(client, method)(
            "https://www.etro.com/us-en/x.html", match_mode="strict"
        )
        assert b'"matchMode":"strict"' in route.calls.last.request.read()


@respx.mock
async def test_prefers_the_platform_env_var_without_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(client_module, "_warned_deprecated_api_key_env_var", False)
    monkeypatch.setenv(API_KEY_ENV_VAR, "primary")
    monkeypatch.setenv(DEPRECATED_API_KEY_ENV_VAR, "legacy")
    respx.get(f"{BASE_URL}/me").mock(
        return_value=httpx.Response(200, json={"principal": "api_key"})
    )

    with warnings_as_errors():
        async with OctogenClient() as client:
            await client.get_me()

    assert respx.calls.last.request.headers["Authorization"] == "Bearer primary"


@respx.mock
async def test_falls_back_to_the_deprecated_env_var_warning_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(client_module, "_warned_deprecated_api_key_env_var", False)
    monkeypatch.delenv(API_KEY_ENV_VAR, raising=False)
    monkeypatch.setenv(DEPRECATED_API_KEY_ENV_VAR, "legacy")
    respx.get(f"{BASE_URL}/me").mock(
        return_value=httpx.Response(200, json={"principal": "api_key"})
    )

    with pytest.warns(DeprecationWarning) as recorded:
        first = OctogenClient()
    assert DEPRECATED_API_KEY_ENV_VAR in str(recorded[0].message)
    assert API_KEY_ENV_VAR in str(recorded[0].message)

    # Once, not once per client.
    with warnings_as_errors():
        second = OctogenClient()

    async with first as client:
        await client.get_me()
    await second.aclose()

    assert respx.calls.last.request.headers["Authorization"] == "Bearer legacy"


@pytest.mark.parametrize(
    "method,path",
    [
        ("lookup_product", "lookup"),
        ("parse_product_alias", "parse"),
        ("resolve_product_from_html", "resolve-from-html"),
    ],
)
@pytest.mark.parametrize("source", ["on_demand", "client_html"])
@respx.mock
async def test_lookup_methods_accept_current_resolution_metadata(
    method: str, path: str, source: str
) -> None:
    respx.post(f"https://api.storerouter.ai/v1/products/{path}").mock(
        return_value=httpx.Response(
            200,
            json={
                "source": source,
                "product": {"uuid": None, "productUrl": "https://shop.example/p/1"},
                "resolution": {
                    "completeness": "partial",
                    "method": "catalog_extractor",
                    "rendered": None,
                    "missingFields": None,
                },
            },
        )
    )
    async with OctogenClient(
        api_key="key", base_url="https://api.storerouter.ai/v1"
    ) as client:
        result = await (
            getattr(client, method)(html="<html></html>")
            if method == "resolve_product_from_html"
            else getattr(client, method)("https://shop.example/p/1")
        )
    assert result.source == source
    assert result.resolution is not None
    assert result.resolution.method == "catalog_extractor"
    assert result.resolution.rendered is None
    assert result.resolution.missing_fields is None


def test_retired_voyage_methods_are_not_exposed() -> None:
    for name in ("start_voyage", "list_voyages", "get_voyage"):
        assert not hasattr(OctogenClient, name)
    assert not any("voyage" in operation.path for operation in OPERATIONS.values())
