"""A mocked StoreRouter API, so every unit and standard test runs offline."""

from __future__ import annotations

from collections.abc import Iterator

import httpx
import pytest
import respx

BASE_URL = "https://api.storerouter.ai/v1"
API_KEY = "sr-test-key"

SEARCH_PAGE = {
    "items": [
        {
            "uuid": "0b6a3c1e-4f2d-4b8a-9c7e-1d2f3a4b5c6d",
            "catalogKey": "thereformation",
            "catalogDisplayName": "Reformation",
            "productUrl": "https://www.thereformation.com/products/juliette-linen-dress",
            "title": "Juliette Linen Dress",
            "brand": {"name": "Reformation", "slug": "reformation"},
            "currentPrice": 178.0,
            "originalPrice": 248.0,
            "currency": "USD",
            "inStock": True,
            "colors": ["Ivory", "Black"],
            "sizes": [],
            "categoryPath": ["Apparel & Accessories", "Clothing", "Dresses"],
            "primaryImage": {
                "url": "https://www.thereformation.com/img/juliette.jpg",
                "cdnUrl": "https://cdn.storerouter.ai/img/juliette.jpg",
            },
            "rawScore": 12.5,
        },
        {
            "uuid": "1c7b4d2f-5a3e-4c9b-8d6f-2e3a4b5c6d7e",
            "catalogDisplayName": "Doen",
            "productUrl": "https://shopdoen.com/products/marla-dress",
            "title": "Marla Dress",
            "currentPrice": 298.0,
            "originalPrice": 298.0,
        },
    ],
    "nextCursor": "cursor-2",
    "requestId": "req-search",
}

PRODUCT_MARKDOWN = "# Juliette Linen Dress\n\n**Reformation** · $178.00 USD\n"

STORE_SEARCH = {
    "results": [
        {
            "store": {
                "storeId": "catalog:thereformation",
                "catalog": "thereformation",
                "displayName": "Reformation",
                "primaryDomain": "thereformation.com",
                "domains": ["thereformation.com"],
            },
            "profileVersion": "profile-1",
            "computedAt": "2026-10-22T19:09:24Z",
            "summary": "Women's clothing, mostly dresses.",
            "matchedDepartment": {
                "departmentId": "category:apparel & accessories > clothing",
                "categoryPath": ["Apparel & Accessories", "Clothing"],
                "productCount": 3118,
                "summary": "Dresses (substantial).",
                "distributions": [],
            },
        }
    ]
}

BRAND_SEARCH = {
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


@pytest.fixture(autouse=True)
def api_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """A key in the environment, and nothing that would redirect requests."""
    monkeypatch.setenv("STOREROUTER_API_KEY", API_KEY)
    monkeypatch.delenv("OCTOGEN_PLATFORM_API_KEY", raising=False)
    monkeypatch.delenv("STOREROUTER_BASE_URL", raising=False)


@pytest.fixture(autouse=True)
def mock_api() -> Iterator[respx.MockRouter]:
    """Every route the tools call, answering with the fixtures above."""
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        router.post("/products/search", name="search").mock(
            return_value=httpx.Response(200, json=SEARCH_PAGE)
        )
        router.post("/products/lookup", name="lookup").mock(
            return_value=httpx.Response(
                200,
                text=PRODUCT_MARKDOWN,
                headers={
                    "content-type": "text/markdown; charset=utf-8",
                    "x-request-id": "req-lookup",
                    "x-octogen-product-uuid": "0b6a3c1e-4f2d-4b8a-9c7e-1d2f3a4b5c6d",
                    "x-octogen-catalog": "thereformation",
                    "x-octogen-matched-via": "exact",
                },
            )
        )
        router.post("/stores/search", name="stores").mock(
            return_value=httpx.Response(200, json=STORE_SEARCH)
        )
        router.post("/brands/search", name="brands").mock(
            return_value=httpx.Response(200, json=BRAND_SEARCH)
        )
        yield router
