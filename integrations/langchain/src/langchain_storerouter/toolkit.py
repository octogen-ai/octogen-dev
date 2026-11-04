"""All StoreRouter tools, configured once."""

from __future__ import annotations

from langchain_core.tools import BaseTool, BaseToolkit
from pydantic import Field, SecretStr

from langchain_storerouter._base import DEFAULT_TIMEOUT, StoreRouterBaseTool
from langchain_storerouter.tools import (
    StoreRouterBrandSearch,
    StoreRouterProductLookup,
    StoreRouterProductSearch,
    StoreRouterStoreSearch,
)

_TOOL_CLASSES: tuple[type[StoreRouterBaseTool], ...] = (
    StoreRouterProductSearch,
    StoreRouterProductLookup,
    StoreRouterStoreSearch,
    StoreRouterBrandSearch,
)


class StoreRouterToolkit(BaseToolkit):
    """Every StoreRouter tool, sharing one API key and base URL.

    Instantiate:
        .. code-block:: python

            from langchain_storerouter import StoreRouterToolkit

            tools = StoreRouterToolkit().get_tools()

    Use with an agent:
        .. code-block:: python

            from langchain.agents import create_agent

            agent = create_agent("anthropic:claude-sonnet-5-5", tools=tools)
            agent.invoke(
                {"messages": [{"role": "user", "content": "Find a linen dress"}]}
            )

    Settings left unset are read from the environment, as each tool reads them.
    """

    api_key: SecretStr | None = Field(default=None, repr=False, exclude=True)
    base_url: str | None = None
    timeout: float = DEFAULT_TIMEOUT

    def get_tools(self) -> list[BaseTool]:
        """Product search, product lookup, store search and brand search."""
        return [
            # Each subclass defaults name and description; ty reads them as
            # required because BaseTool declares them without defaults.
            tool_class(  # ty: ignore[missing-argument]
                api_key=self.api_key, base_url=self.base_url, timeout=self.timeout
            )
            for tool_class in _TOOL_CLASSES
        ]
