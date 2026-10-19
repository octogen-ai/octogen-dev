"""The client's routing table: every ``/v1`` operation this SDK can reach.

Requests name an ``operationId``, never a path. The verb and the path template
live here, once, and ``tests/contract`` checks this table against the published
OpenAPI document in both directions: a published operation with no entry is an
operation the SDK cannot reach, and an entry the contract does not define is a
request that would 404. ``POST /products/recrawl`` — shipped in both SDKs, never
a real route — is exactly what that check catches.

Templates are contract paths, not URLs: ``OctogenClient`` substitutes
``{name}`` placeholders so the value here stays comparable to the contract
verbatim.
"""

from __future__ import annotations

import re
from typing import Final, NamedTuple
from urllib.parse import quote


class Operation(NamedTuple):
    """One published operation: an HTTP verb and a contract path template."""

    method: str
    path: str


OPERATIONS: Final[dict[str, Operation]] = {
    "addUrlListUrls": Operation("POST", "/coverage/url-lists/{urlListId}/urls"),
    "checkUrlListUrls": Operation(
        "POST", "/coverage/url-lists/{urlListId}/urls/contains"
    ),
    "countProductFacets": Operation("POST", "/products/facet-counts"),
    "createUrlList": Operation("POST", "/coverage/url-lists"),
    "deleteUrlList": Operation("DELETE", "/coverage/url-lists/{urlListId}"),
    "getMe": Operation("GET", "/me"),
    "getUrlList": Operation("GET", "/coverage/url-lists/{urlListId}"),
    "listDomains": Operation("GET", "/domains"),
    "listTaxonomyAttributeValues": Operation(
        "GET", "/taxonomy/attributes/{handle}/values"
    ),
    "listTaxonomyAttributes": Operation("GET", "/taxonomy/attributes"),
    "listTaxonomyCategories": Operation("GET", "/taxonomy/categories"),
    "listUrlListUrls": Operation("GET", "/coverage/url-lists/{urlListId}/urls"),
    "listUrlLists": Operation("GET", "/coverage/url-lists"),
    "lookupProduct": Operation("POST", "/products/lookup"),
    "moreLikeThisProducts": Operation("POST", "/products/more-like-this"),
    "parseProductAlias": Operation("POST", "/products/parse"),
    "removeUrlListUrls": Operation(
        "POST", "/coverage/url-lists/{urlListId}/urls/remove"
    ),
    "resolveProductFromHtml": Operation("POST", "/products/resolve-from-html"),
    "searchProducts": Operation("POST", "/products/search"),
}

_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def resolve_operation_path(
    template: str,
    path_params: dict[str, str] | None = None,
) -> str:
    """Substitute and percent-encode ``{name}`` placeholders in ``template``."""
    params = path_params or {}

    def substitute(match: re.Match[str]) -> str:
        name = match.group(1)
        value = params.get(name)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{name} must be a non-empty string")
        return quote(value.strip(), safe="")

    return _PLACEHOLDER.sub(substitute, template)
