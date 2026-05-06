"""Async client for the Octogen merchant programmatic API."""

from __future__ import annotations

import importlib.metadata as metadata
import json as json_module
import os
from collections.abc import Sequence
from pprint import pformat
from types import TracebackType
from typing import Any, Self

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
    Facet,
    MerchantCatalogSummary,
    MerchantProductListPage,
    MerchantProductUrlLookupResponse,
    ProgrammaticProductLookupRequest,
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

    async def list_catalogs(self) -> list[MerchantCatalogSummary]:
        """List active catalogs available to the API key's merchant."""
        data = await self._request("GET", "/catalogs")
        if not isinstance(data, list):
            raise OctogenAPIError("Expected catalog list response", detail=data)
        return [MerchantCatalogSummary.model_validate(item) for item in data]

    async def lookup_product(self, url: str) -> MerchantProductUrlLookupResponse:
        """Lookup a product by canonical URL across the merchant's catalogs."""
        request = ProgrammaticProductLookupRequest(url=url)
        data = await self._request(
            "POST",
            "/products/lookup",
            json=request.model_dump(mode="json", by_alias=True, exclude_none=True),
        )
        return MerchantProductUrlLookupResponse.model_validate(data)

    async def search_products(
        self,
        *,
        catalog: str,
        q: str | None = None,
        text_search_query: TextSearchQuery | dict[str, Any] | None = None,
        facets: Sequence[Facet | dict[str, Any]] | None = None,
        price_min: float | None = None,
        price_max: float | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> MerchantProductListPage:
        """Search products in a single authorized catalog."""
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

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> Any:
        headers = self._headers()
        content: str | None = None
        if json is not None:
            headers["Content-Type"] = "application/json"
            content = json_module.dumps(json, separators=(",", ":"))

        try:
            response = await self._client.request(
                method,
                self._url(path),
                headers=headers,
                content=content,
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
