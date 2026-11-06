"""The async :class:`AsyncStoreRouter` and blocking :class:`StoreRouter` clients."""

from __future__ import annotations

import asyncio
import inspect
import os
import threading
from collections.abc import Callable, Coroutine, Sequence
from concurrent.futures import Future
from dataclasses import dataclass
from types import TracebackType
from typing import Any, Concatenate, Generic, ParamSpec, Self, TypeVar, overload

import httpx
from octogen_ai_sdk import (
    MissingAPIKeyError,
    OctogenAuthenticationError,
    OctogenClient,
    OctogenError,
    OctogenForbiddenError,
    OctogenInsufficientCreditError,
    RequestContextDefaults,
)
from octogen_ai_sdk.models import (
    MerchantProductUrlLookupResponse,
    MerchantProductView,
    ProductLookupCachePolicy,
    ProductLookupMatchMode,
    ProductLookupResolutionMode,
)

from storerouter._retry import DEFAULT_MAX_RETRIES, RetryTransport

#: The variable the StoreRouter docs, CLI and integrations name. Prefer it.
API_KEY_ENV_VAR = "STOREROUTER_API_KEY"
#: Read when ``STOREROUTER_API_KEY`` is unset: the Octogen SDKs' own name.
FALLBACK_API_KEY_ENV_VAR = "OCTOGEN_PLATFORM_API_KEY"
BASE_URL_ENV_VAR = "STOREROUTER_BASE_URL"
DEFAULT_BASE_URL = "https://api.storerouter.ai/v1"
DEFAULT_TIMEOUT = 60.0
DEFAULT_LOOKUP_CONCURRENCY = 8

#: Sent as the request context's ``application`` unless you pass your own
#: ``default_context``, so StoreRouter can tell this SDK's traffic apart.
APPLICATION = "storerouter-python"

#: Errors every other URL in a batch would hit too. They stop the batch
#: instead of being recorded once per URL.
_BATCH_FATAL_ERRORS = (
    OctogenAuthenticationError,
    OctogenForbiddenError,
    OctogenInsufficientCreditError,
)


@dataclass(frozen=True, slots=True)
class LookupResult:
    """One URL's outcome in :meth:`AsyncStoreRouter.lookup_products`.

    Exactly one of ``response`` and ``error`` is set.
    """

    url: str
    response: MerchantProductUrlLookupResponse | None = None
    error: OctogenError | None = None

    @property
    def ok(self) -> bool:
        return self.error is None

    @property
    def product(self) -> MerchantProductView | None:
        """The normalized product, or ``None`` when the lookup failed."""
        return self.response.product if self.response is not None else None


class AsyncStoreRouter(OctogenClient):
    """Async client for the StoreRouter API.

    The API key comes from ``api_key``, else ``STOREROUTER_API_KEY``, else
    ``OCTOGEN_PLATFORM_API_KEY``. The base URL comes from ``base_url``, else
    ``STOREROUTER_BASE_URL``, else ``https://api.storerouter.ai/v1``.

    429 and 5xx responses and failed connections are retried up to
    ``max_retries`` times, honoring ``Retry-After``. Pass ``http_client`` to
    bring your own ``httpx.AsyncClient``; it is used as is, without retries
    unless its transport is a :class:`storerouter.RetryTransport`.

    Every method of ``octogen_ai_sdk.OctogenClient`` is available; this class
    adds :meth:`lookup_products` for batches of URLs.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float | httpx.Timeout = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        http_client: httpx.AsyncClient | None = None,
        default_context: RequestContextDefaults | None = None,
    ) -> None:
        resolved_key = (
            api_key
            or os.environ.get(API_KEY_ENV_VAR)
            or os.environ.get(FALLBACK_API_KEY_ENV_VAR)
        )
        if not resolved_key:
            raise MissingAPIKeyError(
                f"StoreRouter API key required. Set {API_KEY_ENV_VAR} or pass "
                "api_key. Get one at https://dev.storerouter.ai."
            )
        owns_client = http_client is None
        if http_client is None:
            http_client = httpx.AsyncClient(
                timeout=timeout,
                transport=RetryTransport(max_retries=max_retries),
            )
        super().__init__(
            api_key=resolved_key,
            base_url=(base_url or os.environ.get(BASE_URL_ENV_VAR) or DEFAULT_BASE_URL),
            timeout=timeout,
            http_client=http_client,
            default_context=(
                default_context
                if default_context is not None
                else RequestContextDefaults(application=APPLICATION)
            ),
        )
        # The base class only closes a client it created itself.
        self._owns_client = owns_client

    async def lookup_products(
        self,
        urls: Sequence[str],
        *,
        max_concurrency: int = DEFAULT_LOOKUP_CONCURRENCY,
        match_mode: ProductLookupMatchMode | str | None = None,
        resolution_mode: ProductLookupResolutionMode | str | None = None,
        on_demand_cache_policy: ProductLookupCachePolicy | str | None = None,
        timeout: float | httpx.Timeout | None = None,
    ) -> list[LookupResult]:
        """Look up many product URLs concurrently, one result per URL, in order.

        A URL that fails (not found, invalid, still rate limited after
        retries) gets a :class:`LookupResult` with ``error`` set, and the rest
        of the batch carries on. Authentication, permission and credit errors
        apply to every URL alike, so they are raised and stop the batch.

        Each URL is one ``POST /v1/products/lookup`` call; only successful
        lookups are billed.
        """
        if isinstance(urls, str):
            raise TypeError("lookup_products() takes a sequence of URLs, not a str")
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be >= 1")
        semaphore = asyncio.Semaphore(max_concurrency)

        async def one(url: str) -> LookupResult:
            async with semaphore:
                try:
                    response = await self.lookup_product(
                        url,
                        match_mode=match_mode,
                        resolution_mode=resolution_mode,
                        on_demand_cache_policy=on_demand_cache_policy,
                        timeout=timeout,
                    )
                except _BATCH_FATAL_ERRORS:
                    raise
                except OctogenError as exc:
                    return LookupResult(url=url, error=exc)
                return LookupResult(url=url, response=response)

        try:
            async with asyncio.TaskGroup() as group:
                tasks = [group.create_task(one(url)) for url in urls]
        except* _BATCH_FATAL_ERRORS as group_error:
            # Raise the first fatal error itself, not an ExceptionGroup.
            raise group_error.exceptions[0] from None
        return [task.result() for task in tasks]


_P = ParamSpec("_P")
_R = TypeVar("_R")


class _Blocking(Generic[_P, _R]):
    """A blocking twin of an :class:`AsyncStoreRouter` method, same signature.

    A descriptor rather than a plain wrapper function so type checkers bind
    ``self`` and show the async method's parameters on the sync client.
    """

    def __init__(
        self,
        method: Callable[Concatenate[AsyncStoreRouter, _P], Coroutine[Any, Any, _R]],
    ) -> None:
        self._name = ""
        self.__doc__ = method.__doc__
        # The async signature without ``self``, for help() and Jupyter.
        signature = inspect.signature(method)
        self._signature = signature.replace(
            parameters=list(signature.parameters.values())[1:]
        )

    def __set_name__(self, owner: type, name: str) -> None:
        self._name = name

    @overload
    def __get__(self, instance: None, owner: type | None = None) -> Self: ...

    @overload
    def __get__(
        self, instance: StoreRouter, owner: type | None = None
    ) -> Callable[_P, _R]: ...

    def __get__(
        self, instance: StoreRouter | None, owner: type | None = None
    ) -> Self | Callable[_P, _R]:
        if instance is None:
            return self
        name = self._name

        def call(*args: _P.args, **kwargs: _P.kwargs) -> _R:
            return instance._run(getattr(instance._client, name)(*args, **kwargs))

        call.__name__ = name
        call.__qualname__ = f"StoreRouter.{name}"
        call.__doc__ = self.__doc__
        call.__dict__["__signature__"] = self._signature
        return call


class StoreRouter:
    """Blocking client for the StoreRouter API.

    Same constructor and methods as :class:`AsyncStoreRouter`, without
    ``await``. It runs the async client on a private event-loop thread, so it
    works anywhere, including inside Jupyter or a running event loop. Close it
    with :meth:`close` or use it as a context manager.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float | httpx.Timeout = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        default_context: RequestContextDefaults | None = None,
    ) -> None:
        # Fail on a missing key here, before a thread exists to clean up.
        self._client = AsyncStoreRouter(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
            default_context=default_context,
        )
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._loop.run_forever, name="storerouter-client", daemon=True
        )
        self._thread.start()
        self._closed = False

    def _run(self, coroutine: Coroutine[Any, Any, _R]) -> _R:
        if self._closed:
            coroutine.close()
            raise RuntimeError("StoreRouter client is closed")
        future: Future[_R] = asyncio.run_coroutine_threadsafe(coroutine, self._loop)
        return future.result()

    def close(self) -> None:
        """Close connections and stop the client's event-loop thread."""
        if self._closed:
            return
        try:
            self._run(self._client.aclose())
        finally:
            self._closed = True
            self._loop.call_soon_threadsafe(self._loop.stop)
            self._thread.join()
            self._loop.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()

    # Products
    lookup_product = _Blocking(AsyncStoreRouter.lookup_product)
    lookup_products = _Blocking(AsyncStoreRouter.lookup_products)
    lookup_product_markdown = _Blocking(AsyncStoreRouter.lookup_product_markdown)
    parse_product_alias = _Blocking(AsyncStoreRouter.parse_product_alias)
    retrieve_product = _Blocking(AsyncStoreRouter.retrieve_product)
    retrieve_products = _Blocking(AsyncStoreRouter.retrieve_products)
    resolve_product_from_html = _Blocking(AsyncStoreRouter.resolve_product_from_html)
    search_products = _Blocking(AsyncStoreRouter.search_products)
    count_product_facets = _Blocking(AsyncStoreRouter.count_product_facets)
    more_like_this_products = _Blocking(AsyncStoreRouter.more_like_this_products)

    # Stores
    get_store = _Blocking(AsyncStoreRouter.get_store)
    search_stores = _Blocking(AsyncStoreRouter.search_stores)
    search_similar_stores = _Blocking(AsyncStoreRouter.search_similar_stores)

    # Brands
    search_brands = _Blocking(AsyncStoreRouter.search_brands)
    search_brand_prefix = _Blocking(AsyncStoreRouter.search_brand_prefix)
    search_similar_brands = _Blocking(AsyncStoreRouter.search_similar_brands)
    get_brand_directory = _Blocking(AsyncStoreRouter.get_brand_directory)
    get_brand_details = _Blocking(AsyncStoreRouter.get_brand_details)
    get_brand_coverage = _Blocking(AsyncStoreRouter.get_brand_coverage)
    browse_brand_products = _Blocking(AsyncStoreRouter.browse_brand_products)
    get_brand_top_categories = _Blocking(AsyncStoreRouter.get_brand_top_categories)

    # Taxonomy
    list_taxonomy_categories = _Blocking(AsyncStoreRouter.list_taxonomy_categories)
    list_taxonomy_attributes = _Blocking(AsyncStoreRouter.list_taxonomy_attributes)
    list_taxonomy_attribute_values = _Blocking(
        AsyncStoreRouter.list_taxonomy_attribute_values
    )

    # Account and coverage URL lists
    get_me = _Blocking(AsyncStoreRouter.get_me)
    create_coverage_url_list = _Blocking(AsyncStoreRouter.create_coverage_url_list)
    list_coverage_url_lists = _Blocking(AsyncStoreRouter.list_coverage_url_lists)
    get_coverage_url_list = _Blocking(AsyncStoreRouter.get_coverage_url_list)
    delete_coverage_url_list = _Blocking(AsyncStoreRouter.delete_coverage_url_list)
    add_coverage_url_list_urls = _Blocking(AsyncStoreRouter.add_coverage_url_list_urls)
    remove_coverage_url_list_urls = _Blocking(
        AsyncStoreRouter.remove_coverage_url_list_urls
    )
    check_coverage_url_list_urls = _Blocking(
        AsyncStoreRouter.check_coverage_url_list_urls
    )
    list_coverage_url_list_urls = _Blocking(
        AsyncStoreRouter.list_coverage_url_list_urls
    )
