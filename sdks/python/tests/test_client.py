from __future__ import annotations

import json
import os
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
    Facet,
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
    ProgrammaticMoreLikeThisRequest,
    ProgrammaticMoreLikeThisResponse,
    ProgrammaticMoreLikeThisSource,
    ProgrammaticMoreLikeThisSourceImageResponse,
    ProgrammaticMoreLikeThisSourceResponse,
    ProgrammaticProductLookupRequest,
    ProgrammaticProductSearchEffectiveQuery,
    ProgrammaticProductSearchPage,
    ProgrammaticProductSearchRequest,
    ValidationErrorModel,
)
from octogen_ai_sdk.generated import models as contract
from pydantic import BaseModel, ValidationError

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
    assert not hasattr(octogen_ai_sdk, "ProgrammaticProductRefreshRequest")
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


def test_more_like_this_source_requires_exactly_one_identifier() -> None:
    with pytest.raises(ValueError):
        ProgrammaticMoreLikeThisSource.model_validate({})

    with pytest.raises(ValueError):
        ProgrammaticMoreLikeThisSource.model_validate(
            {"url": "https://example.com/p", "uuid": "product-1"}
        )


def test_client_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(API_KEY_ENV_VAR, raising=False)
    monkeypatch.delenv(DEPRECATED_API_KEY_ENV_VAR, raising=False)

    with pytest.raises(MissingAPIKeyError) as exc_info:
        OctogenClient()

    assert API_KEY_ENV_VAR in str(exc_info.value)


@respx.mock
async def test_search_products_uses_env_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(API_KEY_ENV_VAR, "octo_test_key")
    monkeypatch.delenv(DEPRECATED_API_KEY_ENV_VAR, raising=False)
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
            catalogs=["acme"],
            q="linen summer dress",
            facets=[{"name": FacetName.GENDER, "values": ["female"]}],
            limit=5,
        )

    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer explicit_key"
    assert request.read() == (
        b'{"q":"linen summer dress",'
        b'"facets":[{"name":"gender","values":["female"]}],'
        b'"catalogs":["acme"],"limit":5}'
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
    assert request.read() == b'{"q":"linen summer dress","limit":5}'


@respx.mock
async def test_search_products_sends_catalogs_verbatim() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json={"items": [], "nextCursor": None})
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_products(catalogs=("macys", "etro", "jcrew"), q="dress")

    assert json.loads(route.calls.last.request.read()) == {
        "catalogs": ["macys", "etro", "jcrew"],
        "limit": 50,
        "q": "dress",
    }


@respx.mock
async def test_search_products_sends_every_control_under_its_wire_name() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json={"items": [], "nextCursor": None})
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_products(
            q="black hoodie",
            understand=True,
            facets=[{"name": "color", "values": ["black"]}],
            exclude_facets=[Facet(name="brand_name", values=["acme"])],
            omit_generated_facets=["fit"],
            price_min=50,
            price_max=300,
            brand_quality_min=3,
            brand_quality_max=6,
            similar_to_brands=("Warren Lotas",),
            fallback_category=("apparel & accessories", "clothing"),
            catalogs=["warrenlotas"],
            limit=25,
            cursor="cursor-1",
            relax=True,
            diversity=True,
            debug=True,
        )

    assert json.loads(route.calls.last.request.read()) == {
        "q": "black hoodie",
        "understand": True,
        "facets": [{"name": "color", "values": ["black"]}],
        "exclude_facets": [{"name": "brand_name", "values": ["acme"]}],
        "omit_generated_facets": ["fit"],
        "price_min": 50,
        "price_max": 300,
        "brand_quality_min": 3,
        "brand_quality_max": 6,
        "similar_to_brands": ["Warren Lotas"],
        "fallback_category": ["apparel & accessories", "clothing"],
        "catalogs": ["warrenlotas"],
        "limit": 25,
        "cursor": "cursor-1",
        "relax": True,
        "diversity": True,
        "debug": True,
    }


@respx.mock
async def test_search_products_sends_understand_false() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json={"items": [], "nextCursor": None})
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_products(
            q="black hoodie",
            understand=False,
            facets=[{"name": "color", "values": ["black"]}],
        )

    assert json.loads(route.calls.last.request.read()) == {
        "q": "black hoodie",
        "understand": False,
        "facets": [{"name": "color", "values": ["black"]}],
        "limit": 50,
    }


@pytest.mark.parametrize("removed", ["catalog", "text_search_query"])
async def test_search_products_no_longer_takes_removed_fields(removed: str) -> None:
    # The API answers both with a 422; 0.5 removed the keywords.
    legacy_kwargs: dict[str, Any] = {"q": "dress", removed: "acme"}
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(TypeError, match=removed):
            await client.search_products(**legacy_kwargs)


@pytest.mark.parametrize("removed", ["catalog", "text_search_query"])
def test_search_request_forbids_removed_fields(removed: str) -> None:
    with pytest.raises(ValueError, match="Extra inputs are not permitted"):
        ProgrammaticProductSearchRequest.model_validate({"q": "dress", removed: "x"})


def test_text_search_query_model_is_gone() -> None:
    assert not hasattr(octogen_ai_sdk, "TextSearchQuery")


@pytest.mark.parametrize(
    ("kwargs", "match"),
    [
        ({"understand": False}, "understand=False requires q"),
        ({"q": "   ", "understand": False}, "understand=False requires q"),
        ({"relax": True}, "relax requires an understood q"),
        ({"q": "dress", "understand": False, "relax": True}, "relax requires"),
        ({"omit_generated_facets": ["color"]}, "omit_generated_facets requires"),
        (
            {"q": "dress", "understand": False, "omit_generated_facets": ["color"]},
            "omit_generated_facets requires",
        ),
        (
            {
                "q": "dress",
                "facets": [{"name": "color", "values": ["black"]}],
                "omit_generated_facets": ["color"],
            },
            "'color' is in both facets and omit_generated_facets",
        ),
        (
            {
                "facets": [
                    {"name": "color", "values": ["black"]},
                    {"name": "color", "values": ["navy"]},
                ]
            },
            "facets lists facet 'color' more than once",
        ),
        (
            {
                "exclude_facets": [
                    {"name": "brand_name", "values": ["a"]},
                    {"name": "brand_name", "values": ["b"]},
                ]
            },
            "exclude_facets lists facet 'brand_name' more than once",
        ),
        (
            {"facets": [{"name": f"f{i}", "values": ["x"]} for i in range(51)]},
            "at most 50 items",
        ),
        ({"price_min": -1}, "greater than or equal to 0"),
        ({"price_min": 300, "price_max": 50}, "price_min must not exceed price_max"),
        ({"brand_quality_min": 0}, "greater than or equal to 1"),
        ({"brand_quality_max": 7}, "less than or equal to 6"),
        (
            {"brand_quality_min": 5, "brand_quality_max": 2},
            "brand_quality_min must not exceed brand_quality_max",
        ),
        ({"similar_to_brands": []}, "at least 1 item"),
        ({"similar_to_brands": [f"b{i}" for i in range(11)]}, "at most 10 items"),
        ({"similar_to_brands": ["Acme", " "]}, "non-empty brand names"),
        ({"fallback_category": ["clothing"]}, "fallback_category requires"),
        (
            {"q": "dress", "understand": False, "fallback_category": ["clothing"]},
            "fallback_category requires",
        ),
        ({"q": "dress", "fallback_category": []}, "at least 1 item"),
        (
            {"q": "dress", "fallback_category": ["a", "b", "c", "d", "e"]},
            "at most 4 items",
        ),
        (
            {"q": "dress", "fallback_category": ["apparel & accessories", " "]},
            "non-empty category names",
        ),
    ],
)
@respx.mock
async def test_search_products_rejects_contradictions(
    kwargs: dict[str, Any], match: str
) -> None:
    route = respx.post(f"{BASE_URL}/products/search")

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError, match=match):
            await client.search_products(**kwargs)

    assert not route.called


@respx.mock
async def test_search_products_allows_same_name_in_facets_and_exclude_facets() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json={"items": [], "nextCursor": None})
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_products(
            facets=[{"name": "color_family", "values": ["blue"]}],
            exclude_facets=[{"name": "color_family", "values": ["green"]}],
        )

    assert route.called


@respx.mock
async def test_search_products_parses_debug_effective_query() -> None:
    respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json=SEARCH_DEBUG_PAGE)
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.search_products(
            q="black hoodie under $300",
            catalogs=["warrenlotas"],
            facets=[{"name": "color", "values": ["black"]}],
            relax=True,
            debug=True,
        )

    assert isinstance(page, ProgrammaticProductSearchPage)
    assert page.request_id == "3f2c0a52-5d8e-4a57-9a61-0c9f1f7b2d11"
    assert page.items[0].title == "Black Hoodie"
    effective = page.effective_query
    assert isinstance(effective, ProgrammaticProductSearchEffectiveQuery)
    assert effective.understood is True
    assert effective.text == "black hoodie"
    assert [(f.name, f.source) for f in effective.facets or []] == [
        ("color", "caller"),
        ("product_type", "generated"),
    ]
    assert effective.exclude_facets == []
    assert effective.price_max == 300
    assert effective.catalogs == ["warrenlotas"]
    assert effective.relaxation is not None
    assert effective.relaxation.rounds == 1
    assert effective.relaxation.declined_rounds == 0
    dropped = effective.relaxation.dropped_facets or []
    assert [(f.name, f.values, f.source) for f in dropped] == [
        ("fit", ["oversized"], "generated")
    ]


@respx.mock
async def test_search_products_parses_effective_query_without_debug() -> None:
    # Current servers report the search that ran on every response.
    respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "items": [],
                "nextCursor": None,
                "requestId": "r-1",
                "effectiveQuery": {
                    "text": "party dress",
                    "understood": True,
                    "facets": [
                        {
                            "name": "category_path.depth_0",
                            "values": ["apparel & accessories"],
                            "source": "generated",
                        }
                    ],
                },
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.search_products(
            q="something for a party",
            fallback_category=["apparel & accessories"],
        )

    assert page.effective_query is not None
    assert [(f.name, f.source) for f in page.effective_query.facets or []] == [
        ("category_path.depth_0", "generated")
    ]


@respx.mock
async def test_search_products_parses_list_item_card_fields() -> None:
    respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "items": [
                    {
                        "uuid": "dress",
                        "productUrl": "https://acme.example/dress",
                        "currency": "USD",
                        "inStock": False,
                        "colors": ["Red", "Navy"],
                        "sizes": ["S", "M"],
                        "gender": "female",
                        "categoryPath": ["apparel & accessories", "clothing"],
                        "catalogDisplayName": "Acme",
                    },
                    {"uuid": "bare", "productUrl": "https://acme.example/bare"},
                ],
                "nextCursor": None,
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.search_products(q="dress")

    full, bare = page.items
    assert (full.currency, full.in_stock, full.colors, full.sizes) == (
        "USD",
        False,
        ["Red", "Navy"],
        ["S", "M"],
    )
    assert full.gender == "female"
    assert full.category_path == ["apparel & accessories", "clothing"]
    assert full.catalog_display_name == "Acme"
    assert not full.model_extra
    assert (bare.currency, bare.in_stock, bare.colors, bare.gender) == (
        None,
        None,
        None,
        None,
    )


@respx.mock
async def test_search_products_from_an_older_server_has_no_effective_query() -> None:
    respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(
            200,
            json={"items": [], "nextCursor": None, "requestId": "r-1"},
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.search_products(q="dress")

    assert page.request_id == "r-1"
    assert page.effective_query is None


@pytest.mark.parametrize(
    ("catalogs", "error", "match"),
    [
        ([], ValueError, "at least 1 item"),
        (["acme", ""], ValueError, "non-empty catalog keys"),
        (["acme", "   "], ValueError, "non-empty catalog keys"),
        ([f"c{i}" for i in range(501)], ValueError, "at most 500 items"),
        ("acme", TypeError, "not a string"),
    ],
)
@respx.mock
async def test_search_products_rejects_bad_catalogs(
    catalogs: Any, error: type[Exception], match: str
) -> None:
    route = respx.post(f"{BASE_URL}/products/search")

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(error, match=match):
            await client.search_products(catalogs=catalogs)

    assert not route.called


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
            catalogs=["acme", "globex"],
            facets=[{"name": FacetName.GENDER, "values": ["female"]}],
            exclude_facets=[{"name": FacetName.COLOR_FAMILY, "values": ["Black"]}],
            price_min=50,
            price_max=300,
            brand_quality_min=3,
            brand_quality_max=6,
            price_preference=PricePreference.HIGHER,
            relax=False,
            limit=3,
            debug=True,
        )

    request = route.calls.last.request
    assert json.loads(request.read()) == {
        "source": {"url": "https://example.com/products/linen-dress"},
        "catalogs": ["acme", "globex"],
        "limit": 3,
        "facets": [{"name": "gender", "values": ["female"]}],
        "exclude_facets": [{"name": "color_family", "values": ["Black"]}],
        "price_min": 50,
        "price_max": 300,
        "brand_quality_min": 3,
        "brand_quality_max": 6,
        "price_preference": "higher",
        "relax": False,
        "debug": True,
    }
    assert page.source is not None
    assert page.source.catalog_key == "acme"
    assert page.sources is None
    assert page.items[0].catalog_key == "acme"
    assert page.items[0].display_match_score == 92
    assert page.effective_query is not None
    assert page.effective_query.price_min == 128


@pytest.mark.parametrize(
    ("catalogs", "match"),
    [
        ([], "at least 1 item"),
        ([f"c{i}" for i in range(101)], "at most 100 items"),
        ([""], "non-empty catalog keys"),
    ],
)
@respx.mock
async def test_more_like_this_products_rejects_bad_catalogs(
    catalogs: list[str], match: str
) -> None:
    route = respx.post(f"{BASE_URL}/products/more-like-this")

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError, match=match):
            await client.more_like_this_products(source_uuid="p1", catalogs=catalogs)

    assert not route.called


@respx.mock
async def test_more_like_this_products_leaves_relax_to_the_server() -> None:
    # The server defaults `relax` to true; the SDK sends it only when set, and
    # never sends the removed `include_facets`.
    route = respx.post(f"{BASE_URL}/products/more-like-this").mock(
        return_value=httpx.Response(
            200,
            json={
                "source": {
                    "catalogKey": "acme",
                    "uuid": "p1",
                    "productUrl": "https://example.com/p1",
                },
                "items": [],
                "nextCursor": None,
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        await client.more_like_this_products(source_uuid="p1")
        await client.more_like_this_products(source_uuid="p1", relax=True)

    first, second = (json.loads(call.request.read()) for call in route.calls)
    assert first == {
        "source": {"uuid": "p1"},
        "limit": 12,
        "price_preference": "any",
        "debug": False,
    }
    assert second["relax"] is True
    for body in (first, second):
        assert "include_facets" not in body


@respx.mock
async def test_more_like_this_products_parses_relaxation() -> None:
    respx.post(f"{BASE_URL}/products/more-like-this").mock(
        return_value=httpx.Response(
            200,
            json={
                "source": {
                    "catalogKey": "acme",
                    "uuid": "p1",
                    "productUrl": "https://example.com/p1",
                },
                "items": [],
                "nextCursor": None,
                "effectiveQuery": {
                    "text": "linen dress",
                    "limit": 12,
                    "brandQualityMin": 3,
                    "relaxation": {
                        "rounds": 1,
                        "declinedRounds": 0,
                        "droppedFacets": [
                            {
                                "name": "color_family",
                                "values": ["Blue"],
                                "source": "generated",
                            }
                        ],
                    },
                },
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.more_like_this_products(source_uuid="p1")

    effective = page.effective_query
    assert effective is not None
    assert effective.brand_quality_min == 3
    assert effective.relaxation is not None
    assert effective.relaxation.rounds == 1
    assert effective.relaxation.dropped_facets is not None
    assert effective.relaxation.dropped_facets[0].name == "color_family"


@pytest.mark.parametrize(
    ("kwargs", "match"),
    [
        (
            {
                "facets": [
                    {"name": "gender", "values": ["female"]},
                    {"name": "gender", "values": ["male"]},
                ]
            },
            "more than once",
        ),
        ({"price_min": 200, "price_max": 100}, "price_min must not exceed"),
        (
            {"brand_quality_min": 5, "brand_quality_max": 2},
            "brand_quality_min must not exceed",
        ),
        ({"brand_quality_min": 7}, "less than or equal to 6"),
        ({"price_min": -1}, "greater than or equal to 0"),
    ],
)
@respx.mock
async def test_more_like_this_products_rejects_contradictions(
    kwargs: dict[str, Any], match: str
) -> None:
    route = respx.post(f"{BASE_URL}/products/more-like-this")

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError, match=match):
            await client.more_like_this_products(source_uuid="p1", **kwargs)

    assert not route.called


@respx.mock
async def test_more_like_this_products_sends_sources() -> None:
    route = respx.post(f"{BASE_URL}/products/more-like-this").mock(
        return_value=httpx.Response(
            200,
            json={
                "sources": [
                    {
                        "catalogKey": "acme",
                        "uuid": "p1",
                        "productUrl": "https://example.com/p1",
                        "title": "Linen Dress",
                    },
                    {
                        "catalogKey": "globex",
                        "uuid": "p2",
                        "productUrl": "https://example.com/p2",
                    },
                ],
                "items": [],
                "nextCursor": None,
                "requestId": "req-1",
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.more_like_this_products(sources=("p1", "p2"), limit=5)

    assert json.loads(route.calls.last.request.read()) == {
        "sources": ["p1", "p2"],
        "limit": 5,
        "price_preference": "any",
        "debug": False,
    }
    assert page.source is None
    assert page.sources is not None
    assert [source.uuid for source in page.sources] == ["p1", "p2"]
    assert page.sources[1].catalog_key == "globex"
    assert page.request_id == "req-1"


@respx.mock
async def test_more_like_this_products_sends_omit_and_embedding_controls() -> None:
    route = respx.post(f"{BASE_URL}/products/more-like-this").mock(
        return_value=httpx.Response(
            200,
            json={
                "sourceImage": {"hash": "abc123"},
                "resolution": "cached_image_query",
                "items": [],
                "requestId": "req-2",
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.more_like_this_products(
            source_uuid="p1",
            omit_generated_facets=["color_family"],
            retrieval_embedding_columns=[
                "style_embedding",
                EmbeddingColumn.TAGS_EMBEDDING,
            ],
            ranking_embedding_columns=[EmbeddingColumn.EMBEDDING],
        )

    assert json.loads(route.calls.last.request.read()) == {
        "source": {"uuid": "p1"},
        "limit": 12,
        "omit_generated_facets": ["color_family"],
        "retrieval_embedding_columns": ["style_embedding", "tags_embedding"],
        "ranking_embedding_columns": ["embedding"],
        "price_preference": "any",
        "debug": False,
    }
    assert page.source is None
    assert page.source_image is not None
    assert page.source_image.hash == "abc123"
    assert page.resolution == "cached_image_query"
    assert page.request_id == "req-2"


@pytest.mark.parametrize(
    ("kwargs", "error", "match"),
    [
        ({"retrieval_embedding_columns": []}, ValueError, "at least 1 item"),
        ({"ranking_embedding_columns": []}, ValueError, "at least 1 item"),
        ({"ranking_embedding_columns": "embedding"}, TypeError, "not a string"),
        ({"retrieval_embedding_columns": ["image_embedding"]}, ValueError, "image"),
        ({"omit_generated_facets": "color_family"}, TypeError, "not a string"),
    ],
)
@respx.mock
async def test_more_like_this_products_rejects_bad_controls(
    kwargs: dict[str, Any], error: type[Exception], match: str
) -> None:
    route = respx.post(f"{BASE_URL}/products/more-like-this")

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(error, match=match):
            await client.more_like_this_products(source_uuid="p1", **kwargs)

    assert not route.called


def test_more_like_this_models_declare_every_contract_property() -> None:
    # Cosimo's contract-lag check fails on a request property the SDK cannot
    # send and lists response properties it does not declare; keep both empty
    # for more-like-this so its bridges can go.
    pairs: list[tuple[type[BaseModel], type[BaseModel]]] = [
        (ProgrammaticMoreLikeThisRequest, contract.ProgrammaticMoreLikeThisRequest),
        (ProgrammaticMoreLikeThisResponse, contract.ProgrammaticMoreLikeThisResponse),
        (
            ProgrammaticMoreLikeThisSourceResponse,
            contract.ProgrammaticMoreLikeThisSourceResponse,
        ),
        (
            ProgrammaticMoreLikeThisSourceImageResponse,
            contract.ProgrammaticMoreLikeThisSourceImageResponse,
        ),
    ]
    for model, generated in pairs:
        assert _wire_names(model) == _wire_names(generated), model.__name__


def _wire_names(model: type[BaseModel]) -> set[str]:
    return {field.alias or name for name, field in model.model_fields.items()}


@pytest.mark.parametrize(
    ("kwargs", "error", "match"),
    [
        ({}, ValueError, "Exactly one of url or uuid"),
        ({"source_uuid": "p1", "sources": ["p2"]}, ValueError, "source or sources"),
        (
            {"source_url": "https://example.com/p1", "sources": ["p2"]},
            ValueError,
            "source or sources",
        ),
        ({"sources": []}, ValueError, "at least 1 item"),
        ({"sources": [f"p{i}" for i in range(21)]}, ValueError, "at most 20 items"),
        ({"sources": ["p1", "p1"]}, ValueError, "more than once"),
        ({"sources": [""]}, ValueError, "at least 1 character"),
        ({"sources": "p1"}, TypeError, "not a string"),
    ],
)
@respx.mock
async def test_more_like_this_products_rejects_bad_sources(
    kwargs: dict[str, Any], error: type[Exception], match: str
) -> None:
    route = respx.post(f"{BASE_URL}/products/more-like-this")

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(error, match=match):
            await client.more_like_this_products(**kwargs)

    assert not route.called


def test_more_like_this_request_takes_exactly_one_of_source_and_sources() -> None:
    assert ProgrammaticMoreLikeThisRequest(sources=["p1"]).source is None
    with pytest.raises(ValueError, match="source or sources"):
        ProgrammaticMoreLikeThisRequest()
    with pytest.raises(ValueError, match="source or sources"):
        ProgrammaticMoreLikeThisRequest.model_validate(
            {"source": {"uuid": "p1"}, "sources": ["p2"]}
        )


async def test_more_like_this_products_no_longer_takes_include_facets() -> None:
    # The server refuses `include_facets` with a 422 naming `facets`; 0.8
    # removed the keyword, and the request model forbids the field.
    legacy_kwargs: dict[str, Any] = {
        "source_uuid": "p1",
        "include_facets": [{"name": "gender", "values": ["female"]}],
    }
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(TypeError, match="include_facets"):
            await client.more_like_this_products(**legacy_kwargs)
    with pytest.raises(ValueError, match="include_facets"):
        ProgrammaticMoreLikeThisRequest.model_validate(
            {"source": {"uuid": "p1"}, "include_facets": []}
        )


async def test_more_like_this_products_no_longer_takes_catalog() -> None:
    # The endpoint refuses `catalog`; 0.4 removed the keyword rather than
    # sending a request the server would reject.
    legacy_kwargs: dict[str, Any] = {"source_uuid": "p1", "catalog": "acme"}
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(TypeError, match="catalog"):
            await client.more_like_this_products(**legacy_kwargs)


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
                    "primaryImage": {
                        "url": "https://example.com/image.jpg",
                        "cdnUrl": "https://cdn.octogen.ai/abc/primary.webp",
                    },
                    "images": [
                        {
                            "url": "https://example.com/image.jpg",
                            "cdnUrl": "https://cdn.octogen.ai/abc/primary.webp",
                        }
                    ],
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
    assert result.product.primary_image is not None
    assert (
        result.product.primary_image.cdn_url
        == "https://cdn.octogen.ai/abc/primary.webp"
    )
    assert result.product.images[0].url == "https://example.com/image.jpg"
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

        assert (
            await client._json("deleteUrlList", path_params={"urlListId": LIST_ID})
            is None
        )


async def test_api_key_can_be_passed_without_mutating_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(API_KEY_ENV_VAR, raising=False)

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


# A `debug=True` search page in the shape of the published
# `ProgrammaticProductSearchPage` / `ProgrammaticProductSearchEffectiveQuery`
# schemas, with values from the contract's `POST /products/search` example.
SEARCH_DEBUG_PAGE: dict[str, Any] = {
    "items": [
        {
            "uuid": "prod_01HX...",
            "title": "Black Hoodie",
            "productUrl": "https://warrenlotas.com/products/black-hoodie",
            "currentPrice": 180,
            "isActive": True,
        }
    ],
    "nextCursor": "eyJzZWFyY2hBZnRlciI6Wy4uLl19",
    "requestId": "3f2c0a52-5d8e-4a57-9a61-0c9f1f7b2d11",
    "effectiveQuery": {
        "text": "black hoodie",
        "understood": True,
        "facets": [
            {"name": "color", "values": ["black"], "source": "caller"},
            {"name": "product_type", "values": ["hoodie"], "source": "generated"},
        ],
        "excludeFacets": [],
        "priceMin": None,
        "priceMax": 300,
        "brandQualityMin": None,
        "brandQualityMax": None,
        "similarToBrands": None,
        "catalogs": ["warrenlotas"],
        "relaxation": {
            "rounds": 1,
            "droppedFacets": [
                {"name": "fit", "values": ["oversized"], "source": "generated"}
            ],
            "declinedRounds": 0,
        },
    },
}


DOMAIN_COVERAGE_JSON = {
    "host": "thereformation.com",
    "catalogs": [
        {
            "catalog": "reformation",
            "catalogDisplayName": "Reformation",
            "computedAt": "2026-10-19T00:00:00Z",
            "productCount": 1200,
            "fields": [
                {
                    "name": "color",
                    "displayName": "Color",
                    "source": "product",
                    "populated": 1100,
                    "coverage": 0.917,
                    "distinct": 40,
                    "truncated": True,
                    "topValues": [{"value": "black", "label": "Black", "count": 300}],
                }
            ],
            "price": {
                "populated": 1150,
                "median": 218.0,
                "below": 5,
                "above": 40,
                "buckets": [{"min": 50.0, "max": 100.0, "count": 80}],
            },
        }
    ],
}


@respx.mock
async def test_get_store_normalizes_a_url_to_one_host() -> None:
    route = respx.get(f"{BASE_URL}/stores/thereformation.com").mock(
        return_value=httpx.Response(200, json=DOMAIN_COVERAGE_JSON)
    )

    async with OctogenClient(api_key="key") as client:
        coverage = await client.get_store(
            "https://WWW.TheReformation.com:443/products/x?color=red"
        )

    assert route.called
    assert coverage.host == "thereformation.com"
    catalog = coverage.catalogs[0]
    assert catalog.product_count == 1200
    assert catalog.fields[0].top_values[0].value == "black"
    assert catalog.price is not None
    assert catalog.price.buckets[0].count == 80


@pytest.mark.parametrize("value", ["", "   ", "not a host/with a path"])
async def test_get_store_rejects_input_with_no_host(value: str) -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError, match="no host"):
            await client.get_store(value)


STORE_SEARCH_JSON = {
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
            "summary": "Observed public indexed assortment.",
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


@respx.mock
async def test_search_stores_posts_text_and_limit() -> None:
    route = respx.post(f"{BASE_URL}/stores/search").mock(
        return_value=httpx.Response(200, json=STORE_SEARCH_JSON)
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.search_stores("linen dresses", limit=5)
        await client.search_stores("linen")

    assert json.loads(route.calls[0].request.content) == {
        "text": "linen dresses",
        "limit": 5,
    }
    assert json.loads(route.calls[1].request.content) == {"text": "linen"}
    result = page.results[0]
    assert result.store.primary_domain == "thereformation.com"
    assert result.matched_department is not None
    assert result.matched_department.product_count == 3118


async def test_search_stores_rejects_blank_text() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError, match="text must be a non-empty string"):
            await client.search_stores("  ")


@respx.mock
async def test_search_similar_stores_posts_stores_and_limit() -> None:
    route = respx.post(f"{BASE_URL}/stores/similar").mock(
        return_value=httpx.Response(200, json=STORE_SEARCH_JSON)
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.search_similar_stores(["thereformation.com"], limit=5)
        await client.search_similar_stores(["a.example", "b.example"])

    assert json.loads(route.calls[0].request.content) == {
        "stores": ["thereformation.com"],
        "limit": 5,
    }
    assert json.loads(route.calls[1].request.content) == {
        "stores": ["a.example", "b.example"]
    }
    assert page.results[0].store.primary_domain == "thereformation.com"


@pytest.mark.parametrize("stores", [[], [" "], "thereformation.com"])
async def test_search_similar_stores_rejects_bad_stores(stores) -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises((ValueError, TypeError)):
            await client.search_similar_stores(stores)


@respx.mock
async def test_search_products_sends_stores_but_not_with_catalogs() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json={"items": [], "nextCursor": None})
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_products(stores=["thereformation.com"])
        with pytest.raises(ValidationError):
            await client.search_products(stores=["a.example"], catalogs=["acme"])
        with pytest.raises(ValidationError):
            await client.search_products(stores=[" "])

    assert len(route.calls) == 1
    body = json.loads(route.calls[0].request.content)
    assert body["stores"] == ["thereformation.com"]
    assert "catalogs" not in body


@respx.mock
async def test_get_store_not_covered_is_a_not_found_error() -> None:
    respx.get(f"{BASE_URL}/stores/example.com").mock(
        return_value=httpx.Response(404, json={"detail": "domain_not_covered"})
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenNotFoundError) as exc_info:
            await client.get_store("example.com")

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "domain_not_covered"
