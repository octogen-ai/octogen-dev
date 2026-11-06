"""Retry 429 and 5xx responses at the transport, under every client method."""

from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

import httpx

#: Statuses worth another attempt: rate limited, or a server-side failure.
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})

DEFAULT_MAX_RETRIES = 2
_BACKOFF_BASE = 0.5
_BACKOFF_CAP = 8.0
#: A ``Retry-After`` longer than this is the server asking us to stop, not to
#: wait, so the response is returned (and raised) instead of slept on.
_RETRY_AFTER_CAP = 60.0


class RetryTransport(httpx.AsyncBaseTransport):
    """Wrap a transport and retry 429/5xx responses and failed connections.

    Waits ``Retry-After`` when the server sends one, else exponential backoff
    with full jitter. Only connection failures are retried, never read
    timeouts: a request that timed out mid-flight may have done its (billed)
    work, and an on-demand lookup can legitimately be slow.
    """

    def __init__(
        self,
        inner: httpx.AsyncBaseTransport | None = None,
        *,
        max_retries: int = DEFAULT_MAX_RETRIES,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        if max_retries < 0:
            raise ValueError("max_retries must be >= 0")
        self._inner = inner or httpx.AsyncHTTPTransport()
        self._max_retries = max_retries
        self._sleep = sleep

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        attempt = 0
        while True:
            try:
                response = await self._inner.handle_async_request(request)
            except (httpx.ConnectError, httpx.ConnectTimeout):
                if attempt >= self._max_retries:
                    raise
                delay = _backoff(attempt)
            else:
                if (
                    response.status_code not in RETRY_STATUSES
                    or attempt >= self._max_retries
                ):
                    return response
                retry_after = _retry_after_seconds(response.headers.get("Retry-After"))
                if retry_after is not None and retry_after > _RETRY_AFTER_CAP:
                    return response
                delay = retry_after if retry_after is not None else _backoff(attempt)
                await response.aclose()
            attempt += 1
            await self._sleep(delay)

    async def aclose(self) -> None:
        await self._inner.aclose()


def _backoff(attempt: int) -> float:
    return random.uniform(0, min(_BACKOFF_CAP, _BACKOFF_BASE * 2**attempt))


def _retry_after_seconds(value: str | None) -> float | None:
    """``Retry-After`` as seconds: delta-seconds or an HTTP date."""
    if not value:
        return None
    value = value.strip()
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    try:
        when = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    return max(0.0, (when - datetime.now(UTC)).total_seconds())
