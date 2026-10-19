"""Taxonomy discovery and facet counts: request shapes and round trips.

Response bodies are trimmed from the live ``/v1`` routes (2026-10-19).
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import octogen_ai_sdk
import pytest
import respx
from octogen_ai_sdk import (
    Facet,
    OctogenClient,
    OctogenNotFoundError,
    ProgrammaticFacetCountCategory,
    ProgrammaticFacetCountsRequest,
    ProgrammaticFacetCountsResponse,
    TaxonomyCategoryPage,
)
from pydantic import ValidationError

BASE_URL = "https://api.octogen.ai/v1"

DRESSES_FACETS = [
    {"name": "category_path.depth_0", "values": ["apparel & accessories"]},
    {"name": "category_path.depth_1", "values": ["clothing"]},
    {"name": "category_path.depth_2", "values": ["dresses"]},
]
DRESSES_ID = "8866aef9-1915-4d6e-b465-87ba30b50380"
DRESSES_PATH = "Apparel & Accessories > Clothing > Dresses"
CLOTHING_PATH = "Apparel & Accessories > Clothing"
DRESSES = {
    "id": DRESSES_ID,
    "name": "Dresses",
    "path": DRESSES_PATH,
    "depth": 2,
    "childCount": 0,
    "facets": DRESSES_FACETS,
}
CLOTHING = {
    "id": "9af8b8a5-b1d0-48a1-9d30-93c2877d2621",
    "name": "Clothing",
    "path": CLOTHING_PATH,
    "depth": 1,
    "childCount": 13,
    "facets": DRESSES_FACETS[:2],
}
NECKLINE = {
    "handle": "neckline",
    "name": "Neckline",
    "description": "Used to describe the neck shape of a garment",
    "facetName": "neckline",
    "matching": "any selected value; exact canonical handles",
    "valueCount": 26,
}
EFFECTIVE_QUERY = {
    "text": "",
    "understood": False,
    "facets": [],
    "excludeFacets": [],
}


def _body(route: respx.Route) -> dict[str, Any]:
    return json.loads(route.calls.last.request.read())


def test_new_models_are_exported() -> None:
    for name in (
        "ProgrammaticFacetCountsRequest",
        "ProgrammaticFacetCountsResponse",
        "ProgrammaticFacetCountCategory",
        "TaxonomyCategoryPage",
        "TaxonomyAttributePage",
        "TaxonomyAttributeValuePage",
    ):
        assert name in octogen_ai_sdk.__all__
        assert getattr(octogen_ai_sdk, name) is not None


# ── taxonomy ─────────────────────────────────────────────────────────────────


@respx.mock
async def test_list_taxonomy_categories_sends_parent_and_paging() -> None:
    route = respx.get(f"{BASE_URL}/taxonomy/categories").mock(
        return_value=httpx.Response(
            200,
            json={
                "taxonomyVersion": "v4",
                "parent": CLOTHING,
                "categories": [DRESSES],
                "total": 13,
                "nextOffset": 1,
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.list_taxonomy_categories(
            parent="Apparel & Accessories > Clothing", limit=1
        )

    params = route.calls.last.request.url.params
    assert params["parent"] == "Apparel & Accessories > Clothing"
    assert params["limit"] == "1"
    assert "offset" not in params
    assert isinstance(page, TaxonomyCategoryPage)
    assert page.taxonomy_version == "v4"
    assert page.parent is not None and page.parent.child_count == 13
    assert page.categories[0].name == "Dresses"
    assert page.next_offset == 1


@respx.mock
async def test_list_taxonomy_categories_lists_roots_without_parent() -> None:
    route = respx.get(f"{BASE_URL}/taxonomy/categories").mock(
        return_value=httpx.Response(
            200,
            json={
                "taxonomyVersion": "v4",
                "parent": None,
                "categories": [],
                "total": 4,
                "nextOffset": None,
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.list_taxonomy_categories()

    assert str(route.calls.last.request.url) == f"{BASE_URL}/taxonomy/categories"
    assert page.parent is None


@respx.mock
async def test_list_taxonomy_attributes_sends_category() -> None:
    route = respx.get(f"{BASE_URL}/taxonomy/attributes").mock(
        return_value=httpx.Response(
            200,
            json={
                "taxonomyVersion": "v4",
                "category": DRESSES,
                "attributes": [NECKLINE],
                "total": 23,
                "nextOffset": None,
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.list_taxonomy_attributes(DRESSES_PATH, offset=0)

    params = route.calls.last.request.url.params
    assert params["category"] == DRESSES_PATH
    assert params["offset"] == "0"
    assert page.attributes[0].facet_name == "neckline"
    assert page.attributes[0].value_count == 26


@respx.mock
async def test_list_taxonomy_attribute_values_puts_the_handle_in_the_path() -> None:
    route = respx.get(f"{BASE_URL}/taxonomy/attributes/neckline/values").mock(
        return_value=httpx.Response(
            200,
            json={
                "taxonomyVersion": "v4",
                "attribute": NECKLINE,
                "values": [{"handle": "neckline__halter", "name": "Halter"}],
                "total": 26,
                "nextOffset": None,
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.list_taxonomy_attribute_values("neckline", limit=100)

    assert route.calls.last.request.url.params["limit"] == "100"
    assert page.attribute.facet_name == "neckline"
    assert [value.handle for value in page.values] == ["neckline__halter"]


@respx.mock
async def test_unknown_attribute_is_a_not_found_error() -> None:
    respx.get(f"{BASE_URL}/taxonomy/attributes/stock/values").mock(
        return_value=httpx.Response(
            404, json={"detail": "taxonomy_attribute_not_found"}
        )
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenNotFoundError):
            await client.list_taxonomy_attribute_values("stock")


async def test_attribute_handle_must_be_non_empty() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValueError, match="handle"):
            await client.list_taxonomy_attribute_values(" ")


@respx.mock
async def test_a_categorys_facets_go_back_into_search_unchanged() -> None:
    respx.get(f"{BASE_URL}/taxonomy/categories").mock(
        return_value=httpx.Response(
            200,
            json={
                "taxonomyVersion": "v4",
                "parent": CLOTHING,
                "categories": [DRESSES],
                "total": 13,
                "nextOffset": None,
            },
        )
    )
    search = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json={"items": [], "nextCursor": None})
    )

    async with OctogenClient(api_key="key") as client:
        page = await client.list_taxonomy_categories(parent=CLOTHING_PATH)
        await client.search_products(facets=page.categories[0].facets)

    assert _body(search)["facets"] == DRESSES_FACETS


# ── facet counts ─────────────────────────────────────────────────────────────


COUNTS_RESPONSE = {
    "categories": [{"key": "dresses", "count": 18760}],
    "attributes": [
        {
            "handle": "neckline",
            "facetName": "neckline",
            "values": [{"value": "neckline__halter", "count": 120}],
        }
    ],
    "facets": [{"name": "color_family", "values": [{"value": "Red", "count": 9}]}],
    "effectiveQuery": EFFECTIVE_QUERY,
}


@respx.mock
async def test_count_product_facets_sends_every_field_under_its_wire_name() -> None:
    route = respx.post(f"{BASE_URL}/products/facet-counts").mock(
        return_value=httpx.Response(200, json=COUNTS_RESPONSE)
    )

    async with OctogenClient(api_key="key") as client:
        counts = await client.count_product_facets(
            q="red dresses",
            facets=[{"name": "gender", "values": ["female"]}],
            exclude_facets=[Facet(name="color_family", values=["Black"])],
            omit_generated_facets=["graphic_type"],
            fallback_category=["apparel & accessories", "clothing"],
            price_min=10,
            price_max=200,
            brand_quality_min=2,
            brand_quality_max=6,
            catalogs=["whiteandwarren"],
            categories=[{"key": "dresses", "facets": DRESSES_FACETS}],
            attributes=["neckline"],
            facet_names=["color_family", "category_path.depth_0"],
            value_limit=20,
        )

    assert _body(route) == {
        "q": "red dresses",
        "facets": [{"name": "gender", "values": ["female"]}],
        "exclude_facets": [{"name": "color_family", "values": ["Black"]}],
        "omit_generated_facets": ["graphic_type"],
        "fallback_category": ["apparel & accessories", "clothing"],
        "price_min": 10.0,
        "price_max": 200.0,
        "brand_quality_min": 2.0,
        "brand_quality_max": 6.0,
        "catalogs": ["whiteandwarren"],
        "categories": [{"key": "dresses", "facets": DRESSES_FACETS}],
        "attributes": ["neckline"],
        "facet_names": ["color_family", "category_path.depth_0"],
        "value_limit": 20,
    }
    assert isinstance(counts, ProgrammaticFacetCountsResponse)
    assert counts.categories[0].count == 18760
    assert counts.attributes[0].facet_name == "neckline"
    assert counts.attributes[0].values[0].value == "neckline__halter"
    assert counts.facets[0].values[0].count == 9
    assert counts.effective_query.understood is False


@respx.mock
async def test_count_product_facets_sends_an_empty_body_by_default() -> None:
    route = respx.post(f"{BASE_URL}/products/facet-counts").mock(
        return_value=httpx.Response(200, json={**COUNTS_RESPONSE, "categories": []})
    )

    async with OctogenClient(api_key="key") as client:
        await client.count_product_facets()

    assert _body(route) == {}


@respx.mock
async def test_count_product_facets_takes_a_taxonomy_category_as_a_node() -> None:
    route = respx.post(f"{BASE_URL}/products/facet-counts").mock(
        return_value=httpx.Response(200, json=COUNTS_RESPONSE)
    )
    dresses = TaxonomyCategoryPage.model_validate(
        {
            "taxonomyVersion": "v4",
            "parent": None,
            "categories": [DRESSES],
            "total": 1,
            "nextOffset": None,
        }
    ).categories[0]

    async with OctogenClient(api_key="key") as client:
        await client.count_product_facets(
            categories=[{"key": dresses.id, "facets": dresses.facets}]
        )

    assert _body(route)["categories"] == [{"key": DRESSES_ID, "facets": DRESSES_FACETS}]


@respx.mock
async def test_count_product_facets_sends_a_prebuilt_request() -> None:
    route = respx.post(f"{BASE_URL}/products/facet-counts").mock(
        return_value=httpx.Response(200, json=COUNTS_RESPONSE)
    )
    request = ProgrammaticFacetCountsRequest(
        categories=[
            ProgrammaticFacetCountCategory(
                key="dresses", facets=[Facet.model_validate(f) for f in DRESSES_FACETS]
            )
        ],
        facet_names=[],
    )

    async with OctogenClient(api_key="key") as client:
        await client.count_product_facets(request=request)
        with pytest.raises(TypeError):
            await client.count_product_facets(request=request, q="dress")

    assert _body(route) == {
        "categories": [{"key": "dresses", "facets": DRESSES_FACETS}],
        "facet_names": [],
    }


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"omit_generated_facets": ["gender"]}, "requires q"),
        ({"fallback_category": ["apparel & accessories"]}, "requires q"),
        (
            {
                "facets": [
                    {"name": "gender", "values": ["female"]},
                    {"name": "gender", "values": ["male"]},
                ]
            },
            "more than once",
        ),
        ({"price_min": 20, "price_max": 10}, "price_min"),
        (
            {
                "categories": [
                    {"key": "a", "facets": DRESSES_FACETS},
                    {"key": "a", "facets": DRESSES_FACETS},
                ]
            },
            "unique",
        ),
        ({"attributes": ["neckline", "neckline"]}, "more than once"),
        ({"facet_names": []}, "nothing to count"),
        ({"facet_names": ["brand_name"]}, "facet_names"),
        ({"value_limit": 0}, "value_limit"),
        ({"catalogs": []}, "catalogs"),
    ],
)
async def test_count_product_facets_rejects_what_the_server_refuses(
    kwargs: dict[str, Any], message: str
) -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(ValidationError, match=message):
            await client.count_product_facets(**kwargs)


async def test_bare_strings_are_refused_rather_than_split() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(TypeError, match="attributes"):
            await client.count_product_facets(attributes="neckline")
        with pytest.raises(TypeError, match="facet_names"):
            await client.count_product_facets(facet_names="color_family")  # ty: ignore[invalid-argument-type]
