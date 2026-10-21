"""Wire parity and per-call privacy against shared synthetic API fixtures."""

from __future__ import annotations

import asyncio
import json
import warnings
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from octogen_ai_sdk import (
    InvalidRequestContext,
    OctogenClient,
    OctogenNotFoundError,
    RequestContext,
    RequestContextDefaults,
    RequestVisitor,
)
from octogen_ai_sdk.client import USER_AGENT
from octogen_ai_sdk.request_context import REQUEST_CONTEXT_HEADER

CASES = json.loads(
    (Path(__file__).parents[3] / "tests/fixtures/request-context-v1.json").read_text()
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
async def test_shared_api_fixtures_at_transport(case: dict[str, Any]) -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"items": [], "nextCursor": None})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        client = OctogenClient(api_key="synthetic", http_client=http)
        if case["valid"]:
            await client.search_products(
                q="shirt", context=RequestContext.model_validate(case["context"])
            )
            request = requests[0]
            header = request.headers[REQUEST_CONTEXT_HEADER]
            assert header.isascii()
            assert len(header.encode("ascii")) == case["bytes"]
            assert json.loads(header) == case["context"]
            assert request.headers["User-Agent"] == USER_AGENT
            assert json.loads(request.content) == {"q": "shirt", "limit": 50}
        else:
            with pytest.raises(InvalidRequestContext) as error:
                await client.search_products(
                    q="shirt", context=RequestContext.model_validate(case["context"])
                )
            assert str(error.value) == "Invalid RequestContext"
            assert "synthetic-private" not in repr(error.value)
            assert requests == []


async def test_defaults_inherit_override_clear_and_missing_vs_empty() -> None:
    headers: list[str | None] = []

    def respond(request: httpx.Request) -> httpx.Response:
        headers.append(request.headers.get(REQUEST_CONTEXT_HEADER))
        return httpx.Response(200, json={"items": []})

    defaults = RequestContextDefaults(application="storefront", feature="grid")
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        client = OctogenClient(
            api_key="synthetic", http_client=http, default_context=defaults
        )
        # Snapshot reusable defaults even if a caller bypasses the frozen model.
        object.__setattr__(defaults, "application", "changed")
        await client.search_products()
        await client.search_products(context=RequestContext(feature="detail"))
        await client.search_products(context=RequestContext(feature=None))
        await client.search_products(context=None)
        await client.search_products(context=RequestContext())
        bare = OctogenClient(api_key="synthetic", http_client=http)
        await bare.search_products()
        await bare.search_products(context=RequestContext())
    assert [None if h is None else json.loads(h) for h in headers] == [
        {"application": "storefront", "feature": "grid"},
        {"application": "storefront", "feature": "detail"},
        {"application": "storefront", "feature": None},
        None,
        {"application": "storefront", "feature": "grid"},
        None,
        {},
    ]


@pytest.mark.parametrize(
    "field", ["user_id", "session_id", "page_view_id", "user_agent", "visitor"]
)
def test_reusable_defaults_refuse_visitor_fields(field: str) -> None:
    with pytest.raises(InvalidRequestContext):
        RequestContextDefaults.model_validate({field: "synthetic-private-value"})
    with pytest.raises(InvalidRequestContext):
        OctogenClient(
            api_key="synthetic", default_context=RequestContext(user_id="synthetic")
        )


def test_revalidates_unsafe_models_without_warnings_or_input_errors() -> None:
    unsafe = RequestContext.model_construct(user_id=["synthetic-private-value"])
    with warnings.catch_warnings(record=True) as caught:
        with pytest.raises(InvalidRequestContext) as error:
            from octogen_ai_sdk.request_context import _context_header

            _context_header(None, unsafe)
    assert not caught
    assert str(error.value) == "Invalid RequestContext"
    with pytest.raises(InvalidRequestContext):
        RequestVisitor.model_validate({"provider": {"synthetic-private-value": 1}})


# A failing response lets each real public method reach the actual transport
# without coupling this test to unrelated response schemas.
OPERATIONS: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = [
    ("lookup_product", ("https://example.test/p",), {}),
    ("lookup_product_markdown", ("https://example.test/p",), {}),
    ("parse_product_alias", ("https://example.test/p",), {}),
    ("resolve_product_from_html", (), {"html": "<html/>"}),
    ("get_me", (), {}),
    ("get_store", ("example.test",), {}),
    ("search_products", (), {"q": "shirt"}),
    ("count_product_facets", (), {}),
    ("list_taxonomy_categories", (), {}),
    ("list_taxonomy_attributes", ("apparel",), {}),
    ("list_taxonomy_attribute_values", ("color",), {}),
    ("more_like_this_products", (), {"source_uuid": "synthetic-product"}),
    ("create_coverage_url_list", (), {"name": "synthetic-list"}),
    ("list_coverage_url_lists", (), {}),
    ("get_coverage_url_list", ("synthetic-list",), {}),
    ("delete_coverage_url_list", ("synthetic-list",), {}),
    (
        "add_coverage_url_list_urls",
        ("synthetic-list",),
        {"urls": ["https://example.test/p"]},
    ),
    (
        "remove_coverage_url_list_urls",
        ("synthetic-list",),
        {"urls": ["https://example.test/p"]},
    ),
    (
        "check_coverage_url_list_urls",
        ("synthetic-list",),
        {"urls": ["https://example.test/p"]},
    ),
    ("list_coverage_url_list_urls", ("synthetic-list",), {}),
]


@pytest.mark.parametrize(
    "name,args,kwargs", OPERATIONS, ids=[op[0] for op in OPERATIONS]
)
async def test_every_operation_only_adds_context_header(
    name: str, args: tuple[Any, ...], kwargs: dict[str, Any]
) -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(404, json={"detail": "synthetic miss"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        client = OctogenClient(api_key="synthetic", http_client=http)
        call: Callable[..., Awaitable[Any]] = getattr(client, name)
        for extra in [{}, {"context": RequestContext(user_id="synthetic-user")}]:
            with pytest.raises(OctogenNotFoundError, match="synthetic miss"):
                await call(*args, **kwargs, **extra, timeout=7.0)
    plain, contextual = requests
    assert contextual.url == plain.url
    assert contextual.method == plain.method
    assert contextual.content == plain.content
    assert contextual.extensions["timeout"] == plain.extensions["timeout"]
    assert contextual.headers[REQUEST_CONTEXT_HEADER] == '{"user_id":"synthetic-user"}'
    del contextual.headers[REQUEST_CONTEXT_HEADER]
    assert contextual.headers == plain.headers


async def test_concurrent_shared_transport_and_transport_retries_keep_snapshots() -> (
    None
):
    arrived = asyncio.Event()
    resume = asyncio.Event()
    attempts: list[tuple[str, str | None]] = []
    count = 0

    async def attempt(request: httpx.Request, number: int) -> httpx.Response:
        nonlocal count
        attempts.append(
            (request.url.params["parent"], request.headers.get(REQUEST_CONTEXT_HEADER))
        )
        assert request.headers["User-Agent"] == USER_AGENT
        if number == 0:
            count += 1
            if count == 2:
                arrived.set()
            await resume.wait()
            raise httpx.ConnectError("synthetic connection reset", request=request)
        return httpx.Response(
            200,
            json={
                "categories": [],
                "total": 0,
                "nextOffset": None,
                "parent": None,
                "taxonomyVersion": "synthetic",
            },
        )

    async def retrying_transport(request: httpx.Request) -> httpx.Response:
        try:
            return await attempt(request, 0)
        except httpx.ConnectError:
            return await attempt(request, 1)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(retrying_transport),
        headers={"X-Shared": "stable"},
    ) as http:
        original_headers = dict(http.headers)
        one = OctogenClient(api_key="synthetic-one", http_client=http)
        two = OctogenClient(api_key="synthetic-two", http_client=http)
        visitor = {"classification": "likely_human", "provider": "first"}
        ctx = RequestContext.model_validate(
            {"user_id": "one", "user_agent": "Agent/one", "visitor": visitor}
        )
        tasks = [
            asyncio.create_task(
                one.list_taxonomy_categories(parent="one", context=ctx)
            ),
            asyncio.create_task(
                two.list_taxonomy_categories(
                    parent="two",
                    context=RequestContext(user_id="two", user_agent="Agent/two"),
                )
            ),
        ]
        await asyncio.wait_for(arrived.wait(), timeout=5)
        visitor["provider"] = "changed"
        object.__setattr__(ctx, "user_id", "changed")
        resume.set()
        await asyncio.gather(*tasks)
        assert dict(http.headers) == original_headers
        # The same client never retains identity after the logical call.
        await one.list_taxonomy_categories(parent="bare")
    for name in ["one", "two", "bare"]:
        captured = [header for caller, header in attempts if caller == name]
        assert len(captured) == 2 and captured[0] == captured[1]
        if name == "bare":
            assert captured == [None, None]
        else:
            context = json.loads(captured[0] or "{}")
            assert context["user_id"] == name
            assert context["user_agent"] == f"Agent/{name}"
    assert json.loads(attempts[0][1] or "{}")["visitor"]["provider"] == "first"


async def test_merged_context_is_size_checked_and_can_be_cleared() -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"items": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        client = OctogenClient(
            api_key="synthetic",
            http_client=http,
            default_context=RequestContextDefaults(application="😀" * 256),
        )
        with pytest.raises(InvalidRequestContext):
            await client.search_products(context=RequestContext(user_agent="x" * 1024))
        assert not requests
        await client.search_products(
            context=RequestContext(application=None, user_agent="x" * 1024)
        )
        assert (
            json.loads(requests[0].headers[REQUEST_CONTEXT_HEADER])["application"]
            is None
        )


def test_public_context_fields_match_the_generated_deployed_contract() -> None:
    from octogen_ai_sdk.generated import models as contract

    assert (
        RequestContext.model_fields.keys()
        == contract.RequestContext.model_fields.keys()
    )
    assert (
        RequestVisitor.model_fields.keys()
        == contract.RequestVisitor.model_fields.keys()
    )
