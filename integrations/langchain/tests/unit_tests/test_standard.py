"""LangChain's standard tool tests, against the mocked API in conftest."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import BaseTool
from langchain_storerouter import (
    StoreRouterBrandSearch,
    StoreRouterProductLookup,
    StoreRouterProductSearch,
    StoreRouterStoreSearch,
)
from langchain_tests.integration_tests import ToolsIntegrationTests
from langchain_tests.unit_tests import ToolsUnitTests

from .conftest import API_KEY, BASE_URL

_ENV = (
    {"STOREROUTER_API_KEY": API_KEY},
    {},
    {"api_key": API_KEY, "base_url": BASE_URL},
)


class _ProductSearch:
    @property
    def tool_constructor(self) -> type[BaseTool]:
        return StoreRouterProductSearch

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"query": "linen midi dress", "max_price": 200, "limit": 5}


class _ProductLookup:
    @property
    def tool_constructor(self) -> type[BaseTool]:
        return StoreRouterProductLookup

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"url": "https://www.thereformation.com/products/juliette-linen-dress"}


class _StoreSearch:
    @property
    def tool_constructor(self) -> type[BaseTool]:
        return StoreRouterStoreSearch

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"description": "linen dresses"}


class _BrandSearch:
    @property
    def tool_constructor(self) -> type[BaseTool]:
        return StoreRouterBrandSearch

    @property
    def tool_invoke_params_example(self) -> dict[str, Any]:
        return {"query": "vintage-inspired dresses"}


class _FromEnv:
    @property
    def init_from_env_params(
        self,
    ) -> tuple[dict[str, str], dict[str, Any], dict[str, Any]]:
        return _ENV


class TestProductSearchUnit(_FromEnv, _ProductSearch, ToolsUnitTests):
    pass


class TestProductSearchStandard(_ProductSearch, ToolsIntegrationTests):
    pass


class TestProductLookupUnit(_FromEnv, _ProductLookup, ToolsUnitTests):
    pass


class TestProductLookupStandard(_ProductLookup, ToolsIntegrationTests):
    pass


class TestStoreSearchUnit(_FromEnv, _StoreSearch, ToolsUnitTests):
    pass


class TestStoreSearchStandard(_StoreSearch, ToolsIntegrationTests):
    pass


class TestBrandSearchUnit(_FromEnv, _BrandSearch, ToolsUnitTests):
    pass


class TestBrandSearchStandard(_BrandSearch, ToolsIntegrationTests):
    pass
