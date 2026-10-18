"""Async client for the Octogen merchant programmatic API."""

from __future__ import annotations

import importlib.metadata as metadata
import json as json_module
import math
import os
import re
import warnings
from collections.abc import Sequence
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pprint import pformat
from types import TracebackType
from typing import Any, Self, TypeVar

import httpx
from pydantic import BaseModel

from octogen_ai_sdk.domains import DomainCoverage
from octogen_ai_sdk.errors import (
    MissingAPIKeyError,
    OctogenAPIError,
    OctogenAuthenticationError,
    OctogenConnectionError,
    OctogenForbiddenError,
    OctogenGatewayTimeoutError,
    OctogenInsufficientCreditError,
    OctogenNotFoundError,
    OctogenRateLimitError,
    OctogenServerError,
    OctogenTimeoutError,
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
    MerchantProductUrlLookupResponse,
    MeResponse,
    PricePreference,
    ProductLookupCachePolicy,
    ProductLookupMatchMode,
    ProductLookupResolutionMode,
    ProductMarkdownLookupResult,
    ProgrammaticMoreLikeThisRequest,
    ProgrammaticMoreLikeThisResponse,
    ProgrammaticMoreLikeThisSource,
    ProgrammaticProductLookupRequest,
    ProgrammaticProductSearchPage,
    ProgrammaticProductSearchRequest,
    ProgrammaticResolveFromHtmlRequest,
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

#: A per-call ``timeout``: seconds, or an ``httpx.Timeout`` for finer control.
Timeout = float | httpx.Timeout

_MAX_AGE = re.compile(r"(?:^|[\s,])max-age\s*=\s*(\d+)", re.IGNORECASE)

_RequestT = TypeVar("_RequestT", bound=BaseModel)

_ERROR_CLASSES: dict[int, type[OctogenAPIError]] = {
    401: OctogenAuthenticationError,
    402: OctogenInsufficientCreditError,
    403: OctogenForbiddenError,
    404: OctogenNotFoundError,
    422: OctogenValidationError,
    429: OctogenRateLimitError,
    504: OctogenGatewayTimeoutError,
}

_warned_deprecated_api_key_env_var = False


def _package_version() -> str:
    try:
        return metadata.version(PACKAGE_NAME)
    except metadata.PackageNotFoundError:
        return "0.6.0"


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
        url: str | None = None,
        *,
        match_mode: ProductLookupMatchMode | str | None = None,
        resolution_mode: ProductLookupResolutionMode | str | None = None,
        on_demand_cache_policy: ProductLookupCachePolicy | str | None = None,
        request: ProgrammaticProductLookupRequest | None = None,
        timeout: Timeout | None = None,
    ) -> MerchantProductUrlLookupResponse:
        """Resolve a product URL from the index or on demand.

        ``match_mode`` defaults to the server's own default (``loose``) when
        omitted; pass ``strict`` to resolve only exact and canonical URLs.
        ``resolution_mode`` defaults to ``auto`` and ``on_demand_cache_policy``
        to ``prefer_cache``.

        Pass ``request`` instead of ``url`` and the controls to send a prebuilt
        :class:`ProgrammaticProductLookupRequest` (or a subclass) as is.
        """
        body = _lookup_request(
            "lookup_product",
            url,
            match_mode=match_mode,
            resolution_mode=resolution_mode,
            on_demand_cache_policy=on_demand_cache_policy,
            request=request,
        )
        data = await self._json("lookupProduct", json=body, timeout=timeout)
        return MerchantProductUrlLookupResponse.model_validate(data)

    async def lookup_product_markdown(
        self,
        url: str | None = None,
        *,
        match_mode: ProductLookupMatchMode | str | None = None,
        resolution_mode: ProductLookupResolutionMode | str | None = None,
        on_demand_cache_policy: ProductLookupCachePolicy | str | None = None,
        request: ProgrammaticProductLookupRequest | None = None,
        timeout: Timeout | None = None,
    ) -> ProductMarkdownLookupResult:
        """:meth:`lookup_product`, with the product rendered as LLM-ready Markdown.

        Sends ``format: "markdown"`` with ``Accept: text/markdown``. The result
        carries the Markdown and the identity headers that name the product —
        ``x-request-id``, ``x-octogen-product-uuid``, ``x-octogen-catalog``,
        ``x-octogen-matched-via`` and ``x-octogen-normalized-url``. Errors are
        raised exactly as for :meth:`lookup_product`.
        """
        body = _lookup_request(
            "lookup_product_markdown",
            url,
            match_mode=match_mode,
            resolution_mode=resolution_mode,
            on_demand_cache_policy=on_demand_cache_policy,
            request=request,
        )
        body["format"] = "markdown"
        response = await self._request(
            "lookupProduct",
            json=body,
            headers={"Accept": "text/markdown"},
            timeout=timeout,
        )
        headers = response.headers
        media_type = headers.get("content-type", "").split(";", 1)[0].strip()
        if media_type == "application/json":
            raise OctogenAPIError(
                "Octogen API returned JSON where Markdown was requested",
                status_code=response.status_code,
                response=response,
                request_id=headers.get("x-request-id"),
            )
        return ProductMarkdownLookupResult(
            markdown=response.text,
            request_id=headers.get("x-request-id"),
            product_uuid=headers.get("x-octogen-product-uuid"),
            catalog=headers.get("x-octogen-catalog"),
            matched_via=headers.get("x-octogen-matched-via"),
            normalized_url=headers.get("x-octogen-normalized-url"),
        )

    async def parse_product_alias(
        self,
        url: str | None = None,
        *,
        match_mode: ProductLookupMatchMode | str | None = None,
        resolution_mode: ProductLookupResolutionMode | str | None = None,
        on_demand_cache_policy: ProductLookupCachePolicy | str | None = None,
        request: ProgrammaticProductLookupRequest | None = None,
        timeout: Timeout | None = None,
    ) -> MerchantProductUrlLookupResponse:
        """Exact alias of lookup_product, using POST /v1/products/parse.

        ``match_mode`` defaults to the server's own default (``loose``) when
        omitted; pass ``strict`` to resolve only exact and canonical URLs.
        """
        body = _lookup_request(
            "parse_product_alias",
            url,
            match_mode=match_mode,
            resolution_mode=resolution_mode,
            on_demand_cache_policy=on_demand_cache_policy,
            request=request,
        )
        data = await self._json("parseProductAlias", json=body, timeout=timeout)
        return MerchantProductUrlLookupResponse.model_validate(data)

    async def resolve_product_from_html(
        self,
        *,
        html: str | None = None,
        url: str | None = None,
        request: ProgrammaticResolveFromHtmlRequest | None = None,
        timeout: Timeout | None = None,
    ) -> MerchantProductUrlLookupResponse:
        """Resolve a product from page HTML you already have.

        No index read and no outbound fetch: the answer is derived entirely
        from the document you submit. Pass ``url`` whenever you have it — it
        anchors relative image URLs and JSON-LD selection, and is the only
        variant-qualified identity the response retains for storefronts that
        encode the selected variant in query parameters.
        """
        if request is not None:
            _reject_mixed("resolve_product_from_html", html=html, url=url)
            resolved = _require_model(
                "resolve_product_from_html",
                request,
                ProgrammaticResolveFromHtmlRequest,
            )
        elif html is None:
            raise TypeError("resolve_product_from_html() requires html or request")
        else:
            resolved = ProgrammaticResolveFromHtmlRequest(html=html, url=url)
        data = await self._json(
            "resolveProductFromHtml", json=_body(resolved), timeout=timeout
        )
        return MerchantProductUrlLookupResponse.model_validate(data)

    async def get_me(self, *, timeout: Timeout | None = None) -> MeResponse:
        """The calling organization, key, quotas, and rate-limit posture.

        Read-only and side-effect free: safe on startup and in CI. Never
        contains key material — only the key id and its non-secret prefix.
        """
        data = await self._json("getMe", timeout=timeout)
        return MeResponse.model_validate(data)

    async def list_domains(
        self,
        *,
        if_none_match: str | None = None,
        timeout: Timeout | None = None,
    ) -> ListDomainsResult:
        """The covered-host set, with ``ETag`` revalidation.

        Prefer :meth:`fetch_domain_coverage`, which handles the ``304`` and
        returns a matcher that normalizes hosts. Use this when you manage the
        cache yourself.
        """
        headers = {"If-None-Match": if_none_match} if if_none_match else None
        response = await self._request("listDomains", headers=headers, timeout=timeout)
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
        *,
        timeout: Timeout | None = None,
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
            timeout=timeout,
        )
        if result.not_modified and previous is not None:
            return previous
        entries: list[DomainEntry] = list(result.domains or [])
        return DomainCoverage(
            entries,
            etag=result.etag,
            max_age_seconds=result.max_age_seconds,
        )

    async def search_products(
        self,
        *,
        q: str | None = None,
        understand: bool | None = None,
        facets: Sequence[Facet | dict[str, Any]] | None = None,
        exclude_facets: Sequence[Facet | dict[str, Any]] | None = None,
        omit_generated_facets: Sequence[str] | None = None,
        price_min: float | None = None,
        price_max: float | None = None,
        brand_quality_min: float | None = None,
        brand_quality_max: float | None = None,
        similar_to_brands: Sequence[str] | None = None,
        fallback_category: Sequence[str] | None = None,
        catalogs: Sequence[str] | None = None,
        limit: int | None = None,
        cursor: str | None = None,
        relax: bool | None = None,
        diversity: bool | None = None,
        debug: bool | None = None,
        request: ProgrammaticProductSearchRequest | None = None,
        timeout: Timeout | None = None,
    ) -> ProgrammaticProductSearchPage:
        """Search indexed products by free text, filters, or both.

        ``q`` is understood by default — rewritten for retrieval, with filters
        derived from it; ``understand=False`` matches it as written. ``facets``
        and ``exclude_facets`` say what to keep and drop, ``catalogs`` (1-500
        keys) where to look; omit it to search every catalog your key can
        access. ``limit`` defaults to 50. Every page carries
        ``effective_query``, the search that ran.

        ``fallback_category`` is a category path, root first (for example
        ``["apparel & accessories", "clothing"]``), searched when understanding
        finds no category in ``q``. It is not applied when the understood
        query has a top-level category or ``facets`` has a ``category_path``
        facet, and it is reported in ``effective_query`` as ``generated``.
        Requires an understood ``q``.

        ``diversity=True`` spreads page 1 across retailers and drops products
        whose image repeats one already on the page. It has no effect with
        ``catalogs``, a key limited to specific catalogs, or a ``brand_name``
        facet, and a cursor continues only with the setting it was minted
        under.

        Contradictions the server would refuse with a ``422`` — ``relax``
        without an understood ``q``, a facet name sent twice, ``price_min``
        above ``price_max`` — raise ``pydantic.ValidationError`` before any
        request.

        Pass ``request`` instead of the keywords to send a prebuilt
        :class:`ProgrammaticProductSearchRequest` as is. A subclass's extra
        fields are sent too, so a field the API accepts before this SDK
        declares it can still go out::

            class MySearchRequest(ProgrammaticProductSearchRequest):
                new_control: bool | None = None

            await client.search_products(request=MySearchRequest(q="linen dress"))
        """
        if request is not None:
            _reject_mixed(
                "search_products",
                q=q,
                understand=understand,
                facets=facets,
                exclude_facets=exclude_facets,
                omit_generated_facets=omit_generated_facets,
                price_min=price_min,
                price_max=price_max,
                brand_quality_min=brand_quality_min,
                brand_quality_max=brand_quality_max,
                similar_to_brands=similar_to_brands,
                fallback_category=fallback_category,
                catalogs=catalogs,
                limit=limit,
                cursor=cursor,
                relax=relax,
                diversity=diversity,
                debug=debug,
            )
            resolved = _require_model(
                "search_products", request, ProgrammaticProductSearchRequest
            )
        else:
            resolved = ProgrammaticProductSearchRequest(
                q=q,
                understand=understand,
                facets=_facet_list(facets),
                exclude_facets=_facet_list(exclude_facets),
                omit_generated_facets=_string_list(
                    omit_generated_facets, "omit_generated_facets"
                ),
                price_min=price_min,
                price_max=price_max,
                brand_quality_min=brand_quality_min,
                brand_quality_max=brand_quality_max,
                similar_to_brands=_string_list(similar_to_brands, "similar_to_brands"),
                fallback_category=_string_list(fallback_category, "fallback_category"),
                catalogs=_catalog_list(catalogs),
                limit=50 if limit is None else limit,
                cursor=cursor,
                relax=relax,
                diversity=diversity,
                debug=debug,
            )
        data = await self._json("searchProducts", json=_body(resolved), timeout=timeout)
        return ProgrammaticProductSearchPage.model_validate(data)

    async def more_like_this_products(
        self,
        *,
        source_url: str | None = None,
        source_uuid: str | None = None,
        catalogs: Sequence[str] | None = None,
        include_facets: Sequence[Facet | dict[str, Any]] | None = None,
        exclude_facets: Sequence[Facet | dict[str, Any]] | None = None,
        price_preference: PricePreference | str | None = None,
        cursor: str | None = None,
        limit: int | None = None,
        debug: bool | None = None,
        request: ProgrammaticMoreLikeThisRequest | None = None,
        timeout: Timeout | None = None,
    ) -> ProgrammaticMoreLikeThisResponse:
        """Find products similar to a source product URL or UUID.

        ``catalogs`` (1-100 keys) restricts the results; the source product may
        live outside it. Omit it to draw results from every active catalog.
        ``price_preference`` defaults to ``any``, ``limit`` to 12, and
        ``debug`` to ``False``.

        Pass ``request`` instead of the keywords to send a prebuilt
        :class:`ProgrammaticMoreLikeThisRequest` (or a subclass) as is.
        """
        if request is not None:
            _reject_mixed(
                "more_like_this_products",
                source_url=source_url,
                source_uuid=source_uuid,
                catalogs=catalogs,
                include_facets=include_facets,
                exclude_facets=exclude_facets,
                price_preference=price_preference,
                cursor=cursor,
                limit=limit,
                debug=debug,
            )
            resolved = _require_model(
                "more_like_this_products", request, ProgrammaticMoreLikeThisRequest
            )
        else:
            resolved = ProgrammaticMoreLikeThisRequest(
                source=ProgrammaticMoreLikeThisSource(
                    url=source_url,
                    uuid=source_uuid,
                ),
                catalogs=_catalog_list(catalogs),
                cursor=cursor,
                limit=12 if limit is None else limit,
                include_facets=_facet_list(include_facets),
                exclude_facets=_facet_list(exclude_facets),
                price_preference=PricePreference(
                    PricePreference.ANY
                    if price_preference is None
                    else price_preference
                ),
                debug=bool(debug),
            )
        data = await self._json(
            "moreLikeThisProducts", json=_body(resolved), timeout=timeout
        )
        return ProgrammaticMoreLikeThisResponse.model_validate(data)

    async def create_coverage_url_list(
        self,
        *,
        name: str | None = None,
        request: CoverageUrlListCreateRequest | None = None,
        timeout: Timeout | None = None,
    ) -> CoverageUrlList:
        """Create a coverage URL list (returns it in ``provisioning``)."""
        if request is not None:
            _reject_mixed("create_coverage_url_list", name=name)
            resolved = _require_model(
                "create_coverage_url_list", request, CoverageUrlListCreateRequest
            )
        elif name is None:
            raise TypeError("create_coverage_url_list() requires name or request")
        else:
            resolved = CoverageUrlListCreateRequest(name=name)
        data = await self._json("createUrlList", json=_body(resolved), timeout=timeout)
        return CoverageUrlList.model_validate(data)

    async def list_coverage_url_lists(
        self,
        *,
        cursor: str | None = None,
        limit: int | None = None,
        timeout: Timeout | None = None,
    ) -> CoverageUrlListPage:
        """List your organization's coverage URL lists, newest first."""
        data = await self._json(
            "listUrlLists",
            params={"cursor": cursor, "limit": limit},
            timeout=timeout,
        )
        return CoverageUrlListPage.model_validate(data)

    async def get_coverage_url_list(
        self, url_list_id: str, *, timeout: Timeout | None = None
    ) -> CoverageUrlList:
        """Get one coverage URL list by id."""
        data = await self._json(
            "getUrlList",
            path_params={"urlListId": url_list_id},
            timeout=timeout,
        )
        return CoverageUrlList.model_validate(data)

    async def delete_coverage_url_list(
        self, url_list_id: str, *, timeout: Timeout | None = None
    ) -> CoverageUrlList:
        """Delete a coverage URL list (returns it in ``delete_pending``).

        Deletion is asynchronous and permanent: there is no grace window and
        no restore. The name is released immediately.
        """
        data = await self._json(
            "deleteUrlList",
            path_params={"urlListId": url_list_id},
            timeout=timeout,
        )
        return CoverageUrlList.model_validate(data)

    async def add_coverage_url_list_urls(
        self,
        url_list_id: str,
        *,
        urls: Sequence[str] | None = None,
        request: CoverageUrlsRequest | None = None,
        timeout: Timeout | None = None,
    ) -> CoverageUrlMutationResponse:
        """Add URLs to a list — an idempotent set-add with per-URL outcomes."""
        body = _urls_request("add_coverage_url_list_urls", urls, request)
        data = await self._json(
            "addUrlListUrls",
            json=body,
            path_params={"urlListId": url_list_id},
            timeout=timeout,
        )
        return CoverageUrlMutationResponse.model_validate(data)

    async def remove_coverage_url_list_urls(
        self,
        url_list_id: str,
        *,
        urls: Sequence[str] | None = None,
        request: CoverageUrlsRequest | None = None,
        timeout: Timeout | None = None,
    ) -> CoverageUrlMutationResponse:
        """Remove URLs from a list — an idempotent set-remove."""
        body = _urls_request("remove_coverage_url_list_urls", urls, request)
        data = await self._json(
            "removeUrlListUrls",
            json=body,
            path_params={"urlListId": url_list_id},
            timeout=timeout,
        )
        return CoverageUrlMutationResponse.model_validate(data)

    async def check_coverage_url_list_urls(
        self,
        url_list_id: str,
        *,
        urls: Sequence[str] | None = None,
        request: CoverageUrlsRequest | None = None,
        timeout: Timeout | None = None,
    ) -> CoverageContainsResponse:
        """Check which URLs are members of a list (normalized server-side)."""
        body = _urls_request("check_coverage_url_list_urls", urls, request)
        data = await self._json(
            "checkUrlListUrls",
            json=body,
            path_params={"urlListId": url_list_id},
            timeout=timeout,
        )
        return CoverageContainsResponse.model_validate(data)

    async def list_coverage_url_list_urls(
        self,
        url_list_id: str,
        *,
        cursor: str | None = None,
        limit: int | None = None,
        timeout: Timeout | None = None,
    ) -> CoverageUrlListUrlsPage:
        """Enumerate a list's URLs in stable insertion order."""
        data = await self._json(
            "listUrlListUrls",
            params={"cursor": cursor, "limit": limit},
            path_params={"urlListId": url_list_id},
            timeout=timeout,
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
        timeout: Timeout | None = None,
    ) -> httpx.Response:
        """Issue one registry-declared operation and return the raw response.

        The verb and path template come from :data:`OPERATIONS`, so a method
        cannot reach a route the published contract does not define without
        ``tests/contract`` failing. Callers that only want the decoded body use
        :meth:`_json`; the ones that need a status code or a header — the
        ``ETag`` on
        ``listDomains`` — use this.

        ``timeout`` applies to this request only, including on an injected
        ``http_client``; ``None`` keeps the client's own timeout.
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
                timeout=httpx.USE_CLIENT_DEFAULT if timeout is None else timeout,
            )
        except httpx.TimeoutException as exc:
            raise OctogenTimeoutError(str(exc)) from exc
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
        timeout: Timeout | None = None,
    ) -> Any:
        """:meth:`_request` for the common case: return the decoded JSON body."""
        response = await self._request(
            operation_id,
            json=json,
            params=params,
            path_params=path_params,
            timeout=timeout,
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


def _body(request: BaseModel) -> dict[str, Any]:
    """A request model as its wire body, subclass fields included."""
    return request.model_dump(mode="json", by_alias=True, exclude_none=True)


def _require_model(
    operation: str, request: object, model: type[_RequestT]
) -> _RequestT:
    if not isinstance(request, model):
        raise TypeError(
            f"{operation}() request must be a {model.__name__}, "
            f"not {type(request).__name__}"
        )
    return request


def _reject_mixed(operation: str, **arguments: object) -> None:
    """A prebuilt ``request`` is sent as is; refuse keywords that would be lost."""
    passed = [name for name, value in arguments.items() if value is not None]
    if passed:
        raise TypeError(
            f"{operation}() takes either request or keyword arguments, not both "
            f"(got request and {', '.join(passed)})"
        )


def _lookup_request(
    operation: str,
    url: str | None,
    *,
    match_mode: ProductLookupMatchMode | str | None,
    resolution_mode: ProductLookupResolutionMode | str | None,
    on_demand_cache_policy: ProductLookupCachePolicy | str | None,
    request: ProgrammaticProductLookupRequest | None,
) -> dict[str, Any]:
    if request is not None:
        _reject_mixed(
            operation,
            url=url,
            match_mode=match_mode,
            resolution_mode=resolution_mode,
            on_demand_cache_policy=on_demand_cache_policy,
        )
        return _body(
            _require_model(operation, request, ProgrammaticProductLookupRequest)
        )
    if url is None:
        raise TypeError(f"{operation}() requires url or request")
    return _body(
        ProgrammaticProductLookupRequest(
            url=url,
            matchMode=(
                ProductLookupMatchMode(match_mode) if match_mode is not None else None
            ),
            resolutionMode=ProductLookupResolutionMode(
                ProductLookupResolutionMode.AUTO
                if resolution_mode is None
                else resolution_mode
            ),
            onDemandCachePolicy=ProductLookupCachePolicy(
                ProductLookupCachePolicy.PREFER_CACHE
                if on_demand_cache_policy is None
                else on_demand_cache_policy
            ),
        )
    )


def _urls_request(
    operation: str,
    urls: Sequence[str] | None,
    request: CoverageUrlsRequest | None,
) -> dict[str, Any]:
    if request is not None:
        _reject_mixed(operation, urls=urls)
        return _body(_require_model(operation, request, CoverageUrlsRequest))
    if urls is None:
        raise TypeError(f"{operation}() requires urls or request")
    return _body(CoverageUrlsRequest(urls=_url_batch(urls)))


def _catalog_list(catalogs: Sequence[str] | None) -> list[str] | None:
    # A bare string is a `Sequence[str]` too, and would otherwise go out as one
    # catalog key per character.
    if isinstance(catalogs, str):
        raise TypeError("catalogs must be a list of catalog keys, not a string")
    return None if catalogs is None else list(catalogs)


def _string_list(values: Sequence[str] | None, field: str) -> list[str] | None:
    # A bare string is a Sequence[str] too; refuse it rather than send one
    # entry per character.
    if isinstance(values, str):
        raise TypeError(f"{field} must be a list of strings, not a string")
    return None if values is None else list(values)


def _facet_list(
    facets: Sequence[Facet | dict[str, Any]] | None,
) -> list[Facet] | None:
    return None if facets is None else [_coerce_facet(facet) for facet in facets]


def _coerce_facet(value: Facet | dict[str, Any]) -> Facet:
    if isinstance(value, Facet):
        return value
    return Facet.model_validate(value)


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
            request_id=response.headers.get("x-request-id"),
        ) from exc


def _api_error_from_response(response: httpx.Response) -> OctogenAPIError:
    status = response.status_code
    detail = _error_detail(response)
    error_class = _ERROR_CLASSES.get(status)
    if error_class is None:
        error_class = OctogenServerError if status >= 500 else OctogenAPIError
    return error_class(
        _error_message(response, detail),
        status_code=status,
        detail=detail,
        response=response,
        request_id=response.headers.get("x-request-id"),
        retry_after=_parse_retry_after(response.headers.get("retry-after")),
    )


def _parse_retry_after(value: str | None) -> int | None:
    """Whole seconds to wait from a ``Retry-After`` header.

    Accepts delta-seconds (what Octogen sends) and an HTTP-date. ``None`` when
    the header is absent or unparseable; never negative.
    """
    if value is None:
        return None
    try:
        seconds = math.ceil(float(value))
    except (ValueError, OverflowError):
        try:
            when = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
        if when.tzinfo is None:
            when = when.replace(tzinfo=UTC)
        seconds = math.ceil((when - datetime.now(UTC)).total_seconds())
    return max(seconds, 0)


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
