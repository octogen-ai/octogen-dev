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
        resolve_operation_path("/voyage/{task_id}", {"task_id": "task-1/../x"})
        == "/voyage/task-1%2F..%2Fx"
    )
    assert resolve_operation_path("/domains") == "/domains"


@pytest.mark.parametrize("path_params", [{}, {"task_id": "   "}])
def test_resolve_operation_path_refuses_a_blank_parameter(
    path_params: dict[str, str],
) -> None:
    with pytest.raises(ValueError, match="task_id"):
        resolve_operation_path("/voyage/{task_id}", path_params)


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
                "quotas": {
                    "voyage": {
                        "concurrent": {"limit": 2, "used": 0},
                        "monthly": {
                            "limit": 25,
                            "used": 3,
                            "periodStart": "2026-08-01",
                            "resetsAt": "2026-09-01T00:00:00Z",
                        },
                    }
                },
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
    assert me.quotas.voyage is not None
    assert me.quotas.voyage.monthly.limit == 25
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


@respx.mock
async def test_start_voyage_reports_202_as_a_fresh_dispatch() -> None:
    route = respx.post(f"{BASE_URL}/voyage").mock(
        return_value=httpx.Response(
            202,
            json={
                **TASK_JSON,
                "status": "queued",
                "phase": "discovering_site",
                "progressPercent": 5,
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        started = await client.start_voyage("https://www.shop.example/collections/x")

    assert route.calls.last.request.read() == (
        b'{"domain":"https://www.shop.example/collections/x"}'
    )
    assert started.created is True
    assert started.task.task_id == "task-1"


@respx.mock
async def test_start_voyage_reports_200_as_joining_an_in_flight_voyage() -> None:
    respx.post(f"{BASE_URL}/voyage").mock(
        return_value=httpx.Response(200, json=TASK_JSON)
    )

    async with OctogenClient(api_key="key") as client:
        started = await client.start_voyage("shop.example")

    # Joining costs no quota — the caller needs to be able to tell.
    assert started.created is False
    assert started.task.status == "running"


async def test_start_voyage_rejects_an_empty_domain() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError):
            await client.start_voyage("")


@respx.mock
async def test_list_voyages_sends_the_status_filter_and_pagination() -> None:
    route = respx.get(f"{BASE_URL}/voyage").mock(
        return_value=httpx.Response(
            200,
            json={
                "items": [TASK_JSON],
                "nextCursor": "cursor-2",
                "quotas": {
                    "concurrent": {"limit": 2, "used": 1},
                    "monthly": {"limit": 25, "used": 3},
                },
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.list_voyages(status="running", limit=10)

    assert dict(route.calls.last.request.url.params) == {
        "status": "running",
        "limit": "10",
    }
    assert page.items[0].task_id == "task-1"
    assert page.next_cursor == "cursor-2"
    assert page.quotas is not None
    assert page.quotas.concurrent.used == 1


@respx.mock
async def test_get_voyage_polls_one_task() -> None:
    route = respx.get(f"{BASE_URL}/voyage/task-1").mock(
        return_value=httpx.Response(
            200,
            json={
                **TASK_JSON,
                "status": "completed",
                "phase": "complete",
                "progressPercent": 100,
                "result": {"catalog": "shop_example", "productCount": 1420},
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        task = await client.get_voyage("task-1")

    assert route.called
    assert task.result is not None
    assert task.result.catalog == "shop_example"


async def test_get_voyage_refuses_a_blank_task_id() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError, match="task_id"):
            await client.get_voyage("  ")


@respx.mock
async def test_lookup_product_sends_match_mode_only_when_asked() -> None:
    body = {
        "source": "indexed",
        "product": {"uuid": "p1", "productUrl": "https://www.etro.com/us-en/x.html"},
    }
    route = respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(200, json=body)
    )

    async with OctogenClient(api_key="key") as client:
        await client.lookup_product("https://www.etro.com/us-en/x.html")
        assert b"matchMode" not in route.calls.last.request.read()

        await client.lookup_product(
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
