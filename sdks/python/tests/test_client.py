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
async def test_list_catalogs_uses_env_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OCTO_API_KEY", "octo_test_key")
    route = respx.get(f"{BASE_URL}/catalogs").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "catalog": "acme",
                    "displayName": "ACME",
                    "sourceBaseUrl": "https://example.com",
                    "productCount": 12,
                    "lastIndexedAt": "2026-05-01T12:00:00Z",
                }
            ],
        )
    )

    async with OctogenClient() as client:
        catalogs = await client.list_catalogs()

    assert route.called
    assert route.calls.last.request.headers["Authorization"] == "Bearer octo_test_key"
    assert route.calls.last.request.headers["User-Agent"].startswith(
        "octogen-ai-sdk-python/"
    )
    assert catalogs[0].catalog == "acme"
    assert catalogs[0].display_name == "ACME"
    assert catalogs[0].product_count == 12


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
    respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(
            200,
            json={
                "catalogKey": "acme",
                "catalogDisplayName": "ACME",
                "sourceBaseUrl": "https://example.com",
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
    assert result.product.in_stock is True
    assert result.product.details.materials == ["linen"]
    assert result.product.audience is not None
    assert result.product.audience.age_groups == ["adult"]


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
    respx.get(f"{BASE_URL}/catalogs").mock(
        return_value=httpx.Response(429, json={"detail": "rate_limited"})
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenAPIError) as exc_info:
            await client.list_catalogs()

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "rate_limited"


@respx.mock
async def test_connection_errors_are_wrapped() -> None:
    respx.get(f"{BASE_URL}/catalogs").mock(
        side_effect=httpx.ConnectTimeout("request timed out")
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenConnectionError) as exc_info:
            await client.list_catalogs()

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
