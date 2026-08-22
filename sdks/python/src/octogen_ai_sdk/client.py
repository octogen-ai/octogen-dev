"""Async client for the Octogen merchant programmatic API."""

from __future__ import annotations

import importlib.metadata as metadata
import json as json_module
import os
import re
import warnings
from collections.abc import Sequence
from pprint import pformat
from types import TracebackType
from typing import Any, Self

import httpx

from octogen_ai_sdk.domains import DomainCoverage
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
    DomainEntry,
    Facet,
    ListDomainsResponse,
    ListDomainsResult,
    MerchantProductListPage,
    MerchantProductUrlLookupResponse,
    MeResponse,
    PricePreference,
    ProductLookupCachePolicy,
    ProductLookupMatchMode,
    ProductLookupResolutionMode,
    ProgrammaticMoreLikeThisRequest,
    ProgrammaticMoreLikeThisResponse,
    ProgrammaticMoreLikeThisSource,
    ProgrammaticProductLookupRequest,
    ProgrammaticProductRefreshRequest,
    ProgrammaticProductRefreshResponse,
    ProgrammaticProductRefreshTarget,
    ProgrammaticProductSearchRequest,
    ProgrammaticResolveFromHtmlRequest,
    StartVoyageResult,
    TextSearchQuery,
    VoyageListResponse,
    VoyageStartRequest,
    VoyageStatus,
    VoyageTask,
)
from octogen_ai_sdk.operations import OPERATIONS, resolve_operation_path

DEFAULT_BASE_URL = "https://api.octogen.ai/v1"
DEFAULT_TIMEOUT = 30.0
PACKAGE_NAME = "octogen-ai-sdk"

#: The environment variable every Octogen document, skill, and CLI command
#: names. Prefer it in code and in docs.
API_KEY_ENV_VAR = "OCTOGEN_PLATFORM_API_KEY"

#: Read for backwards compatibility only. It never appeared in any Octogen
#: document — early SDK builds read it and nothing else did — so it is a
#: deprecated fallback that warns once and will be dropped.
DEPRECATED_API_KEY_ENV_VAR = "OCTO_API_KEY"

_MAX_AGE = re.compile(r"(?:^|[\s,])max-age\s*=\s*(\d+)", re.IGNORECASE)

_warned_deprecated_api_key_env_var = False


def _package_version() -> str:
    try:
        return metadata.version(PACKAGE_NAME)
    except metadata.PackageNotFoundError:
        return "0.3.0"


USER_AGENT = f"octogen-ai-sdk-python/{_package_version()}"


class OctogenClient:
    """Async client for the Octogen AI commerce API.

    The API key defaults to the ``OCTOGEN_PLATFORM_API_KEY`` environment
    variable, falling back to the deprecated ``OCTO_API_KEY`` with a warning.
    Requests are authenticated with ``Authorization: Bearer <api-key>``.

    Every request names an ``operationId`` from
    :data:`octogen_ai_sdk.operations.OPERATIONS`; ``tests/contract`` holds that
    table to the published OpenAPI document.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float | httpx.Timeout = DEFAULT_TIMEOUT,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        resolved_api_key = api_key or _read_env_api_key()
        if not resolved_api_key:
            raise MissingAPIKeyError(
                f"Octogen API key required. Set {API_KEY_ENV_VAR} or pass api_key."
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
        match_mode: ProductLookupMatchMode | str | None = None,
        resolution_mode: ProductLookupResolutionMode | str = (
            ProductLookupResolutionMode.AUTO
        ),
        on_demand_cache_policy: ProductLookupCachePolicy | str = (
            ProductLookupCachePolicy.PREFER_CACHE
        ),
    ) -> MerchantProductUrlLookupResponse:
        """Resolve a product URL from the index or on demand.

        ``match_mode`` defaults to the server's own default (``loose``) when
        omitted; pass ``strict`` to resolve only exact and canonical URLs.
        """
        request = ProgrammaticProductLookupRequest(
            url=url,
            matchMode=(
                ProductLookupMatchMode(match_mode) if match_mode is not None else None
            ),
            resolutionMode=ProductLookupResolutionMode(resolution_mode),
            onDemandCachePolicy=ProductLookupCachePolicy(on_demand_cache_policy),
        )
        data = await self._json(
            "lookupProduct",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return MerchantProductUrlLookupResponse.model_validate(data)

    async def refresh_products(
        self,
        *,
        targets: Sequence[ProgrammaticProductRefreshTarget | dict[str, Any]],
    ) -> ProgrammaticProductRefreshResponse:
        """Schedule product URLs or UUIDs for refresh.

        Answers ``202``: the targets were accepted and a refresh workflow was
        dispatched, not that the products have been re-crawled yet.
        """
        request = ProgrammaticProductRefreshRequest(
            targets=[_coerce_refresh_target(target) for target in targets],
        )
        data = await self._json(
            "refreshProducts",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return ProgrammaticProductRefreshResponse.model_validate(data)

    async def resolve_product_from_html(
        self,
        *,
        html: str,
        url: str | None = None,
    ) -> MerchantProductUrlLookupResponse:
        """Resolve a product from page HTML you already have.

        No index read and no outbound fetch: the answer is derived entirely
        from the document you submit. Pass ``url`` whenever you have it — it
        anchors relative image URLs and JSON-LD selection, and is the only
        variant-qualified identity the response retains for storefronts that
        encode the selected variant in query parameters.
        """
        request = ProgrammaticResolveFromHtmlRequest(html=html, url=url)
        data = await self._json(
            "resolveProductFromHtml",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return MerchantProductUrlLookupResponse.model_validate(data)

    async def get_me(self) -> MeResponse:
        """The calling organization, key, quotas, and rate-limit posture.

        Read-only and side-effect free: safe on startup and in CI. Never
        contains key material — only the key id and its non-secret prefix.
        """
        data = await self._json("getMe")
        return MeResponse.model_validate(data)

    async def list_domains(
        self,
        *,
        if_none_match: str | None = None,
    ) -> ListDomainsResult:
        """The covered-host set, with ``ETag`` revalidation.

        Prefer :meth:`fetch_domain_coverage`, which handles the ``304`` and
        returns a matcher that normalizes hosts. Use this when you manage the
        cache yourself.
        """
        headers = {"If-None-Match": if_none_match} if if_none_match else None
        response = await self._request("listDomains", headers=headers)
        etag = response.headers.get("etag")
        max_age = _parse_max_age(response.headers.get("cache-control"))

        if response.status_code == 304:
            return ListDomainsResult(
                not_modified=True,
                domains=None,
                etag=etag,
                max_age_seconds=max_age,
            )
        page = ListDomainsResponse.model_validate(_decode_json(response))
        return ListDomainsResult(
            not_modified=False,
            domains=list(page.domains),
            etag=etag,
            max_age_seconds=max_age,
        )

    async def fetch_domain_coverage(
        self,
        previous: DomainCoverage | None = None,
    ) -> DomainCoverage:
        """Fetch — or revalidate — the covered-domain snapshot.

        Pass the previous snapshot and this sends ``If-None-Match``; on a
        ``304`` it returns that same snapshot untouched, which is what the
        endpoint's ``max-age=300`` and strong ``ETag`` are for::

            coverage = await client.fetch_domain_coverage()
            url = "https://www.macys.com/shop/product/x"
            if coverage.is_host_covered(url):
                await client.lookup_product(url)

            # Later — one cheap revalidation, no re-download while unchanged:
            coverage = await client.fetch_domain_coverage(coverage)
        """
        result = await self.list_domains(
            if_none_match=previous.etag if previous is not None else None,
        )
        if result.not_modified and previous is not None:
            return previous
        entries: list[DomainEntry] = list(result.domains or [])
        return DomainCoverage(
            entries,
            etag=result.etag,
            max_age_seconds=result.max_age_seconds,
        )

    async def start_voyage(self, domain: str) -> StartVoyageResult:
        """Start — or join — a voyage for a domain.

        Voyages are shared per domain: when one is already running (or the
        domain already has a live catalog) the caller joins it and no quota is
        consumed. :attr:`StartVoyageResult.created` says which happened.
        Voyages run for hours to days; poll :meth:`get_voyage` every five
        minutes or slower.
        """
        request = VoyageStartRequest(domain=domain)
        response = await self._request(
            "startVoyage",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return StartVoyageResult(
            task=VoyageTask.model_validate(_decode_json(response)),
            created=response.status_code == 202,
        )

    async def list_voyages(
        self,
        *,
        status: VoyageStatus | str | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> VoyageListResponse:
        """List this organization's voyages, newest first."""
        data = await self._json(
            "listVoyages",
            params={"status": status, "cursor": cursor, "limit": limit},
        )
        return VoyageListResponse.model_validate(data)

    async def get_voyage(self, task_id: str) -> VoyageTask:
        """Poll one voyage.

        A task belonging to another organization is reported as ``404
        voyage_not_found``, indistinguishable from one that does not exist.
        """
        data = await self._json("getVoyage", path_params={"task_id": task_id})
        return VoyageTask.model_validate(data)

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
        data = await self._json(
            "searchProducts",
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
        data = await self._json(
            "moreLikeThisProducts",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return ProgrammaticMoreLikeThisResponse.model_validate(data)

    async def create_coverage_url_list(self, *, name: str) -> CoverageUrlList:
        """Create a coverage URL list (returns it in ``provisioning``)."""
        request = CoverageUrlListCreateRequest(name=name)
        data = await self._json(
            "createUrlList",
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
        data = await self._json(
            "listUrlLists",
            params={"cursor": cursor, "limit": limit},
        )
        return CoverageUrlListPage.model_validate(data)

    async def get_coverage_url_list(self, url_list_id: str) -> CoverageUrlList:
        """Get one coverage URL list by id."""
        data = await self._json(
            "getUrlList",
            path_params={"urlListId": url_list_id},
        )
        return CoverageUrlList.model_validate(data)

    async def delete_coverage_url_list(self, url_list_id: str) -> CoverageUrlList:
        """Delete a coverage URL list (returns it in ``delete_pending``).

        Deletion is asynchronous and permanent: there is no grace window and
        no restore. The name is released immediately.
        """
        data = await self._json(
            "deleteUrlList",
            path_params={"urlListId": url_list_id},
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
        data = await self._json(
            "addUrlListUrls",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
            path_params={"urlListId": url_list_id},
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
        data = await self._json(
            "removeUrlListUrls",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
            path_params={"urlListId": url_list_id},
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
        data = await self._json(
            "checkUrlListUrls",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
            path_params={"urlListId": url_list_id},
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
        data = await self._json(
            "listUrlListUrls",
            params={"cursor": cursor, "limit": limit},
            path_params={"urlListId": url_list_id},
        )
        return CoverageUrlListUrlsPage.model_validate(data)

    async def _request(
        self,
        operation_id: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        path_params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        """Issue one registry-declared operation and return the raw response.

        The verb and path template come from :data:`OPERATIONS`, so a method
        cannot reach a route the published contract does not define without
        ``tests/contract`` failing. Callers that only want the decoded body use
        :meth:`_json`; the ones that need a status code or a header — the
        ``202``/``200`` split on ``startVoyage``, the ``ETag`` on
        ``listDomains`` — use this.
        """
        operation = OPERATIONS[operation_id]
        path = resolve_operation_path(operation.path, path_params)

        request_headers = self._headers()
        if headers:
            request_headers.update(headers)
        content: str | None = None
        if json is not None:
            request_headers["Content-Type"] = "application/json"
            content = json_module.dumps(json, separators=(",", ":"))
        query = {
            key: value for key, value in (params or {}).items() if value is not None
        }

        try:
            response = await self._client.request(
                operation.method,
                self._url(path),
                headers=request_headers,
                content=content,
                params=query or None,
            )
        except httpx.RequestError as exc:
            raise OctogenConnectionError(str(exc)) from exc

        if response.status_code >= 400:
            raise _api_error_from_response(response)

        return response

    async def _json(
        self,
        operation_id: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        path_params: dict[str, str] | None = None,
    ) -> Any:
        """:meth:`_request` for the common case: return the decoded JSON body."""
        response = await self._request(
            operation_id,
            json=json,
            params=params,
            path_params=path_params,
        )
        return _decode_json(response)

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


def _coerce_refresh_target(
    value: ProgrammaticProductRefreshTarget | dict[str, Any],
) -> ProgrammaticProductRefreshTarget:
    if isinstance(value, ProgrammaticProductRefreshTarget):
        return value
    return ProgrammaticProductRefreshTarget.model_validate(value)


def _read_env_api_key() -> str | None:
    """``OCTOGEN_PLATFORM_API_KEY``, falling back to the deprecated name once."""
    global _warned_deprecated_api_key_env_var

    api_key = os.getenv(API_KEY_ENV_VAR)
    if api_key:
        return api_key

    deprecated = os.getenv(DEPRECATED_API_KEY_ENV_VAR)
    if deprecated:
        if not _warned_deprecated_api_key_env_var:
            _warned_deprecated_api_key_env_var = True
            warnings.warn(
                f"{DEPRECATED_API_KEY_ENV_VAR} is deprecated and will be "
                f"removed; set {API_KEY_ENV_VAR} instead.",
                DeprecationWarning,
                stacklevel=3,
            )
        return deprecated
    return None


def _parse_max_age(header: str | None) -> int | None:
    """``max-age`` in seconds from a ``Cache-Control`` header, when present."""
    if not header:
        return None
    match = _MAX_AGE.search(header)
    return int(match.group(1)) if match else None


def _decode_json(response: httpx.Response) -> Any:
    """Decode a success response body; ``None`` for the bodyless statuses.

    ``204`` (no content) and ``304`` (revalidated) both carry no body.
    """
    if response.status_code in (204, 304):
        return None
    try:
        return response.json()
    except ValueError as exc:
        raise OctogenAPIError(
            "Octogen API returned a non-JSON response",
            status_code=response.status_code,
            response=response,
        ) from exc


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
