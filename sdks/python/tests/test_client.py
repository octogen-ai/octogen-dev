from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx
import octogen_ai_sdk
import pytest
import respx
from octogen_ai_sdk import (
    API_KEY_ENV_VAR,
    DEPRECATED_API_KEY_ENV_VAR,
    Attribute,
    AttributeValue,
    CanonicalBrand,
    CanonicalBrandEnrichment,
    EmbeddingColumn,
    FacetName,
    HTTPValidationError,
    MissingAPIKeyError,
    OctogenAPIError,
    OctogenClient,
    OctogenConnectionError,
    OctogenNotFoundError,
    PricePreference,
    ProductLookupCachePolicy,
    ProductLookupResolutionMode,
    ProductResolutionMetadata,
    ProgrammaticMoreLikeThisSource,
    ProgrammaticProductLookupRequest,
    ProgrammaticProductRefreshTarget,
    TextSearchQuery,
    ValidationErrorModel,
    VoyageStatus,
)

BASE_URL = "https://api.octogen.ai/v1"

FIXTURES = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "platform-v1"


def fixture(name: str) -> Any:
    """Load a fixture shared with the TypeScript suite and the conformance tests."""
    return json.loads((FIXTURES / f"{name}.json").read_text())


@pytest.fixture(autouse=True)
def _clear_api_key_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """No test may accidentally authenticate from the developer's own shell."""
    monkeypatch.delenv(API_KEY_ENV_VAR, raising=False)
    monkeypatch.delenv(DEPRECATED_API_KEY_ENV_VAR, raising=False)


def test_public_model_exports_are_available() -> None:
    assert octogen_ai_sdk.Attribute is Attribute
    assert octogen_ai_sdk.AttributeValue is AttributeValue
    assert octogen_ai_sdk.CanonicalBrand is CanonicalBrand
    assert octogen_ai_sdk.CanonicalBrandEnrichment is CanonicalBrandEnrichment
    assert octogen_ai_sdk.HTTPValidationError is HTTPValidationError
    assert octogen_ai_sdk.PricePreference is PricePreference
    assert octogen_ai_sdk.ProductLookupCachePolicy is ProductLookupCachePolicy
    assert octogen_ai_sdk.ProductLookupResolutionMode is ProductLookupResolutionMode
    assert octogen_ai_sdk.ProductResolutionMetadata is ProductResolutionMetadata
    assert (
        octogen_ai_sdk.ProgrammaticMoreLikeThisSource is ProgrammaticMoreLikeThisSource
    )
    assert (
        octogen_ai_sdk.ProgrammaticProductRefreshTarget
        is ProgrammaticProductRefreshTarget
    )
    assert octogen_ai_sdk.ValidationErrorModel is ValidationErrorModel


def test_lookup_request_requires_url() -> None:
    with pytest.raises(ValueError):
        ProgrammaticProductLookupRequest.model_validate({})


def test_lookup_request_rejects_refresh_for_index_only() -> None:
    with pytest.raises(ValueError, match="does not apply to index_only"):
        ProgrammaticProductLookupRequest(
            url="https://example.com/products/linen-dress",
            resolutionMode=ProductLookupResolutionMode.INDEX_ONLY,
            onDemandCachePolicy=ProductLookupCachePolicy.REFRESH,
        )


def test_refresh_target_requires_exactly_one_identifier() -> None:
    with pytest.raises(ValueError):
        ProgrammaticProductRefreshTarget.model_validate({})

    with pytest.raises(ValueError):
        ProgrammaticProductRefreshTarget.model_validate(
            {"url": "https://example.com/p", "uuid": "product-1"}
        )


def test_more_like_this_source_requires_exactly_one_identifier() -> None:
    with pytest.raises(ValueError):
        ProgrammaticMoreLikeThisSource.model_validate({})

    with pytest.raises(ValueError):
        ProgrammaticMoreLikeThisSource.model_validate(
            {"url": "https://example.com/p", "uuid": "product-1"}
        )


def test_client_requires_api_key() -> None:
    with pytest.raises(MissingAPIKeyError, match=API_KEY_ENV_VAR):
        OctogenClient()


@respx.mock
async def test_search_products_uses_env_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(API_KEY_ENV_VAR, "octo_test_key")
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(
            200,
            json={"items": [], "nextCursor": None},
        )
    )

    async with OctogenClient() as client:
        await client.search_products(q="shirt", limit=1)

    assert route.called
    assert route.calls.last.request.headers["Authorization"] == "Bearer octo_test_key"
    assert route.calls.last.request.headers["User-Agent"].startswith(
        "octogen-ai-sdk-python/"
    )


@respx.mock
async def test_refresh_products_sends_typed_request() -> None:
    route = respx.post(f"{BASE_URL}/products/refresh").mock(
        return_value=httpx.Response(202, json=fixture("product-refresh"))
    )

    async with OctogenClient(api_key="key") as client:
        response = await client.refresh_products(
            targets=[
                {
                    "catalog": "acme",
                    "url": "https://shop.acme.example/products/linen-dress",
                },
                ProgrammaticProductRefreshTarget(uuid="missing-product"),
            ],
        )

    request = route.calls.last.request
    assert request.read() == (
        b'{"targets":[{"url":"https://shop.acme.example/products/linen-dress",'
        b'"catalog":"acme"},{"uuid":"missing-product"}]}'
    )
    assert response.submitted == 2
    assert response.workflow_status == "launched"
    assert response.workflow_attempts == 1
    assert response.accepted[0].catalog == "acme"
    assert response.rejected[0].code == "product_not_found"
    assert response.rejected[0].target.uuid == "missing-product"


async def test_deprecated_env_var_still_works_but_warns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(DEPRECATED_API_KEY_ENV_VAR, "octo_legacy_key")

    with pytest.warns(DeprecationWarning, match=API_KEY_ENV_VAR):
        async with OctogenClient() as client:
            assert client._headers()["Authorization"] == "Bearer octo_legacy_key"


async def test_primary_env_var_wins_and_does_not_warn(
    monkeypatch: pytest.MonkeyPatch,
    recwarn: pytest.WarningsRecorder,
) -> None:
    monkeypatch.setenv(API_KEY_ENV_VAR, "octo_current_key")
    monkeypatch.setenv(DEPRECATED_API_KEY_ENV_VAR, "octo_legacy_key")

    async with OctogenClient() as client:
        assert client._headers()["Authorization"] == "Bearer octo_current_key"

    assert not [w for w in recwarn if issubclass(w.category, DeprecationWarning)]


@respx.mock
async def test_list_domains_returns_the_covered_set_and_etag() -> None:
    route = respx.get(f"{BASE_URL}/domains").mock(
        return_value=httpx.Response(
            200,
            json=fixture("list-domains"),
            headers={"ETag": '"domains-v1"'},
        )
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.list_domains()

    assert route.called
    assert result.not_modified is False
    assert result.etag == '"domains-v1"'
    assert result.domains is not None
    assert [entry.host for entry in result.domains] == [
        "allbirds.com",
        "www.allbirds.com",
        "shop.acme.example",
    ]
    assert result.domains[0].catalog_display_name == "Allbirds"


@respx.mock
async def test_list_domains_revalidates_with_if_none_match() -> None:
    route = respx.get(f"{BASE_URL}/domains").mock(
        return_value=httpx.Response(304, headers={"ETag": '"domains-v1"'})
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.list_domains(if_none_match='"domains-v1"')

    assert route.calls.last.request.headers["If-None-Match"] == '"domains-v1"'
    assert result.not_modified is True
    assert result.domains is None
    assert result.etag == '"domains-v1"'


@respx.mock
async def test_resolve_product_from_html_sends_html_and_url() -> None:
    route = respx.post(f"{BASE_URL}/products/resolve-from-html").mock(
        return_value=httpx.Response(200, json=fixture("resolve-from-html"))
    )

    async with OctogenClient(api_key="key") as client:
        response = await client.resolve_product_from_html(
            html="<html><body>x</body></html>",
            url="https://shop.acme.example/products/linen-dress?variant=blue",
        )

    assert json.loads(route.calls.last.request.read()) == {
        "html": "<html><body>x</body></html>",
        "url": "https://shop.acme.example/products/linen-dress?variant=blue",
    }
    assert response.product.title == "Linen Dress"
    # The discriminant this path — and only this path — returns. A model that
    # rejects it makes every successful resolve raise a ValidationError.
    assert response.source == "client_html"
    # On a storefront that records the variant only in the query string, the
    # echoed request URL is the sole variant-qualified identity in the response.
    assert response.requested_url == (
        "https://shop.acme.example/products/linen-dress?variant=blue"
    )


@respx.mock
async def test_resolve_product_from_html_omits_absent_url() -> None:
    route = respx.post(f"{BASE_URL}/products/resolve-from-html").mock(
        return_value=httpx.Response(200, json=fixture("resolve-from-html"))
    )

    async with OctogenClient(api_key="key") as client:
        await client.resolve_product_from_html(html="<html></html>")

    assert json.loads(route.calls.last.request.read()) == {"html": "<html></html>"}


async def test_resolve_product_from_html_rejects_empty_html() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError):
            await client.resolve_product_from_html(html="")


@respx.mock
async def test_start_voyage_reports_a_fresh_dispatch() -> None:
    route = respx.post(f"{BASE_URL}/voyage").mock(
        return_value=httpx.Response(202, json=fixture("voyage-task-running"))
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.start_voyage("shop.acme.example")

    assert json.loads(route.calls.last.request.read()) == {
        "domain": "shop.acme.example"
    }
    assert result.joined is False
    assert result.task.status == VoyageStatus.RUNNING
    assert result.task.phase_label == "Sampling products"


@respx.mock
async def test_start_voyage_reports_a_join_that_consumes_no_quota() -> None:
    respx.post(f"{BASE_URL}/voyage").mock(
        return_value=httpx.Response(200, json=fixture("voyage-task-completed"))
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.start_voyage("https://allbirds.com/collections/all")

    assert result.joined is True
    assert result.task.result is not None
    assert result.task.result.catalog == "allbirds"
    assert result.task.result.product_count == 412


@respx.mock
async def test_list_voyages_filters_and_reports_quotas() -> None:
    route = respx.get(f"{BASE_URL}/voyage").mock(
        return_value=httpx.Response(200, json=fixture("voyage-list"))
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.list_voyages(status=VoyageStatus.RUNNING, limit=10)

    assert route.calls.last.request.url.params["status"] == "running"
    assert route.calls.last.request.url.params["limit"] == "10"
    assert len(page.items) == 2
    assert page.quotas is not None
    assert page.quotas.monthly.used == 4
    assert page.quotas.concurrent.limit == 3


@respx.mock
async def test_get_voyage_polls_one_task() -> None:
    task_id = "voyage_01J8Z4M0000000000000000001"
    route = respx.get(f"{BASE_URL}/voyage/{task_id}").mock(
        return_value=httpx.Response(200, json=fixture("voyage-task-completed"))
    )

    async with OctogenClient(api_key="key") as client:
        task = await client.get_voyage(task_id)

    assert route.called
    assert task.progress_percent == 100
    assert task.task_id == task_id


@respx.mock
async def test_get_voyage_raises_not_found_for_another_orgs_task() -> None:
    respx.get(f"{BASE_URL}/voyage/unknown").mock(
        return_value=httpx.Response(404, json={"detail": "voyage_not_found"})
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenNotFoundError, match="voyage_not_found"):
            await client.get_voyage("unknown")


@respx.mock
async def test_search_products_sends_typed_request() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "items": [
                    {
                        "uuid": "product-1",
                        "productUrl": "https://example.com/products/linen-dress",
                        "title": "Linen Dress",
                        "brand": {"name": "ACME", "slug": "acme"},
                        "currentPrice": 128.0,
                        "imageUrl": "https://example.com/image.jpg",
                    }
                ],
                "nextCursor": "cursor-2",
            },
        )
    )

    async with OctogenClient(api_key="explicit_key") as client:
        page = await client.search_products(
            catalog="acme",
            q="linen summer dress",
            facets=[{"name": FacetName.GENDER, "values": ["female"]}],
            limit=5,
        )

    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer explicit_key"
    assert request.read() == (
        b'{"catalog":"acme","limit":5,"q":"linen summer dress",'
        b'"facets":[{"name":"gender","values":["female"]}]}'
    )
    assert page.next_cursor == "cursor-2"
    assert page.items[0].title == "Linen Dress"
    assert page.items[0].brand is not None
    assert page.items[0].brand.name == "ACME"


@respx.mock
async def test_search_products_omits_catalog_for_all_catalog_search() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json={"items": [], "nextCursor": None})
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_products(q="linen summer dress", limit=5)

    request = route.calls.last.request
    assert request.read() == b'{"limit":5,"q":"linen summer dress"}'


@respx.mock
async def test_search_products_accepts_text_search_query_model() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json={"items": [], "nextCursor": None})
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_products(
            catalog="acme",
            text_search_query=TextSearchQuery(
                text="relaxed cotton shirts",
                retrieval_embedding_columns=[EmbeddingColumn.STYLE_EMBEDDING],
            ),
        )

    body = route.calls.last.request.read()
    assert b'"text_search_query"' in body
    assert b'"style_embedding"' in body


@respx.mock
async def test_more_like_this_products_sends_typed_request() -> None:
    route = respx.post(f"{BASE_URL}/products/more-like-this").mock(
        return_value=httpx.Response(
            200,
            json={
                "source": {
                    "catalogKey": "acme",
                    "uuid": "product-1",
                    "productUrl": "https://example.com/products/linen-dress",
                    "title": "Linen Dress",
                },
                "items": [
                    {
                        "uuid": "product-2",
                        "catalogKey": "acme",
                        "productUrl": "https://example.com/products/cotton-dress",
                        "title": "Cotton Dress",
                        "currentPrice": 98,
                        "isActive": True,
                        "displayMatchScore": 92,
                    }
                ],
                "nextCursor": None,
                "effectiveQuery": {
                    "text": "linen dress",
                    "retrievalEmbeddingColumns": [
                        "style_embedding",
                        "tags_embedding",
                    ],
                    "facets": [{"name": "gender", "values": ["female"]}],
                    "priceMin": 128,
                    "limit": 3,
                },
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.more_like_this_products(
            source_url="https://example.com/products/linen-dress",
            catalog="acme",
            include_facets=[{"name": FacetName.GENDER, "values": ["female"]}],
            exclude_facets=[{"name": FacetName.COLOR_FAMILY, "values": ["Black"]}],
            price_preference=PricePreference.HIGHER,
            limit=3,
            debug=True,
        )

    request = route.calls.last.request
    assert json.loads(request.read()) == {
        "source": {"url": "https://example.com/products/linen-dress"},
        "catalog": "acme",
        "limit": 3,
        "include_facets": [{"name": "gender", "values": ["female"]}],
        "exclude_facets": [{"name": "color_family", "values": ["Black"]}],
        "price_preference": "higher",
        "debug": True,
    }
    assert page.source.catalog_key == "acme"
    assert page.items[0].catalog_key == "acme"
    assert page.items[0].display_match_score == 92
    assert page.effective_query is not None
    assert page.effective_query.price_min == 128


@respx.mock
async def test_lookup_product_parses_full_response() -> None:
    route = respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(
            200,
            json={
                "source": "indexed",
                "catalogKey": "acme",
                "catalogDisplayName": "ACME",
                "sourceBaseUrl": "https://example.com",
                "requestedUrl": "https://example.com/products/linen-dress",
                "normalizedUrl": "https://example.com/products/linen-dress",
                "product": {
                    "uuid": "product-1",
                    "productUrl": "https://example.com/products/linen-dress",
                    "title": "Linen Dress",
                    "inStock": True,
                    "images": ["https://example.com/image.jpg"],
                    "details": {"materials": ["linen"], "fit": ["relaxed"]},
                    "audience": {"genders": ["female"], "ageGroups": ["adult"]},
                },
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.lookup_product("https://example.com/products/linen-dress")

    assert result.catalog_key == "acme"
    assert result.normalized_url == "https://example.com/products/linen-dress"
    assert result.canonical_url is None
    assert result.product.in_stock is True
    assert result.product.details.materials == ["linen"]
    assert result.product.audience is not None
    assert result.product.audience.age_groups == ["adult"]
    assert json.loads(route.calls.last.request.read()) == {
        "url": "https://example.com/products/linen-dress",
        "resolutionMode": "auto",
        "onDemandCachePolicy": "prefer_cache",
    }


@respx.mock
async def test_lookup_product_sends_controls_and_parses_on_demand_response() -> None:
    route = respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(
            200,
            json={
                "requestId": "request-1",
                "source": "on_demand",
                "catalogKey": None,
                "catalogDisplayName": None,
                "sourceBaseUrl": None,
                "requestedUrl": "https://example.com/products/linen-dress",
                "resolvedUrl": "https://example.com/products/linen-dress",
                "canonicalUrl": "https://example.com/products/linen-dress",
                "product": {
                    "uuid": None,
                    "catalogKey": None,
                    "productUrl": "https://example.com/products/linen-dress",
                    "title": "Linen Dress",
                    "currentPrice": 128,
                    "currency": "USD",
                    "isActive": None,
                },
                "resolution": {
                    "completeness": "partial",
                    "method": "json_ld",
                    "rendered": False,
                    "missingFields": ["brand"],
                },
                "cacheStatus": "refresh",
                "warnings": ["missing_brand"],
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.lookup_product(
            "https://example.com/products/linen-dress",
            resolution_mode=ProductLookupResolutionMode.ON_DEMAND_ONLY,
            on_demand_cache_policy=ProductLookupCachePolicy.REFRESH,
        )

    assert result.source == "on_demand"
    assert result.catalog_key is None
    assert result.product.uuid is None
    assert result.product.is_active is None
    assert result.product.currency == "USD"
    assert result.resolution is not None
    assert result.resolution.missing_fields == ["brand"]
    assert result.cache_status == "refresh"
    assert result.warnings == ["missing_brand"]
    assert json.loads(route.calls.last.request.read()) == {
        "url": "https://example.com/products/linen-dress",
        "resolutionMode": "on_demand_only",
        "onDemandCachePolicy": "refresh",
    }


@respx.mock
async def test_api_errors_include_status_and_detail() -> None:
    respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(404, json={"detail": "product_not_found"})
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenNotFoundError) as exc_info:
            await client.lookup_product("https://example.com/missing")

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "product_not_found"


@respx.mock
async def test_rate_limit_errors_include_status_and_detail() -> None:
    respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(429, json={"detail": "rate_limited"})
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenAPIError) as exc_info:
            await client.lookup_product("https://example.com/product")

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "rate_limited"


@respx.mock
async def test_connection_errors_are_wrapped() -> None:
    respx.post(f"{BASE_URL}/products/lookup").mock(
        side_effect=httpx.ConnectTimeout("request timed out")
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenConnectionError) as exc_info:
            await client.lookup_product("https://example.com/product")

    assert "request timed out" in str(exc_info.value)


async def test_no_content_response_returns_none() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(204))
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = OctogenClient(
            api_key="key",
            base_url=BASE_URL,
            http_client=http_client,
        )

        assert await client._request("DELETE", "/products/lookup") is None


async def test_api_key_can_be_passed_without_mutating_env() -> None:
    async with OctogenClient(api_key="key") as client:
        assert os.getenv(API_KEY_ENV_VAR) is None
        assert client._headers()["Authorization"] == "Bearer key"


LIST_ID = "cul_01HZY3WQ8K4V9P2M5X7R00AA"
LIST_JSON = {
    "urlListId": LIST_ID,
    "name": "q3-campaign",
    "status": "active",
    "urlCount": 2,
    "bigQuery": {
        "exchangeId": "catalogs_prod",
        "listingId": f"coverage_{LIST_ID}_v1",
        "sharedDatasetId": f"coverage_share_{LIST_ID}_v1",
        "viewId": "products_current_v1",
        "lastExportedAt": "2026-08-06T06:30:00Z",
        "lastRowCount": 1128,
        "readerCount": 1,
    },
    "createdAt": "2026-08-05T12:00:00Z",
    "updatedAt": "2026-08-06T06:30:00Z",
}


@respx.mock
async def test_create_coverage_url_list_sends_typed_request() -> None:
    provisioning: dict[str, object] = {
        **LIST_JSON,
        "status": "provisioning",
        "urlCount": 0,
        "bigQuery": None,
    }
    route = respx.post(f"{BASE_URL}/coverage/url-lists").mock(
        return_value=httpx.Response(201, json=provisioning)
    )

    async with OctogenClient(api_key="key") as client:
        url_list = await client.create_coverage_url_list(name="q3-campaign")

    assert route.calls.last.request.read() == b'{"name":"q3-campaign"}'
    assert url_list.url_list_id == LIST_ID
    assert url_list.status == "provisioning"
    assert url_list.big_query is None


@respx.mock
async def test_list_coverage_url_lists_sends_pagination_params() -> None:
    route = respx.get(f"{BASE_URL}/coverage/url-lists").mock(
        return_value=httpx.Response(
            200, json={"items": [LIST_JSON], "nextCursor": "cursor-2"}
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.list_coverage_url_lists(cursor="cursor-1", limit=10)

    params = route.calls.last.request.url.params
    assert params["cursor"] == "cursor-1"
    assert params["limit"] == "10"
    assert page.next_cursor == "cursor-2"
    assert page.items[0].big_query is not None
    assert page.items[0].big_query.reader_count == 1


@respx.mock
async def test_get_coverage_url_list_quotes_path_segment() -> None:
    route = respx.get(f"{BASE_URL}/coverage/url-lists/{LIST_ID}").mock(
        return_value=httpx.Response(200, json=LIST_JSON)
    )

    async with OctogenClient(api_key="key") as client:
        url_list = await client.get_coverage_url_list(LIST_ID)

    # No stray query string when no params are passed.
    assert (
        str(route.calls.last.request.url) == f"{BASE_URL}/coverage/url-lists/{LIST_ID}"
    )
    assert url_list.url_count == 2
    assert url_list.big_query is not None
    assert url_list.big_query.view_id == "products_current_v1"


@respx.mock
async def test_delete_coverage_url_list_returns_delete_pending() -> None:
    respx.delete(f"{BASE_URL}/coverage/url-lists/{LIST_ID}").mock(
        return_value=httpx.Response(202, json={**LIST_JSON, "status": "delete_pending"})
    )

    async with OctogenClient(api_key="key") as client:
        url_list = await client.delete_coverage_url_list(LIST_ID)

    assert url_list.status == "delete_pending"


@respx.mock
async def test_add_coverage_url_list_urls_reports_per_url_outcomes() -> None:
    route = respx.post(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls").mock(
        return_value=httpx.Response(
            200,
            json={
                "accepted": [
                    {
                        "url": "https://shop.example/products/dress?utm_source=x",
                        "normalizedUrl": "https://shop.example/products/dress",
                    }
                ],
                "rejected": [
                    {
                        "url": "not-a-url",
                        "code": "invalid_url",
                        "message": "URL must be absolute http(s).",
                    }
                ],
                "urlCount": 3,
                "requestId": "req-1",
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.add_coverage_url_list_urls(
            LIST_ID,
            urls=["https://shop.example/products/dress?utm_source=x", "not-a-url"],
        )

    assert json.loads(route.calls.last.request.read()) == {
        "urls": ["https://shop.example/products/dress?utm_source=x", "not-a-url"]
    }
    assert result.accepted[0].normalized_url == "https://shop.example/products/dress"
    assert result.rejected[0].code == "invalid_url"
    assert result.url_count == 3
    assert result.request_id == "req-1"


@respx.mock
async def test_remove_and_check_coverage_url_list_urls() -> None:
    respx.post(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls/remove").mock(
        return_value=httpx.Response(
            200,
            json={"accepted": [], "rejected": [], "urlCount": 1, "requestId": "req-2"},
        )
    )
    respx.post(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls/contains").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "url": "https://shop.example/products/dress",
                        "normalizedUrl": "https://shop.example/products/dress",
                        "present": True,
                        "addedAt": "2026-08-05T12:00:00Z",
                    },
                    {
                        "url": "https://shop.example/products/coat",
                        "normalizedUrl": "https://shop.example/products/coat",
                        "present": False,
                        "addedAt": None,
                    },
                ]
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        removed = await client.remove_coverage_url_list_urls(
            LIST_ID, urls=["https://shop.example/products/skirt"]
        )
        contains = await client.check_coverage_url_list_urls(
            LIST_ID,
            urls=[
                "https://shop.example/products/dress",
                "https://shop.example/products/coat",
            ],
        )

    assert removed.url_count == 1
    assert [r.present for r in contains.results] == [True, False]
    assert contains.results[1].added_at is None


@respx.mock
async def test_list_coverage_url_list_urls_paginates() -> None:
    route = respx.get(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls").mock(
        return_value=httpx.Response(
            200,
            json={
                "items": [
                    {
                        "url": "https://shop.example/products/dress?utm_source=x",
                        "normalizedUrl": "https://shop.example/products/dress",
                        "addedAt": "2026-08-05T12:00:00Z",
                    }
                ],
                "nextCursor": None,
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.list_coverage_url_list_urls(LIST_ID, limit=500)

    assert route.calls.last.request.url.params["limit"] == "500"
    assert "cursor" not in route.calls.last.request.url.params
    assert page.items[0].normalized_url == "https://shop.example/products/dress"
    assert page.next_cursor is None


@respx.mock
async def test_url_batch_rejects_scalar_string() -> None:
    route = respx.post(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls").mock(
        return_value=httpx.Response(
            200, json={"accepted": [], "rejected": [], "urlCount": 0, "requestId": "r"}
        )
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(TypeError, match="sequence of URL strings"):
            await client.add_coverage_url_list_urls(
                LIST_ID,
                urls="https://shop.example/products/dress",  # type: ignore[arg-type]
            )
        with pytest.raises(TypeError, match="sequence of URL strings"):
            await client.remove_coverage_url_list_urls(LIST_ID, urls="x")  # type: ignore[arg-type]
        with pytest.raises(TypeError, match="sequence of URL strings"):
            await client.check_coverage_url_list_urls(LIST_ID, urls="x")  # type: ignore[arg-type]

    assert not route.called
