"""Exception hierarchy for the Octogen SDK."""

from __future__ import annotations

from typing import Any

import httpx


class OctogenError(Exception):
    """Base class for all SDK errors."""


class MissingAPIKeyError(OctogenError):
    """Raised when no API key is provided and OCTO_API_KEY is unset."""


class OctogenConnectionError(OctogenError):
    """Raised when the API cannot be reached."""


class OctogenAPIError(OctogenError):
    """Raised for non-2xx Octogen API responses."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        detail: Any = None,
        response: httpx.Response | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail
        self.response = response


class OctogenAuthenticationError(OctogenAPIError):
    """Raised when the API key is missing, malformed, or invalid."""


class OctogenForbiddenError(OctogenAPIError):
    """Raised when a valid API key is not allowed to perform the request."""


class OctogenNotFoundError(OctogenAPIError):
    """Raised when a requested catalog or product is not found."""


class OctogenValidationError(OctogenAPIError):
    """Raised for request validation errors returned by the API."""
