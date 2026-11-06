from __future__ import annotations

import json

import httpx
import pytest
from storerouter import AsyncStoreRouter, RateLimitError, RetryTransport
from storerouter._retry import _retry_after_seconds


class Sleeps:
    def __init__(self) -> None:
        self.delays: list[float] = []

    async def __call__(self, delay: float) -> None:
        self.delays.append(delay)


def scripted(*steps: int | Exception) -> tuple[httpx.MockTransport, list[bytes]]:
    """A transport answering with each status (or raising) in turn."""
    bodies: list[bytes] = []
    remaining = list(steps)

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(request.read())
        step = remaining.pop(0)
        if isinstance(step, Exception):
            raise step
        return httpx.Response(step, json={"detail": str(step)})

    return httpx.MockTransport(handler), bodies


async def send(transport: RetryTransport) -> httpx.Response:
    async with httpx.AsyncClient(transport=transport) as client:
        return await client.post("https://api.test/v1/products/search", json={"q": "x"})


@pytest.mark.parametrize("status", [429, 500, 502, 503, 504])
async def test_retries_retryable_status_then_succeeds(status: int) -> None:
    inner, bodies = scripted(status, 200)
    sleeps = Sleeps()
    response = await send(RetryTransport(inner, max_retries=2, sleep=sleeps))
    assert response.status_code == 200
    assert len(bodies) == 2
    assert len(sleeps.delays) == 1
    # The request body is replayed intact.
    assert bodies[0] == bodies[1]
    assert json.loads(bodies[1]) == {"q": "x"}


@pytest.mark.parametrize("status", [400, 401, 402, 403, 404, 422])
async def test_does_not_retry_client_errors(status: int) -> None:
    inner, bodies = scripted(status)
    sleeps = Sleeps()
    response = await send(RetryTransport(inner, sleep=sleeps))
    assert response.status_code == status
    assert len(bodies) == 1
    assert sleeps.delays == []


async def test_gives_up_after_max_retries_and_returns_last_response() -> None:
    inner, bodies = scripted(503, 503, 503)
    sleeps = Sleeps()
    response = await send(RetryTransport(inner, max_retries=2, sleep=sleeps))
    assert response.status_code == 503
    assert len(bodies) == 3
    assert len(sleeps.delays) == 2


async def test_max_retries_zero_disables_retries() -> None:
    inner, bodies = scripted(503)
    response = await send(RetryTransport(inner, max_retries=0, sleep=Sleeps()))
    assert response.status_code == 503
    assert len(bodies) == 1


async def test_honors_retry_after_seconds() -> None:
    responses = [httpx.Response(429, headers={"Retry-After": "3"}), httpx.Response(200)]

    def handler(request: httpx.Request) -> httpx.Response:
        return responses.pop(0)

    sleeps = Sleeps()
    response = await send(RetryTransport(httpx.MockTransport(handler), sleep=sleeps))
    assert response.status_code == 200
    assert sleeps.delays == [3.0]


async def test_long_retry_after_is_returned_not_slept_on() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"Retry-After": "3600"})

    sleeps = Sleeps()
    response = await send(RetryTransport(httpx.MockTransport(handler), sleep=sleeps))
    assert response.status_code == 429
    assert sleeps.delays == []


async def test_backoff_without_retry_after_is_bounded() -> None:
    inner, _ = scripted(500, 500, 500, 500, 500, 200)
    sleeps = Sleeps()
    await send(RetryTransport(inner, max_retries=5, sleep=sleeps))
    assert len(sleeps.delays) == 5
    assert all(0 <= delay <= 8.0 for delay in sleeps.delays)


async def test_retries_failed_connections() -> None:
    inner, bodies = scripted(httpx.ConnectError("refused"), 200)
    response = await send(RetryTransport(inner, sleep=Sleeps()))
    assert response.status_code == 200
    assert len(bodies) == 2


async def test_does_not_retry_read_timeouts() -> None:
    inner, bodies = scripted(httpx.ReadTimeout("slow"), 200)
    with pytest.raises(httpx.ReadTimeout):
        await send(RetryTransport(inner, sleep=Sleeps()))
    assert len(bodies) == 1


def test_negative_max_retries_is_rejected() -> None:
    with pytest.raises(ValueError):
        RetryTransport(max_retries=-1)


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, None), ("", None), ("2", 2.0), ("0.5", 0.5), ("-4", 0.0), ("soon", None)],
)
def test_retry_after_parsing(value: str | None, expected: float | None) -> None:
    assert _retry_after_seconds(value) == expected


def test_retry_after_http_date_in_the_past_is_zero() -> None:
    assert _retry_after_seconds("Wed, 21 Oct 2015 07:28:00 GMT") == 0.0


async def test_client_raises_typed_error_once_retries_are_spent() -> None:
    inner, bodies = scripted(429, 429)
    http_client = httpx.AsyncClient(
        transport=RetryTransport(inner, max_retries=1, sleep=Sleeps())
    )
    async with AsyncStoreRouter(
        api_key="sk_test", base_url="https://api.test/v1", http_client=http_client
    ) as client:
        with pytest.raises(RateLimitError):
            await client.search_products(q="linen shirt")
    assert len(bodies) == 2
    await http_client.aclose()
