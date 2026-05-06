from __future__ import annotations

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
    OctogenClient,
    OctogenNotFoundError,
    ProgrammaticProductLookupRequest,
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
    assert octogen_ai_sdk.ValidationErrorModel is ValidationErrorModel


def test_lookup_request_requires_url() -> None:
    with pytest.raises(ValueError):
        ProgrammaticProductLookupRequest.model_validate({})


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


async def test_api_key_can_be_passed_without_mutating_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OCTO_API_KEY", raising=False)

    async with OctogenClient(api_key="key") as client:
        assert os.getenv("OCTO_API_KEY") is None
        assert client._headers()["Authorization"] == "Bearer key"
