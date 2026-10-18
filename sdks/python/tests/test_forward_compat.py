"""Responses from a newer server still parse; markdown lookup returns its headers."""

from __future__ import annotations

import json

import httpx
import pydantic
import pytest
import respx
from octogen_ai_sdk import (
    CoverageUrlList,
    DomainEntry,
    MerchantProductUrlLookupResponse,
    MeResponse,
    OctogenAPIError,
    OctogenClient,
    OctogenNotFoundError,
    ProductMarkdownLookupResult,
    ProgrammaticProductLookupRequest,
    ProgrammaticProductSearchPage,
)
from octogen_ai_sdk.generated import models as contract

BASE_URL = "https://api.octogen.ai/v1"
PRODUCT = {"uuid": "product-1", "productUrl": "https://example.com/p"}


# ── S4: open response enums ─────────────────────────────────────────────────


@respx.mock
async def test_lookup_with_unknown_enum_values_parses() -> None:
    respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(
            200,
            json={
                "source": "something_new",
                "cacheStatus": "warm",
                "matchedVia": "learned_alias:r-42",
                "resolution": {"completeness": "mostly", "method": "vision"},
                "product": PRODUCT,
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        lookup = await client.lookup_product("https://example.com/p")

    assert lookup.source == "something_new"
    assert lookup.cache_status == "warm"
    assert lookup.matched_via == "learned_alias:r-42"
    assert lookup.resolution is not None
    assert lookup.resolution.completeness == "mostly"
    assert lookup.resolution.method == "vision"


def test_matched_via_is_declared_and_optional() -> None:
    lookup = MerchantProductUrlLookupResponse.model_validate(
        {"source": "on_demand", "product": PRODUCT}
    )

    assert lookup.matched_via is None
    assert "matchedVia" not in (lookup.model_extra or {})


def test_search_page_with_unknown_facet_source_parses() -> None:
    page = ProgrammaticProductSearchPage.model_validate(
        {
            "items": [],
            "effectiveQuery": {
                "text": "dress",
                "understood": True,
                "facets": [
                    {"name": "color", "values": ["red"], "source": "fallback"},
                ],
            },
        }
    )

    assert page.effective_query is not None
    assert page.effective_query.facets is not None
    assert page.effective_query.facets[0].source == "fallback"


def test_unknown_coverage_list_status_parses() -> None:
    url_list = CoverageUrlList.model_validate(
        {
            "urlListId": "list-1",
            "name": "tops",
            "status": "archived",
            "urlCount": 0,
            "createdAt": "2026-10-14T00:00:00Z",
            "updatedAt": "2026-10-14T00:00:00Z",
        }
    )

    assert url_list.status == "archived"


def test_request_enums_stay_closed() -> None:
    with pytest.raises(pydantic.ValidationError):
        ProgrammaticProductLookupRequest(url="https://example.com/p", matchMode="fuzzy")  # ty: ignore[invalid-argument-type]
    with pytest.raises(pydantic.ValidationError):
        contract.ProgrammaticProductLookupRequest.model_validate(
            {"url": "https://example.com/p", "matchMode": "fuzzy"}
        )


# ── S4: unknown response fields are kept ────────────────────────────────────


def test_unknown_effective_query_keys_survive_model_dump() -> None:
    wire = {
        "text": "dress",
        "understood": True,
        "newSignal": {"score": 0.9},
        "facets": [
            {"name": "color", "values": ["red"], "source": "caller", "weight": 2}
        ],
        "relaxation": {"rounds": 1, "droppedFacets": [], "strategy": "staged"},
    }
    page = ProgrammaticProductSearchPage.model_validate(
        {"items": [], "effectiveQuery": wire}
    )

    assert page.effective_query is not None
    dumped = page.effective_query.model_dump(by_alias=True, exclude_none=True)
    assert dumped["newSignal"] == {"score": 0.9}
    assert dumped["facets"][0]["weight"] == 2
    assert dumped["relaxation"]["strategy"] == "staged"


def test_me_and_domain_models_keep_unknown_fields() -> None:
    me = MeResponse.model_validate(
        {
            "principal": "api_key",
            "region": "us",
            "organization": {
                "id": "org-1",
                "name": "Acme",
                "slug": "acme",
                "type": "merchant",
                "tier": "gold",
            },
        }
    )
    domain = DomainEntry.model_validate(
        {
            "catalog": "acme",
            "catalogDisplayName": "Acme",
            "host": "acme.com",
            "priority": 3,
        }
    )

    assert me.model_dump(by_alias=True)["region"] == "us"
    assert me.organization is not None
    assert me.organization.model_extra == {"tier": "gold"}
    assert domain.model_extra == {"priority": 3}


@pytest.mark.parametrize(
    "model",
    [
        contract.ProgrammaticProductSearchEffectiveQuery,
        contract.ProgrammaticProductSearchEffectiveFacet,
        contract.ProgrammaticProductSearchRelaxation,
        contract.MeResponse,
        contract.MeKey,
        contract.MeOrganization,
        contract.MeQuotas,
        contract.MeRateLimit,
        contract.DomainEntry,
        contract.ListDomainsResponse,
    ],
)
def test_generated_response_models_allow_extra(model: type[pydantic.BaseModel]) -> None:
    assert model.model_config.get("extra") == "allow"


@pytest.mark.parametrize(
    "model",
    [
        contract.ProgrammaticProductSearchRequest,
        contract.ProgrammaticProductLookupRequest,
        contract.CoverageUrlsRequest,
    ],
)
def test_generated_request_models_still_forbid_extra(
    model: type[pydantic.BaseModel],
) -> None:
    assert model.model_config.get("extra") == "forbid"


# ── S5: markdown lookup ─────────────────────────────────────────────────────

MARKDOWN = "# Linen Dress\n\n**$128** at ACME\n"
IDENTITY_HEADERS = {
    "content-type": "text/markdown; charset=utf-8",
    "x-request-id": "req-md",
    "x-octogen-product-uuid": "product-1",
    "x-octogen-catalog": "acme",
    "x-octogen-matched-via": "normalized_exact",
    "x-octogen-normalized-url": "https://example.com/p",
}


@respx.mock
async def test_lookup_product_markdown_returns_markdown_and_headers() -> None:
    route = respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(200, text=MARKDOWN, headers=IDENTITY_HEADERS)
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.lookup_product_markdown(
            "https://example.com/p?utm=x",
            match_mode="strict",
            resolution_mode="index_only",
            timeout=3.0,
        )

    request = route.calls.last.request
    assert request.headers["Accept"] == "text/markdown"
    assert json.loads(request.read()) == {
        "url": "https://example.com/p?utm=x",
        "matchMode": "strict",
        "resolutionMode": "index_only",
        "onDemandCachePolicy": "prefer_cache",
        "format": "markdown",
    }
    assert request.extensions["timeout"]["read"] == 3.0
    assert result == ProductMarkdownLookupResult(
        markdown=MARKDOWN,
        request_id="req-md",
        product_uuid="product-1",
        catalog="acme",
        matched_via="normalized_exact",
        normalized_url="https://example.com/p",
    )


@respx.mock
async def test_lookup_product_markdown_headers_are_optional() -> None:
    respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(
            200, text=MARKDOWN, headers={"content-type": "text/markdown"}
        )
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.lookup_product_markdown(
            request=ProgrammaticProductLookupRequest(url="https://example.com/p")
        )

    assert result.markdown == MARKDOWN
    assert result.product_uuid is None
    assert result.matched_via is None


@respx.mock
async def test_lookup_product_markdown_refuses_a_json_body() -> None:
    respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(
            200,
            json={"source": "indexed", "product": PRODUCT},
            headers={"x-request-id": "req-json"},
        )
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenAPIError, match="JSON where Markdown") as exc_info:
            await client.lookup_product_markdown("https://example.com/p")

    assert exc_info.value.request_id == "req-json"


@respx.mock
async def test_lookup_product_markdown_raises_typed_errors() -> None:
    respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(
            404, json={"detail": "product_not_found"}, headers={"x-request-id": "r"}
        )
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenNotFoundError) as exc_info:
            await client.lookup_product_markdown("https://example.com/missing")

    assert exc_info.value.request_id == "r"
