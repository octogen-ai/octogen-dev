"""Brand discovery: request shapes, response parsing and input validation."""

from __future__ import annotations

import json
from typing import Any

import httpx
import octogen_ai_sdk
import pytest
import respx
from octogen_ai_sdk import (
    BrandCoverageResponse,
    BrandFacet,
    BrandProductsPage,
    BrandTopCategoriesPage,
    OctogenClient,
    OctogenNotFoundError,
    SimilarBrandsResponse,
)

BASE_URL = "https://api.octogen.ai/v1"

SIMILAR_BRANDS = {
    "results": [
        {
            "brandUuid": "1f3c1b0e-8f0a-4a57-9a43-0d2a3b6f5e11",
            "brandName": "Doen",
            "brandSlug": "doen",
            "domain": "shopdoen.com",
            "brandDescription": "Feminine, vintage-inspired clothing.",
        }
    ],
    "totalFound": 1,
}
BRAND_DETAILS = {
    "brandUuid": "6a0b5f3e-2d4c-4c1e-9f8a-7b6c5d4e3f21",
    "brandName": "Reformation",
    "brandSlug": "reformation",
    "domain": "thereformation.com",
    "foundedYear": 2009,
    "originCountry": "United States",
    "priceTier": "premium",
    "productCount": 4556,
    "computedAt": "2026-10-21T19:40:00Z",
    "fields": [
        {
            "name": "color",
            "displayName": "Color",
            "source": "product",
            "populated": 4529,
            "coverage": 0.994,
            "distinct": 40,
            "topValues": [{"value": "black", "label": "Black", "count": 900}],
            "truncated": True,
        }
    ],
    "price": None,
    "catalogs": [
        {
            "catalog": "thereformation",
            "catalogDisplayName": "Reformation",
            "hosts": ["thereformation.com"],
            "productCount": 3462,
        },
        {
            "catalog": "farfetch",
            "catalogDisplayName": "Farfetch",
            "hosts": ["farfetch.com"],
            "productCount": 440,
        },
    ],
    "catalogsTruncated": False,
}
BRAND_PRODUCTS = {
    "brandName": "Reformation",
    "brandSlug": "reformation",
    "products": [
        {
            "uuid": "0d4a2c9e-5b1f-4e3a-8c7d-6f5e4d3c2b1a",
            "productUrl": "https://www.thereformation.com/products/juliette-dress",
            "title": "Juliette Dress",
        }
    ],
    "total": 1200,
    "limit": 2,
    "offset": 10,
    "hasMore": True,
}
TOP_CATEGORIES = {
    "brandName": "Reformation",
    "topCategories": [
        {"categoryName": "Dresses", "categoryLevel": 2},
        {"categoryName": "Tops", "categoryLevel": 2},
    ],
}


def _body(route: respx.Route) -> dict[str, Any]:
    return json.loads(route.calls.last.request.read())


def _query(route: respx.Route) -> dict[str, str]:
    return dict(route.calls.last.request.url.params)


def test_brand_models_are_exported() -> None:
    for name in (
        "BrandCoverageResponse",
        "BrandFacet",
        "BrandProductsPage",
        "BrandTopCategoriesPage",
        "BrandTopCategoryView",
        "SimilarBrandView",
        "SimilarBrandsResponse",
    ):
        assert name in octogen_ai_sdk.__all__
        assert getattr(octogen_ai_sdk, name) is getattr(octogen_ai_sdk.models, name)


# ── searchBrandPrefix ───────────────────────────────────────────────────────


@respx.mock
async def test_search_brand_prefix_sends_prefix_and_limit() -> None:
    route = respx.get(f"{BASE_URL}/brands/prefix").mock(
        return_value=httpx.Response(200, json=["Reformation", "Rebecca Minkoff"])
    )

    async with OctogenClient(api_key="key") as client:
        names = await client.search_brand_prefix("re", limit=2)

    assert route.calls.last.request.method == "GET"
    assert _query(route) == {"prefix": "re", "limit": "2"}
    assert names == ["Reformation", "Rebecca Minkoff"]


@respx.mock
async def test_search_brand_prefix_omits_unset_limit() -> None:
    route = respx.get(f"{BASE_URL}/brands/prefix").mock(
        return_value=httpx.Response(200, json=[])
    )

    async with OctogenClient(api_key="key") as client:
        assert await client.search_brand_prefix("zz") == []

    assert _query(route) == {"prefix": "zz"}


# ── searchBrandsFromText ────────────────────────────────────────────────────


@respx.mock
async def test_search_brands_from_text_sends_wire_names() -> None:
    route = respx.post(f"{BASE_URL}/brands/search").mock(
        return_value=httpx.Response(200, json=SIMILAR_BRANDS)
    )

    async with OctogenClient(api_key="key") as client:
        response = await client.search_brands_from_text(
            "romantic floral dresses",
            reference_brands=["Reformation"],
            facets=[
                BrandFacet(name="facet_price_tier", values=["premium"]),
                {"name": "facet_genders", "values": ["female"]},
            ],
            limit=5,
        )

    assert _body(route) == {
        "text": "romantic floral dresses",
        "referenceBrands": ["Reformation"],
        "facets": [
            {"name": "facet_price_tier", "values": ["premium"]},
            {"name": "facet_genders", "values": ["female"]},
        ],
        "limit": 5,
    }
    assert isinstance(response, SimilarBrandsResponse)
    assert response.total_found == 1
    assert response.results[0].brand_slug == "doen"
    assert response.results[0].domain == "shopdoen.com"


@respx.mock
async def test_search_brands_from_text_omits_unset_fields() -> None:
    route = respx.post(f"{BASE_URL}/brands/search").mock(
        return_value=httpx.Response(200, json={"results": [], "totalFound": 0})
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_brands_from_text("quiet luxury knitwear")

    assert _body(route) == {"text": "quiet luxury knitwear"}


# ── searchSimilarBrands ─────────────────────────────────────────────────────


@respx.mock
async def test_search_similar_brands_sends_wire_names() -> None:
    route = respx.post(f"{BASE_URL}/brands/similar").mock(
        return_value=httpx.Response(200, json=SIMILAR_BRANDS)
    )

    async with OctogenClient(api_key="key") as client:
        response = await client.search_similar_brands(
            ("Reformation", "Sezane"),
            facets=[{"name": "facet_genders", "values": ["female"]}],
            exclusion_facets=[BrandFacet(name="facet_price_tier", values=["luxury"])],
            limit=10,
        )

    assert route.calls.last.request.method == "POST"
    assert _body(route) == {
        "brands": ["Reformation", "Sezane"],
        "facets": [{"name": "facet_genders", "values": ["female"]}],
        "exclusionFacets": [{"name": "facet_price_tier", "values": ["luxury"]}],
        "limit": 10,
    }
    assert response.results[0].brand_name == "Doen"


@respx.mock
async def test_search_similar_brands_omits_unset_fields() -> None:
    route = respx.post(f"{BASE_URL}/brands/similar").mock(
        return_value=httpx.Response(200, json=SIMILAR_BRANDS)
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_similar_brands(["Reformation"])

    assert _body(route) == {"brands": ["Reformation"]}


@respx.mock
async def test_search_similar_brands_unknown_source_is_not_found() -> None:
    respx.post(f"{BASE_URL}/brands/similar").mock(
        return_value=httpx.Response(404, json={"detail": "brand_not_found"})
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenNotFoundError) as exc_info:
            await client.search_similar_brands(["No Such Brand"])

    assert exc_info.value.detail == "brand_not_found"


# ── getBrandDetails / browseBrandProducts / getBrandTopCategories ───────────


@respx.mock
async def test_get_brand_details_encodes_the_brand_name() -> None:
    route = respx.get(f"{BASE_URL}/brands/Rag%20%26%20Bone").mock(
        return_value=httpx.Response(200, json=BRAND_DETAILS)
    )

    async with OctogenClient(api_key="key") as client:
        details = await client.get_brand_details("Rag & Bone")

    assert route.called
    assert route.calls.last.request.url.raw_path == b"/v1/brands/Rag%20%26%20Bone"
    assert isinstance(details, BrandCoverageResponse)
    assert details.brand_name == "Reformation"
    assert details.founded_year == 2009
    assert details.price_tier == "premium"
    assert details.brand_description is None
    assert details.product_count == 4556
    assert details.fields[0].top_values[0].value == "black"
    assert [c.hosts for c in details.catalogs] == [
        ["thereformation.com"],
        ["farfetch.com"],
    ]


@respx.mock
async def test_browse_brand_products_sends_paging() -> None:
    route = respx.get(f"{BASE_URL}/brands/reformation/products").mock(
        return_value=httpx.Response(200, json=BRAND_PRODUCTS)
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.browse_brand_products("reformation", limit=2, offset=10)

    assert _query(route) == {"limit": "2", "offset": "10"}
    assert isinstance(page, BrandProductsPage)
    assert page.has_more is True
    assert page.total == 1200
    assert page.products[0].product_url.endswith("/juliette-dress")


@respx.mock
async def test_browse_brand_products_omits_unset_paging() -> None:
    route = respx.get(f"{BASE_URL}/brands/reformation/products").mock(
        return_value=httpx.Response(200, json=BRAND_PRODUCTS)
    )

    async with OctogenClient(api_key="key") as client:
        await client.browse_brand_products("reformation")

    assert _query(route) == {}


@respx.mock
async def test_get_brand_top_categories_sends_min_level_as_camel_case() -> None:
    route = respx.get(f"{BASE_URL}/brands/reformation/top-categories").mock(
        return_value=httpx.Response(200, json=TOP_CATEGORIES)
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.get_brand_top_categories(
            "reformation", min_level=0, limit=2
        )

    assert _query(route) == {"minLevel": "0", "limit": "2"}
    assert isinstance(page, BrandTopCategoriesPage)
    assert [c.category_name for c in page.top_categories] == ["Dresses", "Tops"]
    assert page.top_categories[0].category_level == 2


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get_brand_details", "/brands/unknown"),
        ("browse_brand_products", "/brands/unknown/products"),
        ("get_brand_top_categories", "/brands/unknown/top-categories"),
    ],
)
@respx.mock
async def test_unknown_brand_is_a_not_found_error(method: str, path: str) -> None:
    respx.get(f"{BASE_URL}{path}").mock(
        return_value=httpx.Response(404, json={"detail": "brand_not_found"})
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenNotFoundError) as exc_info:
            await getattr(client, method)("unknown")

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "brand_not_found"


# ── Input validation ────────────────────────────────────────────────────────


@pytest.mark.parametrize("value", ["", "   "])
@pytest.mark.parametrize(
    ("method", "field"),
    [
        ("search_brand_prefix", "prefix"),
        ("search_brands_from_text", "text"),
        ("get_brand_details", "brand"),
        ("browse_brand_products", "brand"),
        ("get_brand_top_categories", "brand"),
    ],
)
@respx.mock(assert_all_called=False)
async def test_blank_text_input_is_rejected_before_any_request(
    method: str, field: str, value: str
) -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError, match=f"{field} must be a non-empty string"):
            await getattr(client, method)(value)

    assert not respx.calls


@pytest.mark.parametrize("brands", [[], ["Reformation", " "]])
@respx.mock(assert_all_called=False)
async def test_search_similar_brands_rejects_empty_brands(brands: list[str]) -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError, match="brands must be a non-empty list"):
            await client.search_similar_brands(brands)

    assert not respx.calls


@respx.mock(assert_all_called=False)
async def test_search_brands_from_text_rejects_empty_reference_brands() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError, match="reference_brands must be a non-empty"):
            await client.search_brands_from_text("linen", reference_brands=[])

    assert not respx.calls


@respx.mock(assert_all_called=False)
async def test_search_similar_brands_rejects_a_bare_string() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(TypeError, match="not a string"):
            await client.search_similar_brands("Reformation")

    assert not respx.calls
