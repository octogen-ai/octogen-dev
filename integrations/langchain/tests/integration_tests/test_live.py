"""Standard tool tests against the live StoreRouter API.

Run with a key: ``STOREROUTER_API_KEY=... uv run pytest tests/integration_tests``.
Skipped without one. Product search and lookup count against the key's quota.
"""

from __future__ import annotations

import json
import os
from typing import Any

import pytest
from langchain_core.tools import BaseTool
from langchain_storerouter import (
    StoreRouterBrandSearch,
    StoreRouterProductLookup,
    StoreRouterProductSearch,
    StoreRouterStoreSearch,
)
from langchain_tests.integration_tests import ToolsIntegrationTests

pytestmark = pytest.mark.skipif(
    not (
        os.environ.get("STOREROUTER_API_KEY")
        or os.environ.get("OCTOGEN_PLATFORM_API_KEY")
    ),
    reason="needs STOREROUTER_API_KEY",
)


class TestProductSearchLive(ToolsIntegrationTests):
    @property
    def tool_constructor(self) -> type[BaseTool]:
        return StoreRouterProductSearch

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"query": "linen dress", "limit": 3}


class TestStoreSearchLive(ToolsIntegrationTests):
    @property
    def tool_constructor(self) -> type[BaseTool]:
        return StoreRouterStoreSearch

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"description": "linen dresses", "limit": 3}


class TestBrandSearchLive(ToolsIntegrationTests):
    @property
    def tool_constructor(self) -> type[BaseTool]:
        return StoreRouterBrandSearch

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"query": "vintage-inspired dresses", "limit": 3}


def test_lookup_a_product_found_by_search() -> None:
    """Search, then look up the first result's URL: the round trip agents make."""
    search = StoreRouterProductSearch().invoke(
        {"type": "tool_call", "id": "1", "name": "s", "args": {"query": "linen dress"}}
    )
    products = json.loads(search.content)["products"]
    assert products, "live search returned nothing for 'linen dress'"

    lookup = StoreRouterProductLookup().invoke(
        {
            "type": "tool_call",
            "id": "2",
            "name": "l",
            "args": {"url": products[0]["product_url"]},
        }
    )

    assert lookup.status == "success", lookup.content
    assert lookup.content.strip()
    assert lookup.artifact["product_uuid"]
