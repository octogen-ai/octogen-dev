"""What each tool sends, what the model sees, and how failures surface."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
import respx
from langchain_core.messages import ToolMessage
from langchain_core.tools import BaseTool
from langchain_storerouter import (
    StoreRouterBrandSearch,
    StoreRouterProductLookup,
    StoreRouterProductSearch,
    StoreRouterStoreSearch,
    StoreRouterToolkit,
)
from octogen_ai_sdk import OctogenAuthenticationError, OctogenInsufficientCreditError
from pydantic import ValidationError

from .conftest import API_KEY

PRODUCT_URL = "https://www.thereformation.com/products/juliette-linen-dress"


def _call(tool: BaseTool, args: dict[str, Any]) -> ToolMessage:
    message = tool.invoke(
        {"type": "tool_call", "id": "call-1", "name": tool.name, "args": args}
    )
    assert isinstance(message, ToolMessage)
    return message


def _text(message: ToolMessage) -> str:
    assert isinstance(message.content, str)
    return message.content


def _body(router: respx.MockRouter, name: str) -> dict[str, Any]:
    return json.loads(router.routes[name].calls.last.request.content)


def test_product_search_sends_query_filters_and_limit(
    mock_api: respx.MockRouter,
) -> None:
    _call(
        StoreRouterProductSearch(),
        {
            "query": "linen midi dress",
            "min_price": 50,
            "max_price": 200,
            "stores": ["thereformation.com"],
            "limit": 5,
            "cursor": "cursor-1",
        },
    )

    body = _body(mock_api, "search")
    assert body["q"] == "linen midi dress"
    assert body["price_min"] == 50
    assert body["price_max"] == 200
    assert body["stores"] == ["thereformation.com"]
    assert body["limit"] == 5
    assert body["cursor"] == "cursor-1"
    request = mock_api.routes["search"].calls.last.request
    assert request.headers["authorization"] == f"Bearer {API_KEY}"


def test_product_search_gives_the_model_compact_cards(
    mock_api: respx.MockRouter,
) -> None:
    message = _call(StoreRouterProductSearch(), {"query": "linen dress"})

    content = json.loads(_text(message))
    first, second = content["products"]
    assert first == {
        "title": "Juliette Linen Dress",
        "brand": "Reformation",
        "store": "Reformation",
        "price": 178.0,
        "original_price": 248.0,
        "currency": "USD",
        "in_stock": True,
        "colors": ["Ivory", "Black"],
        "category": "Apparel & Accessories > Clothing > Dresses",
        "product_url": PRODUCT_URL,
        "image_url": "https://cdn.storerouter.ai/img/juliette.jpg",
        "uuid": "0b6a3c1e-4f2d-4b8a-9c7e-1d2f3a4b5c6d",
    }
    # An original price equal to the current one is not a sale.
    assert "original_price" not in second
    assert content["next_cursor"] == "cursor-2"
    # The artifact keeps what the content drops.
    assert message.artifact["items"][0]["rawScore"] == 12.5
    assert message.artifact["requestId"] == "req-search"


def test_product_search_with_no_results(mock_api: respx.MockRouter) -> None:
    mock_api.routes["search"].return_value = httpx.Response(200, json={"items": []})

    message = _call(StoreRouterProductSearch(), {"query": "nothing matches"})

    assert json.loads(_text(message)) == {"products": []}


def test_product_lookup_returns_markdown(mock_api: respx.MockRouter) -> None:
    message = _call(StoreRouterProductLookup(), {"url": PRODUCT_URL})

    assert _text(message).startswith("# Juliette Linen Dress")
    assert message.artifact == {
        "request_id": "req-lookup",
        "product_uuid": "0b6a3c1e-4f2d-4b8a-9c7e-1d2f3a4b5c6d",
        "catalog": "thereformation",
        "matched_via": "exact",
    }
    request = mock_api.routes["lookup"].calls.last.request
    assert request.headers["accept"] == "text/markdown"
    body = json.loads(request.content)
    assert body["url"] == PRODUCT_URL
    assert body["format"] == "markdown"


def test_store_search(mock_api: respx.MockRouter) -> None:
    message = _call(StoreRouterStoreSearch(), {"description": "linen", "limit": 3})

    assert _body(mock_api, "stores") == {"text": "linen", "limit": 3}
    assert json.loads(_text(message)) == {
        "stores": [
            {
                "name": "Reformation",
                "domain": "thereformation.com",
                "summary": "Women's clothing, mostly dresses.",
                "matched_category": "Apparel & Accessories > Clothing",
            }
        ]
    }


def test_brand_search(mock_api: respx.MockRouter) -> None:
    message = _call(StoreRouterBrandSearch(), {"query": "vintage dresses"})

    assert _body(mock_api, "brands") == {"q": "vintage dresses", "limit": 10}
    assert json.loads(_text(message)) == {
        "brands": [
            {
                "name": "Doen",
                "domain": "shopdoen.com",
                "description": "Feminine, vintage-inspired clothing.",
            }
        ]
    }


def test_requests_name_the_integration_and_tool(mock_api: respx.MockRouter) -> None:
    _call(StoreRouterBrandSearch(), {"query": "vintage dresses"})

    request = mock_api.routes["brands"].calls.last.request
    context = json.loads(request.headers["x-octogen-request-context"])
    assert context["application"] == "langchain-storerouter"
    assert context["feature"] == "storerouter_brand_search"


def test_api_errors_reach_the_model(mock_api: respx.MockRouter) -> None:
    mock_api.routes["lookup"].return_value = httpx.Response(
        404, json={"detail": "product_not_found"}
    )

    message = _call(StoreRouterProductLookup(), {"url": PRODUCT_URL})

    assert message.status == "error"
    assert "HTTP 404" in _text(message)
    assert "product_not_found" in _text(message)


def test_rate_limits_tell_the_model_when_to_retry(
    mock_api: respx.MockRouter,
) -> None:
    mock_api.routes["search"].return_value = httpx.Response(
        429, json={"detail": "rate_limited"}, headers={"retry-after": "7"}
    )

    message = _call(StoreRouterProductSearch(), {"query": "linen dress"})

    assert message.status == "error"
    assert "Retry after 7 seconds" in _text(message)


def test_invalid_arguments_reach_the_model() -> None:
    message = _call(
        StoreRouterProductSearch(),
        {"query": "linen dress", "min_price": 300, "max_price": 100},
    )

    assert message.status == "error"
    assert _text(message).startswith("Invalid arguments")


@pytest.mark.parametrize(
    ("status", "error"),
    [(401, OctogenAuthenticationError), (402, OctogenInsufficientCreditError)],
)
def test_credential_and_credit_errors_are_raised(
    mock_api: respx.MockRouter, status: int, error: type[Exception]
) -> None:
    mock_api.routes["search"].return_value = httpx.Response(
        status, json={"detail": "nope"}
    )

    with pytest.raises(error):
        _call(StoreRouterProductSearch(), {"query": "linen dress"})


def test_missing_key_fails_at_construction(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STOREROUTER_API_KEY")

    with pytest.raises(ValidationError, match="STOREROUTER_API_KEY"):
        StoreRouterProductSearch()


def test_octogen_key_is_the_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STOREROUTER_API_KEY")
    monkeypatch.setenv("OCTOGEN_PLATFORM_API_KEY", "octogen-key")

    tool = StoreRouterProductSearch()

    assert tool.api_key is not None
    assert tool.api_key.get_secret_value() == "octogen-key"


def test_base_url_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STOREROUTER_BASE_URL", "https://staging.example/v1")

    assert StoreRouterProductSearch().base_url == "https://staging.example/v1"


def test_key_never_appears_in_repr_or_dump() -> None:
    tool = StoreRouterProductSearch(api_key="secret-value")

    assert "secret-value" not in repr(tool)
    assert "secret-value" not in json.dumps(tool.model_dump(), default=str)


async def test_sync_invoke_works_inside_a_running_loop(
    mock_api: respx.MockRouter,
) -> None:
    # A notebook cell, or a sync callback in an async framework.
    message = _call(StoreRouterStoreSearch(), {"description": "linen"})

    assert "Reformation" in _text(message)


async def test_async_invoke(mock_api: respx.MockRouter) -> None:
    tool = StoreRouterProductSearch()
    message = await tool.ainvoke(
        {
            "type": "tool_call",
            "id": "call-1",
            "name": tool.name,
            "args": {"query": "linen dress"},
        }
    )

    assert "Juliette Linen Dress" in _text(message)


def test_toolkit_shares_settings() -> None:
    tools = StoreRouterToolkit(
        api_key="toolkit-key",
        base_url="https://staging.example/v1",
        timeout=5,
    ).get_tools()

    assert [tool.name for tool in tools] == [
        "storerouter_product_search",
        "storerouter_product_lookup",
        "storerouter_store_search",
        "storerouter_brand_search",
    ]
    for tool in tools:
        assert isinstance(
            tool,
            StoreRouterProductSearch
            | StoreRouterProductLookup
            | StoreRouterStoreSearch
            | StoreRouterBrandSearch,
        )
        assert tool.api_key is not None
        assert tool.api_key.get_secret_value() == "toolkit-key"
        assert tool.base_url == "https://staging.example/v1"
        assert tool.timeout == 5
