from __future__ import annotations

import json
import os

import httpx
import octogen_ai_sdk
import pytest
import respx
from octogen_ai_sdk import (
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
    ProgrammaticProductRecrawlTarget,
    TextSearchQuery,
    ValidationErrorModel,
)

BASE_URL = "https://api.octogen.ai/v1"


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
        octogen_ai_sdk.ProgrammaticProductRecrawlTarget
        is ProgrammaticProductRecrawlTarget
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


def test_recrawl_target_requires_exactly_one_identifier() -> None:
    with pytest.raises(ValueError):
        ProgrammaticProductRecrawlTarget.model_validate({})

    with pytest.raises(ValueError):
        ProgrammaticProductRecrawlTarget.model_validate(
            {"url": "https://example.com/p", "uuid": "product-1"}
        )


def test_more_like_this_source_requires_exactly_one_identifier() -> None:
    with pytest.raises(ValueError):
        ProgrammaticMoreLikeThisSource.model_validate({})

    with pytest.raises(ValueError):
        ProgrammaticMoreLikeThisSource.model_validate(
            {"url": "https://example.com/p", "uuid": "product-1"}
        )


def test_client_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OCTO_API_KEY", raising=False)

    with pytest.raises(MissingAPIKeyError):
        OctogenClient()


@respx.mock
async def test_search_products_uses_env_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OCTO_API_KEY", "octo_test_key")
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
async def test_recrawl_products_sends_typed_request() -> None:
    route = respx.post(f"{BASE_URL}/products/recrawl").mock(
        return_value=httpx.Response(
            202,
            json={
                "requestId": "request-1",
                "submitted": 2,
                "tasksCreated": 1,
                "taskIds": ["recrawl-request-1-acme-0001-products"],
                "accepted": [
                    {
                        "catalog": "acme",
                        "url": "https://example.com/products/linen-dress",
                    }
                ],
                "rejected": [
                    {
                        "target": {"uuid": "missing-product"},
                        "code": "product_not_found",
                        "message": "No active product matched that UUID.",
                    }
                ],
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        response = await client.recrawl_products(
            targets=[
                {
                    "catalog": "acme",
                    "url": "https://example.com/products/linen-dress",
                },
                ProgrammaticProductRecrawlTarget(uuid="missing-product"),
            ],
        )

    request = route.calls.last.request
    assert request.read() == (
        b'{"targets":[{"url":"https://example.com/products/linen-dress",'
        b'"catalog":"acme"},{"uuid":"missing-product"}]}'
    )
    assert response.request_id == "request-1"
    assert response.submitted == 2
    assert response.tasks_created == 1
    assert response.task_ids == ["recrawl-request-1-acme-0001-products"]
    assert response.accepted[0].catalog == "acme"
    assert response.rejected[0].code == "product_not_found"
    assert response.rejected[0].target.uuid == "missing-product"


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


async def test_api_key_can_be_passed_without_mutating_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OCTO_API_KEY", raising=False)

    async with OctogenClient(api_key="key") as client:
        assert os.getenv("OCTO_API_KEY") is None
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
