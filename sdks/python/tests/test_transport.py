"""Request-model entry points, per-call timeouts, and typed transport errors."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime

import httpx
import pytest
import respx
from octogen_ai_sdk import (
    CoverageUrlsRequest,
    OctogenAPIError,
    OctogenAuthenticationError,
    OctogenClient,
    OctogenConnectionError,
    OctogenGatewayTimeoutError,
    OctogenInsufficientCreditError,
    OctogenNotFoundError,
    OctogenRateLimitError,
    OctogenServerError,
    OctogenTimeoutError,
    ProductLookupMatchMode,
    ProgrammaticProductLookupRequest,
    ProgrammaticProductSearchRequest,
)
from octogen_ai_sdk.client import _parse_retry_after
from pydantic import Field

BASE_URL = "https://api.octogen.ai/v1"
LIST_ID = "6f9619ff-8b86-d011-b42d-00cf4fc964ff"
EMPTY_PAGE = {"items": [], "nextCursor": None}
LOOKUP = {
    "source": "indexed",
    "product": {"uuid": "product-1", "productUrl": "https://example.com/p"},
}


class _SearchWithNewControl(ProgrammaticProductSearchRequest):
    """A caller's bridge for a request field this SDK does not declare yet."""

    new_control: bool | None = Field(default=None, alias="newControl")


# ── S1: request-model entry points ──────────────────────────────────────────


@respx.mock
async def test_search_products_sends_a_subclass_field() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json=EMPTY_PAGE)
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_products(
            request=_SearchWithNewControl(q="linen dress", newControl=True, limit=5)
        )

    assert json.loads(route.calls.last.request.read()) == {
        "q": "linen dress",
        "limit": 5,
        "newControl": True,
    }


def test_a_search_request_subclass_keeps_the_sdk_validators() -> None:
    with pytest.raises(ValueError, match="relax requires q"):
        _SearchWithNewControl(relax=True, newControl=True)


@respx.mock
async def test_search_products_request_matches_the_keyword_form() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json=EMPTY_PAGE)
    )

    async with OctogenClient(api_key="key") as client:
        await client.search_products(q="linen dress", catalogs=["acme"])
        await client.search_products(
            request=ProgrammaticProductSearchRequest(q="linen dress", catalogs=["acme"])
        )

    first, second = (call.request.read() for call in route.calls)
    assert first == second == b'{"q":"linen dress","catalogs":["acme"],"limit":50}'


@respx.mock
async def test_request_and_keywords_together_are_refused() -> None:
    route = respx.post(f"{BASE_URL}/products/search")

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(TypeError, match=r"not both \(got request and q, limit\)"):
            await client.search_products(
                request=ProgrammaticProductSearchRequest(q="dress"),
                q="shoes",
                limit=10,
            )
        with pytest.raises(TypeError, match="not both"):
            await client.lookup_product(
                "https://example.com/p",
                request=ProgrammaticProductLookupRequest(url="https://example.com/p"),
            )

    assert not route.called


async def test_request_must_be_the_operations_model() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(
            TypeError, match="must be a ProgrammaticProductSearchRequest"
        ):
            await client.search_products(request={"q": "dress"})  # ty: ignore[invalid-argument-type]


async def test_operations_need_their_required_input_or_a_request() -> None:
    async with OctogenClient(api_key="key") as client:
        with pytest.raises(TypeError, match=r"lookup_product\(\) requires url"):
            await client.lookup_product()
        with pytest.raises(TypeError, match="requires html or request"):
            await client.resolve_product_from_html()
        with pytest.raises(TypeError, match="requires name or request"):
            await client.create_coverage_url_list()
        with pytest.raises(TypeError, match="requires urls or request"):
            await client.add_coverage_url_list_urls(LIST_ID)


@respx.mock
async def test_lookup_product_sends_a_prebuilt_request() -> None:
    route = respx.post(f"{BASE_URL}/products/lookup").mock(
        return_value=httpx.Response(200, json=LOOKUP)
    )

    async with OctogenClient(api_key="key") as client:
        await client.lookup_product(
            request=ProgrammaticProductLookupRequest(
                url="https://example.com/p",
                matchMode=ProductLookupMatchMode.STRICT,
            )
        )

    assert json.loads(route.calls.last.request.read()) == {
        "url": "https://example.com/p",
        "matchMode": "strict",
        "resolutionMode": "auto",
        "onDemandCachePolicy": "prefer_cache",
    }


@respx.mock
async def test_url_list_operations_send_a_prebuilt_request() -> None:
    route = respx.post(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls").mock(
        return_value=httpx.Response(
            200,
            json={"accepted": [], "rejected": [], "urlCount": 1, "requestId": "r"},
        )
    )

    async with OctogenClient(api_key="key") as client:
        await client.add_coverage_url_list_urls(
            LIST_ID, request=CoverageUrlsRequest(urls=["https://example.com/a"])
        )

    assert route.calls.last.request.read() == b'{"urls":["https://example.com/a"]}'


# ── S2: per-call timeout ────────────────────────────────────────────────────


@respx.mock
async def test_per_call_timeout_reaches_an_injected_client() -> None:
    route = respx.post(f"{BASE_URL}/products/search").mock(
        return_value=httpx.Response(200, json=EMPTY_PAGE)
    )

    async with httpx.AsyncClient(timeout=30.0) as http_client:
        client = OctogenClient(api_key="key", http_client=http_client)
        await client.search_products(q="dress", timeout=2.5)
        await client.search_products(q="dress", timeout=httpx.Timeout(4.0, connect=1.0))
        await client.search_products(q="dress")

    timeouts = [call.request.extensions["timeout"] for call in route.calls]
    assert timeouts == [
        {"connect": 2.5, "read": 2.5, "write": 2.5, "pool": 2.5},
        {"connect": 1.0, "read": 4.0, "write": 4.0, "pool": 4.0},
        # No per-call timeout keeps the injected client's own.
        {"connect": 30.0, "read": 30.0, "write": 30.0, "pool": 30.0},
    ]


@respx.mock
async def test_per_call_timeout_on_a_bodyless_operation() -> None:
    route = respx.get(f"{BASE_URL}/coverage/url-lists/{LIST_ID}").mock(
        return_value=httpx.Response(
            200,
            json={
                "urlListId": LIST_ID,
                "name": "tops",
                "status": "active",
                "urlCount": 0,
                "createdAt": "2026-10-14T00:00:00Z",
                "updatedAt": "2026-10-14T00:00:00Z",
            },
        )
    )

    async with OctogenClient(api_key="key") as client:
        await client.get_coverage_url_list(LIST_ID, timeout=0.75)

    assert route.calls.last.request.extensions["timeout"]["read"] == 0.75


# ── S3: typed errors ────────────────────────────────────────────────────────


async def _search_error(response: httpx.Response) -> OctogenAPIError:
    with respx.mock:
        respx.post(f"{BASE_URL}/products/search").mock(return_value=response)
        async with OctogenClient(api_key="key") as client:
            with pytest.raises(OctogenAPIError) as exc_info:
                await client.search_products(q="dress")
    return exc_info.value


async def test_429_is_a_rate_limit_error_with_retry_after() -> None:
    error = await _search_error(
        httpx.Response(
            429,
            json={"detail": "rate_limited"},
            headers={"Retry-After": "7", "x-request-id": "req-429"},
        )
    )

    assert isinstance(error, OctogenRateLimitError)
    assert error.status_code == 429
    assert error.retry_after == 7
    assert error.request_id == "req-429"
    assert error.detail == "rate_limited"


@pytest.mark.parametrize("status", [500, 502, 503])
async def test_5xx_is_a_server_error(status: int) -> None:
    error = await _search_error(
        httpx.Response(
            status, json={"detail": "upstream"}, headers={"x-request-id": "r"}
        )
    )

    assert isinstance(error, OctogenServerError)
    assert not isinstance(error, OctogenTimeoutError)
    assert error.status_code == status
    assert error.request_id == "r"


async def test_503_back_pressure_carries_retry_after() -> None:
    error = await _search_error(httpx.Response(503, headers={"Retry-After": "2"}))

    assert isinstance(error, OctogenServerError)
    assert error.retry_after == 2


async def test_504_is_a_timeout_error() -> None:
    error = await _search_error(
        httpx.Response(504, json={"detail": "deadline"}, headers={"x-request-id": "r"})
    )

    assert isinstance(error, OctogenGatewayTimeoutError)
    assert isinstance(error, OctogenTimeoutError)
    assert isinstance(error, OctogenConnectionError)
    assert isinstance(error, OctogenServerError)
    assert error.status_code == 504
    assert error.request_id == "r"


async def test_402_is_an_insufficient_credit_error() -> None:
    detail = {"code": "insufficient_credit", "top_up_url": "https://example.com"}
    error = await _search_error(httpx.Response(402, json={"detail": detail}))

    assert isinstance(error, OctogenInsufficientCreditError)
    assert error.status_code == 402
    assert error.detail == detail


@pytest.mark.parametrize(
    ("status", "error_class"),
    [(401, OctogenAuthenticationError), (404, OctogenNotFoundError)],
)
async def test_existing_error_classes_carry_request_id(
    status: int, error_class: type[OctogenAPIError]
) -> None:
    error = await _search_error(
        httpx.Response(status, json={"detail": "x"}, headers={"x-request-id": "rid"})
    )

    assert type(error) is error_class
    assert error.request_id == "rid"


async def test_request_id_is_none_without_the_header() -> None:
    error = await _search_error(httpx.Response(400, json={"detail": "bad"}))

    assert type(error) is OctogenAPIError
    assert error.request_id is None
    assert error.retry_after is None


@respx.mock
async def test_httpx_timeout_is_a_timeout_error() -> None:
    respx.post(f"{BASE_URL}/products/search").mock(
        side_effect=httpx.ReadTimeout("read timed out")
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenTimeoutError) as exc_info:
            await client.search_products(q="dress")

    assert isinstance(exc_info.value, OctogenConnectionError)
    assert not isinstance(exc_info.value, OctogenAPIError)
    assert isinstance(exc_info.value.__cause__, httpx.ReadTimeout)


@respx.mock
async def test_connect_error_is_a_connection_error_but_not_a_timeout() -> None:
    respx.post(f"{BASE_URL}/products/search").mock(
        side_effect=httpx.ConnectError("connection refused")
    )

    async with OctogenClient(api_key="key") as client:
        with pytest.raises(OctogenConnectionError) as exc_info:
            await client.search_products(q="dress")

    assert not isinstance(exc_info.value, OctogenTimeoutError)
    assert "connection refused" in str(exc_info.value)


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, None),
        ("7", 7),
        (" 12 ", 12),
        ("1.2", 2),
        ("0", 0),
        ("-3", 0),
        ("soon", None),
        ("", None),
        ("nan", None),
        ("inf", None),
    ],
)
def test_parse_retry_after(header: str | None, expected: int | None) -> None:
    assert _parse_retry_after(header) == expected


def test_parse_retry_after_accepts_an_http_date() -> None:
    later = datetime.now(UTC) + timedelta(seconds=90)
    parsed = _parse_retry_after(format_datetime(later, usegmt=True))

    assert parsed is not None
    assert 85 <= parsed <= 91
    past = datetime.now(UTC) - timedelta(hours=1)
    assert _parse_retry_after(format_datetime(past, usegmt=True)) == 0
