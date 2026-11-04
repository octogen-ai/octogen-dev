"""Credentials, transport and error mapping shared by every StoreRouter tool."""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Awaitable, Callable, Coroutine
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Literal, Self, TypeVar

from langchain_core.tools import BaseTool, ToolException
from octogen_ai_sdk import (
    OctogenAPIError,
    OctogenAuthenticationError,
    OctogenClient,
    OctogenConnectionError,
    OctogenForbiddenError,
    OctogenInsufficientCreditError,
    RequestContextDefaults,
)
from pydantic import Field, SecretStr, model_validator

#: The variable the StoreRouter CLI and docs name. Prefer it.
API_KEY_ENV_VAR = "STOREROUTER_API_KEY"
#: Read when ``STOREROUTER_API_KEY`` is unset; the Octogen SDKs' own name.
FALLBACK_API_KEY_ENV_VAR = "OCTOGEN_PLATFORM_API_KEY"
BASE_URL_ENV_VAR = "STOREROUTER_BASE_URL"
DEFAULT_BASE_URL = "https://api.storerouter.ai/v1"
DEFAULT_TIMEOUT = 30.0

#: Sent as the request context's ``application`` so StoreRouter can tell
#: LangChain traffic apart; each tool sends its own name as ``feature``.
APPLICATION = "langchain-storerouter"

#: Errors an agent cannot fix by calling the tool differently. They propagate
#: instead of becoming a ToolMessage, so a bad key stops the run loudly rather
#: than sending the model in circles.
_FATAL_ERRORS = (
    OctogenAuthenticationError,
    OctogenForbiddenError,
    OctogenInsufficientCreditError,
)

T = TypeVar("T")


class StoreRouterBaseTool(BaseTool):
    """Base class for StoreRouter tools.

    The API key comes from ``api_key``, else ``STOREROUTER_API_KEY``, else
    ``OCTOGEN_PLATFORM_API_KEY``. The base URL comes from ``base_url``, else
    ``STOREROUTER_BASE_URL``, else ``https://api.storerouter.ai/v1``.

    Tools answer with ``content_and_artifact``: the content is a compact
    rendering for the model, and the artifact is the full API response for your
    code. Request errors the model can act on (no match, an invalid filter, a
    rate limit) come back as a ToolMessage; credential and entitlement errors
    are raised.
    """

    api_key: SecretStr | None = Field(default=None, repr=False, exclude=True)
    base_url: str | None = None
    timeout: float = DEFAULT_TIMEOUT
    response_format: Literal["content", "content_and_artifact"] = "content_and_artifact"
    # Same type as BaseTool's, which names a handler-output alias newer
    # langchain-core releases introduced; only the default differs.
    handle_tool_error: bool | str | Callable[[ToolException], str] | None = True  # ty: ignore[invalid-mutable-override]

    @model_validator(mode="after")
    def _resolve_settings(self) -> Self:
        if self.api_key is None or not self.api_key.get_secret_value():
            key = os.environ.get(API_KEY_ENV_VAR) or os.environ.get(
                FALLBACK_API_KEY_ENV_VAR
            )
            if not key:
                raise ValueError(
                    f"StoreRouter API key required. Set {API_KEY_ENV_VAR} or pass "
                    "api_key. Get one at https://platform.storerouter.ai."
                )
            self.api_key = SecretStr(key)
        if not self.base_url:
            self.base_url = os.environ.get(BASE_URL_ENV_VAR) or DEFAULT_BASE_URL
        return self

    async def _call(self, operation: Callable[[OctogenClient], Awaitable[T]]) -> T:
        """Run one SDK call on a client scoped to this call.

        A client per call keeps the tool safe to use from any event loop and
        from the sync path, which runs each call on a fresh loop.
        """
        assert self.api_key is not None and self.base_url is not None
        client = OctogenClient(
            api_key=self.api_key.get_secret_value(),
            base_url=self.base_url,
            timeout=self.timeout,
            default_context=RequestContextDefaults(
                application=APPLICATION, feature=self.name
            ),
        )
        async with client:
            try:
                return await operation(client)
            except _FATAL_ERRORS:
                raise
            except OctogenAPIError as exc:
                raise ToolException(_describe_api_error(exc)) from exc
            except OctogenConnectionError as exc:
                raise ToolException(
                    f"StoreRouter could not be reached ({exc}). Try again later."
                ) from exc
            except ValueError as exc:
                # The SDK validates arguments before sending, e.g. a price_min
                # above price_max; the model can correct those.
                raise ToolException(f"Invalid arguments: {exc}") from exc

    def _run(self, *args: Any, run_manager: Any = None, **kwargs: Any) -> Any:
        return _run_sync(lambda: self._arun(*args, **kwargs))


def _run_sync(factory: Callable[[], Coroutine[Any, Any, T]]) -> T:
    """Run a coroutine to completion from sync code, inside a loop or not."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(factory())
    # Called synchronously from inside a running loop (a notebook, an async
    # framework's sync callback): asyncio.run would refuse, so use a thread.
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(lambda: asyncio.run(factory())).result()


def _describe_api_error(exc: OctogenAPIError) -> str:
    detail = exc.detail
    if detail is not None and not isinstance(detail, str):
        detail = json.dumps(detail, ensure_ascii=False, default=str)
    message = f"StoreRouter returned HTTP {exc.status_code}"
    if detail:
        message += f": {detail}"
    if exc.status_code == 404:
        message += ". Nothing matched; this is not proof the store is uncovered."
    if exc.retry_after is not None:
        message += f" Retry after {exc.retry_after} seconds."
    return message


def to_json(value: Any) -> str:
    """Compact JSON for a model-facing tool result."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def compact(fields: dict[str, Any]) -> dict[str, Any]:
    """Drop absent and empty fields, which only cost the model tokens."""
    return {k: v for k, v in fields.items() if v not in (None, "", [], {})}
