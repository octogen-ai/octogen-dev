"""Exception hierarchy for the Octogen SDK."""

from __future__ import annotations

from typing import Any

import httpx


class OctogenError(Exception):
    """Base class for all SDK errors."""


class MissingAPIKeyError(OctogenError):
    """Raised when no API key is provided and OCTOGEN_PLATFORM_API_KEY is unset."""


class OctogenConnectionError(OctogenError):
    """Raised when the API cannot be reached."""


class OctogenTimeoutError(OctogenConnectionError):
    """Raised when a request runs out of time.

    Covers both an ``httpx`` timeout (connect, read, write, or pool) and a
    ``504`` from the API. A ``504`` raises :class:`OctogenGatewayTimeoutError`,
    which is also an :class:`OctogenServerError` and carries the response
    fields. A refused or reset connection stays a plain
    :class:`OctogenConnectionError`, so callers can retry one and not the other.
    """


class OctogenAPIError(OctogenError):
    """Raised for non-2xx Octogen API responses.

    ``request_id`` is the response's ``x-request-id`` and ``retry_after`` its
    ``Retry-After`` in whole seconds (``None`` when absent or unparseable), so
    a caller can map the failure without reading ``response``.
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        detail: Any = None,
        response: httpx.Response | None = None,
        request_id: str | None = None,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail
        self.response = response
        self.request_id = request_id
        self.retry_after = retry_after


class OctogenAuthenticationError(OctogenAPIError):
    """Raised when the API key is missing, malformed, or invalid."""


class OctogenForbiddenError(OctogenAPIError):
    """Raised when a valid API key is not allowed to perform the request."""


class OctogenNotFoundError(OctogenAPIError):
    """Raised when a requested catalog or product is not found."""


class OctogenValidationError(OctogenAPIError):
    """Raised for request validation errors returned by the API."""


class OctogenInsufficientCreditError(OctogenAPIError):
    """Raised for a ``402``: the organization's prepaid credit is exhausted.

    ``detail`` carries ``code="insufficient_credit"``, ``top_up_url``, and the
    balance the API observed. Retrying will not help until credit is added.
    """


class OctogenRateLimitError(OctogenAPIError):
    """Raised for a ``429``. ``retry_after`` is the server's wait, in seconds."""


class OctogenServerError(OctogenAPIError):
    """Raised for a ``5xx`` response.

    The SDK never retries. Whether a status is safe to retry depends on the
    operation, so that stays with the caller; a ``503`` may carry
    ``retry_after``.
    """


class OctogenGatewayTimeoutError(OctogenTimeoutError, OctogenServerError):
    """Raised for a ``504``: the API ran out of time resolving the request.

    Both an :class:`OctogenTimeoutError` and an :class:`OctogenServerError`;
    catch it before either when the two are handled differently.
    """


class OctogenBigQueryError(OctogenError):
    """Raised when a BigQuery Analytics Hub subscribe operation fails."""


class OctogenBigQueryAccessPendingError(OctogenBigQueryError):
    """Raised when the subscriber principal isn't yet authorized on the listing.

    Octogen grants ``roles/analyticshub.subscriber`` asynchronously after the
    subscriber is registered; until that lands, subscribing fails with
    PermissionDenied. This is expected — retry in a few minutes.
    """


class OctogenBigQueryAlreadyExistsError(OctogenBigQueryError):
    """Raised when Analytics Hub reports the linked dataset already exists."""


class OctogenMCPError(OctogenError):
    """Raised when an Octogen MCP tool call or transport request fails."""
