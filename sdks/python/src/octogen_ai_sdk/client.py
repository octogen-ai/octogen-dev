"""Async client for the Octogen merchant programmatic API."""

from __future__ import annotations

import importlib.metadata as metadata
import json as json_module
import os
from collections.abc import Sequence
from pprint import pformat
from types import TracebackType
from typing import Any, Self
from urllib.parse import quote

import httpx

from octogen_ai_sdk.errors import (
    MissingAPIKeyError,
    OctogenAPIError,
    OctogenAuthenticationError,
    OctogenConnectionError,
    OctogenForbiddenError,
    OctogenNotFoundError,
    OctogenValidationError,
)
from octogen_ai_sdk.models import (
    CoverageContainsResponse,
    CoverageUrlList,
    CoverageUrlListCreateRequest,
    CoverageUrlListPage,
    CoverageUrlListUrlsPage,
    CoverageUrlMutationResponse,
    CoverageUrlsRequest,
    Facet,
    MerchantProductListPage,
    MerchantProductUrlLookupResponse,
    PricePreference,
    ProductLookupCachePolicy,
    ProductLookupResolutionMode,
    ProgrammaticMoreLikeThisRequest,
    ProgrammaticMoreLikeThisResponse,
    ProgrammaticMoreLikeThisSource,
    ProgrammaticProductLookupRequest,
    ProgrammaticProductRecrawlRequest,
    ProgrammaticProductRecrawlResponse,
    ProgrammaticProductRecrawlTarget,
    ProgrammaticProductSearchRequest,
    TextSearchQuery,
)

DEFAULT_BASE_URL = "https://api.octogen.ai/v1"
DEFAULT_TIMEOUT = 30.0
PACKAGE_NAME = "octogen-ai-sdk"


def _package_version() -> str:
    try:
        return metadata.version(PACKAGE_NAME)
    except metadata.PackageNotFoundError:
        return "0.1.0"


USER_AGENT = f"octogen-ai-sdk-python/{_package_version()}"


class OctogenClient:
    """Async client for the Octogen AI commerce API.

    The API key defaults to the ``OCTO_API_KEY`` environment variable.
    Requests are authenticated with ``Authorization: Bearer <api-key>``.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float | httpx.Timeout = DEFAULT_TIMEOUT,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        resolved_api_key = api_key or os.getenv("OCTO_API_KEY")
        if not resolved_api_key:
            raise MissingAPIKeyError(
                "Octogen API key required. Set OCTO_API_KEY or pass api_key."
            )

        self._api_key = resolved_api_key
        self._base_url = base_url.rstrip("/")
        self._owns_client = http_client is None
        self._client = http_client or httpx.AsyncClient(timeout=timeout)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Close the underlying HTTP client when this SDK created it."""
        if self._owns_client:
            await self._client.aclose()

    async def lookup_product(
        self,
        url: str,
        *,
        resolution_mode: ProductLookupResolutionMode | str = (
            ProductLookupResolutionMode.AUTO
        ),
        on_demand_cache_policy: ProductLookupCachePolicy | str = (
            ProductLookupCachePolicy.PREFER_CACHE
        ),
    ) -> MerchantProductUrlLookupResponse:
        """Resolve a product URL from the index or on demand."""
        request = ProgrammaticProductLookupRequest(
            url=url,
            resolutionMode=ProductLookupResolutionMode(resolution_mode),
            onDemandCachePolicy=ProductLookupCachePolicy(on_demand_cache_policy),
        )
        data = await self._request(
            "POST",
            "/products/lookup",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return MerchantProductUrlLookupResponse.model_validate(data)

    async def recrawl_products(
        self,
        *,
        targets: Sequence[ProgrammaticProductRecrawlTarget | dict[str, Any]],
    ) -> ProgrammaticProductRecrawlResponse:
        """Schedule product URLs or UUIDs for recrawl."""
        request = ProgrammaticProductRecrawlRequest(
            targets=[_coerce_recrawl_target(target) for target in targets],
        )
        data = await self._request(
            "POST",
            "/products/recrawl",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return ProgrammaticProductRecrawlResponse.model_validate(data)

    async def search_products(
        self,
        *,
        catalog: str | None = None,
        q: str | None = None,
        text_search_query: TextSearchQuery | dict[str, Any] | None = None,
        facets: Sequence[Facet | dict[str, Any]] | None = None,
        price_min: float | None = None,
        price_max: float | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> MerchantProductListPage:
        """Search products in one catalog, or all authorized catalogs if omitted."""
        resolved_text_search_query: TextSearchQuery | None = None
        if text_search_query is not None:
            resolved_text_search_query = _coerce_text_search_query(text_search_query)

        resolved_facets: list[Facet] | None = None
        if facets is not None:
            resolved_facets = [_coerce_facet(facet) for facet in facets]

        request = ProgrammaticProductSearchRequest(
            catalog=catalog,
            cursor=cursor,
            limit=limit,
            q=q,
            text_search_query=resolved_text_search_query,
            facets=resolved_facets,
            price_min=price_min,
            price_max=price_max,
        )
        data = await self._request(
            "POST",
            "/products/search",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return MerchantProductListPage.model_validate(data)

    async def more_like_this_products(
        self,
        *,
        source_url: str | None = None,
        source_uuid: str | None = None,
        catalog: str | None = None,
        include_facets: Sequence[Facet | dict[str, Any]] | None = None,
        exclude_facets: Sequence[Facet | dict[str, Any]] | None = None,
        price_preference: PricePreference | str = PricePreference.ANY,
        cursor: str | None = None,
        limit: int = 12,
        debug: bool = False,
    ) -> ProgrammaticMoreLikeThisResponse:
        """Find products similar to a source product URL or UUID."""
        resolved_include_facets: list[Facet] | None = None
        if include_facets is not None:
            resolved_include_facets = [_coerce_facet(facet) for facet in include_facets]

        resolved_exclude_facets: list[Facet] | None = None
        if exclude_facets is not None:
            resolved_exclude_facets = [_coerce_facet(facet) for facet in exclude_facets]
        resolved_price_preference = PricePreference(price_preference)

        request = ProgrammaticMoreLikeThisRequest(
            source=ProgrammaticMoreLikeThisSource(
                url=source_url,
                uuid=source_uuid,
            ),
            catalog=catalog,
            cursor=cursor,
            limit=limit,
            include_facets=resolved_include_facets,
            exclude_facets=resolved_exclude_facets,
            price_preference=resolved_price_preference,
            debug=debug,
        )
        data = await self._request(
            "POST",
            "/products/more-like-this",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return ProgrammaticMoreLikeThisResponse.model_validate(data)

    async def create_coverage_url_list(self, *, name: str) -> CoverageUrlList:
        """Create a coverage URL list (returns it in ``provisioning``)."""
        request = CoverageUrlListCreateRequest(name=name)
        data = await self._request(
            "POST",
            "/coverage/url-lists",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return CoverageUrlList.model_validate(data)

    async def list_coverage_url_lists(
        self,
        *,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> CoverageUrlListPage:
        """List your organization's coverage URL lists, newest first."""
        data = await self._request(
            "GET",
            "/coverage/url-lists",
            params={"cursor": cursor, "limit": limit},
        )
        return CoverageUrlListPage.model_validate(data)

    async def get_coverage_url_list(self, url_list_id: str) -> CoverageUrlList:
        """Get one coverage URL list by id."""
        data = await self._request(
            "GET",
            f"/coverage/url-lists/{_path_segment(url_list_id)}",
        )
        return CoverageUrlList.model_validate(data)

    async def delete_coverage_url_list(self, url_list_id: str) -> CoverageUrlList:
        """Delete a coverage URL list (returns it in ``delete_pending``).

        Deletion is asynchronous and permanent: there is no grace window and
        no restore. The name is released immediately.
        """
        data = await self._request(
            "DELETE",
            f"/coverage/url-lists/{_path_segment(url_list_id)}",
        )
        return CoverageUrlList.model_validate(data)

    async def add_coverage_url_list_urls(
        self,
        url_list_id: str,
        *,
        urls: Sequence[str],
    ) -> CoverageUrlMutationResponse:
        """Add URLs to a list — an idempotent set-add with per-URL outcomes."""
        request = CoverageUrlsRequest(urls=_url_batch(urls))
        data = await self._request(
            "POST",
            f"/coverage/url-lists/{_path_segment(url_list_id)}/urls",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return CoverageUrlMutationResponse.model_validate(data)

    async def remove_coverage_url_list_urls(
        self,
        url_list_id: str,
        *,
        urls: Sequence[str],
    ) -> CoverageUrlMutationResponse:
        """Remove URLs from a list — an idempotent set-remove."""
        request = CoverageUrlsRequest(urls=_url_batch(urls))
        data = await self._request(
            "POST",
            f"/coverage/url-lists/{_path_segment(url_list_id)}/urls/remove",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return CoverageUrlMutationResponse.model_validate(data)

    async def check_coverage_url_list_urls(
        self,
        url_list_id: str,
        *,
        urls: Sequence[str],
    ) -> CoverageContainsResponse:
        """Check which URLs are members of a list (normalized server-side)."""
        request = CoverageUrlsRequest(urls=_url_batch(urls))
        data = await self._request(
            "POST",
            f"/coverage/url-lists/{_path_segment(url_list_id)}/urls/contains",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return CoverageContainsResponse.model_validate(data)

    async def list_coverage_url_list_urls(
        self,
        url_list_id: str,
        *,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> CoverageUrlListUrlsPage:
        """Enumerate a list's URLs in stable insertion order."""
        data = await self._request(
            "GET",
            f"/coverage/url-lists/{_path_segment(url_list_id)}/urls",
            params={"cursor": cursor, "limit": limit},
        )
        return CoverageUrlListUrlsPage.model_validate(data)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        headers = self._headers()
        content: str | None = None
        if json is not None:
            headers["Content-Type"] = "application/json"
            content = json_module.dumps(json, separators=(",", ":"))
        query = {
            key: value for key, value in (params or {}).items() if value is not None
        }

        try:
            response = await self._client.request(
                method,
                self._url(path),
                headers=headers,
                content=content,
                params=query or None,
            )
        except httpx.RequestError as exc:
            raise OctogenConnectionError(str(exc)) from exc

        if response.status_code >= 400:
            raise _api_error_from_response(response)

        if response.status_code == 204:
            return None

        try:
            return response.json()
        except ValueError as exc:
            raise OctogenAPIError(
                "Octogen API returned a non-JSON response",
                status_code=response.status_code,
                response=response,
            ) from exc

    def _url(self, path: str) -> str:
        return f"{self._base_url}/{path.lstrip('/')}"

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {self._api_key}",
            "User-Agent": USER_AGENT,
        }


def _coerce_text_search_query(
    value: TextSearchQuery | dict[str, Any],
) -> TextSearchQuery:
    if isinstance(value, TextSearchQuery):
        return value
    return TextSearchQuery.model_validate(value)


def _coerce_facet(value: Facet | dict[str, Any]) -> Facet:
    if isinstance(value, Facet):
        return value
    return Facet.model_validate(value)


def _coerce_recrawl_target(
    value: ProgrammaticProductRecrawlTarget | dict[str, Any],
) -> ProgrammaticProductRecrawlTarget:
    if isinstance(value, ProgrammaticProductRecrawlTarget):
        return value
    return ProgrammaticProductRecrawlTarget.model_validate(value)


def _api_error_from_response(response: httpx.Response) -> OctogenAPIError:
    detail = _error_detail(response)
    message = _error_message(response, detail)
    kwargs = {
        "status_code": response.status_code,
        "detail": detail,
        "response": response,
    }

    if response.status_code == 401:
        return OctogenAuthenticationError(message, **kwargs)
    if response.status_code == 403:
        return OctogenForbiddenError(message, **kwargs)
    if response.status_code == 404:
        return OctogenNotFoundError(message, **kwargs)
    if response.status_code == 422:
        return OctogenValidationError(message, **kwargs)
    return OctogenAPIError(message, **kwargs)


def _error_detail(response: httpx.Response) -> Any:
    try:
        data = response.json()
    except ValueError:
        return response.text
    if isinstance(data, dict) and "detail" in data:
        return data["detail"]
    return data


def _error_message(response: httpx.Response, detail: Any) -> str:
    if isinstance(detail, str) and detail:
        return detail
    if detail not in (None, "", [], {}):
        return (
            f"Octogen API request failed with status {response.status_code}: "
            f"{pformat(detail)}"
        )
    return f"Octogen API request failed with status {response.status_code}"


def _url_batch(urls: Sequence[str]) -> list[str]:
    """Reject a scalar string early: ``str`` satisfies ``Sequence[str]`` but
    ``list("https://…")`` would silently become a character batch."""
    if isinstance(urls, (str, bytes)):
        raise TypeError("urls must be a sequence of URL strings, not a single string")
    return list(urls)


def _path_segment(value: str) -> str:
    """Percent-encode a caller-supplied path segment (e.g. a list id)."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("url_list_id must be a non-empty string")
    return quote(value.strip(), safe="")
