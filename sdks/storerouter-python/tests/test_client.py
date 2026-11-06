from __future__ import annotations

import asyncio
import inspect
import json

import httpx
import pytest
import respx
from storerouter import (
    AsyncStoreRouter,
    AuthenticationError,
    LookupResult,
    MissingAPIKeyError,
    NotFoundError,
    Product,
    ProductSearchPage,
    StoreRouter,
)
from storerouter._client import DEFAULT_BASE_URL

from .conftest import BASE_URL, product_payload

LOOKUP = "/products/lookup"
SEARCH = "/products/search"
CONTEXT_HEADER = "X-Octogen-Request-Context"


def lookup_by_url(statuses: dict[str, int] | None = None):
    """A lookup handler that echoes the requested URL as the product."""
    statuses = statuses or {}

    def handler(request: httpx.Request) -> httpx.Response:
        url = json.loads(request.content)["url"]
        status = statuses.get(url, 200)
        if status != 200:
            return httpx.Response(status, json={"detail": "product_not_found"})
        return httpx.Response(200, json=product_payload(url, title=url.rsplit("/")[-1]))

    return handler


# --- configuration ---------------------------------------------------------


def test_missing_key_names_the_storerouter_variable() -> None:
    with pytest.raises(MissingAPIKeyError, match="STOREROUTER_API_KEY"):
        AsyncStoreRouter()


async def test_key_precedence(
    monkeypatch: pytest.MonkeyPatch, api: respx.MockRouter
) -> None:
    route = api.get("/me").respond(200, json={})
    monkeypatch.setenv("OCTOGEN_PLATFORM_API_KEY", "sk_fallback")
    monkeypatch.setenv("STOREROUTER_BASE_URL", BASE_URL)

    async def bearer(api_key: str | None = None) -> str:
        async with AsyncStoreRouter(api_key=api_key, max_retries=0) as client:
            try:
                await client.get_me()
            except Exception:
                pass
        return route.calls.last.request.headers["Authorization"]

    assert await bearer() == "Bearer sk_fallback"
    monkeypatch.setenv("STOREROUTER_API_KEY", "sk_env")
    assert await bearer() == "Bearer sk_env"
    assert await bearer(api_key="sk_arg") == "Bearer sk_arg"


async def test_base_url_defaults_to_storerouter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert DEFAULT_BASE_URL == "https://api.storerouter.ai/v1"
    client = AsyncStoreRouter(api_key="sk_test")
    assert client._base_url == DEFAULT_BASE_URL
    await client.aclose()
    monkeypatch.setenv("STOREROUTER_BASE_URL", BASE_URL + "/")
    client = AsyncStoreRouter(api_key="sk_test")
    assert client._base_url == BASE_URL
    await client.aclose()


async def test_sends_storerouter_application_context(api: respx.MockRouter) -> None:
    route = api.post(SEARCH).respond(200, json={"items": []})
    async with AsyncStoreRouter(api_key="sk_test", base_url=BASE_URL) as client:
        page = await client.search_products(
            q="linen shirt", stores=["jcrew.com"], relax=True
        )
    assert isinstance(page, ProductSearchPage)
    request = route.calls.last.request
    assert json.loads(request.headers[CONTEXT_HEADER]) == {
        "application": "storerouter-python"
    }
    body = json.loads(request.content)
    assert body["q"] == "linen shirt"
    assert body["stores"] == ["jcrew.com"]
    assert body["relax"] is True


async def test_injected_http_client_is_not_closed() -> None:
    http_client = httpx.AsyncClient()
    async with AsyncStoreRouter(api_key="sk_test", http_client=http_client):
        pass
    assert not http_client.is_closed
    await http_client.aclose()


async def test_owned_http_client_is_closed() -> None:
    client = AsyncStoreRouter(api_key="sk_test")
    await client.aclose()
    assert client._client.is_closed


# --- batch lookup ----------------------------------------------------------


async def test_lookup_products_keeps_order_and_records_failures(
    api: respx.MockRouter,
) -> None:
    urls = [f"https://shop.test/products/{n}" for n in ("a", "b", "c")]
    api.post(LOOKUP).mock(side_effect=lookup_by_url({urls[1]: 404}))
    async with AsyncStoreRouter(
        api_key="sk_test", base_url=BASE_URL, max_retries=0
    ) as client:
        results = await client.lookup_products(urls)

    assert [r.url for r in results] == urls
    assert [r.ok for r in results] == [True, False, True]
    assert isinstance(results[0].product, Product)
    assert results[0].product.title == "a"
    assert results[1].product is None
    assert isinstance(results[1].error, NotFoundError)


async def test_lookup_products_raises_auth_errors_instead_of_recording_them(
    api: respx.MockRouter,
) -> None:
    api.post(LOOKUP).respond(401, json={"detail": "invalid_api_key"})
    async with AsyncStoreRouter(
        api_key="sk_bad", base_url=BASE_URL, max_retries=0
    ) as client:
        with pytest.raises(AuthenticationError):
            await client.lookup_products(["https://shop.test/products/a"] * 3)


async def test_lookup_products_bounds_concurrency(api: respx.MockRouter) -> None:
    in_flight = 0
    peak = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        url = json.loads(request.content)["url"]
        return httpx.Response(200, json=product_payload(url))

    api.post(LOOKUP).mock(side_effect=handler)
    urls = [f"https://shop.test/products/{n}" for n in range(10)]
    async with AsyncStoreRouter(api_key="sk_test", base_url=BASE_URL) as client:
        results = await client.lookup_products(urls, max_concurrency=3)
    assert all(r.ok for r in results)
    assert peak == 3


async def test_lookup_products_rejects_a_bare_string() -> None:
    async with AsyncStoreRouter(api_key="sk_test") as client:
        with pytest.raises(TypeError):
            await client.lookup_products("https://shop.test/products/a")
        with pytest.raises(ValueError):
            await client.lookup_products([], max_concurrency=0)


async def test_lookup_products_empty() -> None:
    async with AsyncStoreRouter(api_key="sk_test") as client:
        assert await client.lookup_products([]) == []


def test_lookup_result_accessors() -> None:
    failed = LookupResult(url="u", error=NotFoundError("product_not_found"))
    assert not failed.ok
    assert failed.product is None


# --- sync client -----------------------------------------------------------


def test_sync_client_round_trip(api: respx.MockRouter) -> None:
    api.post(SEARCH).respond(
        200,
        json={
            "items": [product_payload("https://shop.test/p/1")["product"]],
            "nextCursor": "c2",
        },
    )
    api.post(LOOKUP).mock(side_effect=lookup_by_url())
    with StoreRouter(api_key="sk_test", base_url=BASE_URL) as client:
        page = client.search_products(q="tree runner")
        assert page.items[0].title == "Tree Runner"
        assert page.next_cursor == "c2"
        results = client.lookup_products(["https://shop.test/products/x"])
        assert results[0].product is not None
        assert results[0].product.title == "x"


def test_sync_client_raises_typed_errors(api: respx.MockRouter) -> None:
    api.post(LOOKUP).respond(404, json={"detail": "product_not_found"})
    with StoreRouter(api_key="sk_test", base_url=BASE_URL, max_retries=0) as client:
        with pytest.raises(NotFoundError):
            client.lookup_product("https://shop.test/products/missing")


async def test_sync_client_works_inside_a_running_event_loop(
    api: respx.MockRouter,
) -> None:
    # Jupyter and async frameworks already run a loop on this thread.
    api.post(SEARCH).respond(200, json={"items": []})
    with StoreRouter(api_key="sk_test", base_url=BASE_URL) as client:
        assert client.search_products(q="x").items == []


def test_sync_client_close_is_idempotent_and_final() -> None:
    client = StoreRouter(api_key="sk_test")
    client.close()
    client.close()
    with pytest.raises(RuntimeError, match="closed"):
        client.get_me()


def test_sync_client_missing_key_starts_no_thread() -> None:
    with pytest.raises(MissingAPIKeyError):
        StoreRouter()


def test_sync_client_mirrors_every_async_method() -> None:
    async_methods = {
        name
        for name, member in inspect.getmembers(
            AsyncStoreRouter, inspect.iscoroutinefunction
        )
        if not name.startswith("_") and name != "aclose"
    }
    missing = sorted(name for name in async_methods if not hasattr(StoreRouter, name))
    assert missing == [], f"add these to StoreRouter: {missing}"
    for name in async_methods:
        method = getattr(StoreRouter, name)
        assert not inspect.iscoroutinefunction(method), name
        assert method.__doc__ == getattr(AsyncStoreRouter, name).__doc__, name
