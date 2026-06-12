"""Cron-friendly BigQuery subscriber automation for Octogen MCP.

The tool in this module connects the Octogen MCP BigQuery subscriber control
plane to the local BigQuery Analytics Hub subscribe helper. It is intentionally
one-shot and idempotent: run it from cron, and each run registers the customer
Reader if needed, subscribes any ready listings that are not yet active, then
asks Octogen to refresh the subscription status.
"""

from __future__ import annotations

import itertools
import json
from collections.abc import Callable
from typing import Any, Literal, Protocol

import httpx
from pydantic import BaseModel, ConfigDict

from octogen_ai_sdk.bigquery import BigQuerySubscriptionResult, subscribe_to_listing
from octogen_ai_sdk.errors import (
    OctogenBigQueryAccessPendingError,
    OctogenBigQueryError,
    OctogenMCPError,
)

DEFAULT_MCP_URL = "https://mcp.octogen.ai/mcp/"
MCP_PROTOCOL_VERSION = "2025-06-18"

CatalogAction = Literal[
    "already_active",
    "already_subscribed",
    "subscribed",
    "would_subscribe",
    "pending",
    "skipped",
    "error",
]


class MCPToolCaller(Protocol):
    """Minimal tool-calling seam used by the autosubscribe orchestrator."""

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any: ...


class SubscribeListing(Protocol):
    """Injectable BigQuery subscribe operation for tests and custom callers."""

    def __call__(
        self,
        *,
        listing_resource: str,
        destination_project: str,
        destination_dataset_id: str | None = None,
        location: str | None = None,
        friendly_name: str | None = None,
    ) -> BigQuerySubscriptionResult: ...


class BigQueryMCPClient:
    """Small synchronous MCP JSON-RPC client for Octogen's Streamable HTTP endpoint."""

    def __init__(
        self,
        *,
        mcp_url: str = DEFAULT_MCP_URL,
        access_token: str | None = None,
        access_token_provider: Callable[[], str] | None = None,
        timeout: float = 30.0,
        http_client: httpx.Client | None = None,
    ) -> None:
        if access_token_provider is None and not access_token:
            raise OctogenMCPError(
                "MCP access token is required. Pass access_token or an "
                "access_token_provider."
            )
        self._mcp_url = mcp_url
        self._access_token = access_token
        self._access_token_provider = access_token_provider
        self._timeout = timeout
        self._client = http_client or httpx.Client(timeout=timeout)
        self._owns_client = http_client is None
        self._ids = itertools.count(1)
        self._initialized = False

    def __enter__(self) -> BigQueryMCPClient:
        self.initialize()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def initialize(self) -> None:
        if self._initialized:
            return
        self._post(
            "initialize",
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {
                    "name": "octogen-bq-autosubscribe",
                    "version": "1",
                },
            },
        )
        self._initialized = True

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        if not self._initialized:
            self.initialize()
        data = self._post(
            "tools/call",
            {"name": name, "arguments": arguments or {}},
        )
        value = _extract_tool_value(data)
        _raise_tool_error(name, value)
        return value

    def _post(self, method: str, params: dict[str, Any] | None) -> dict[str, Any]:
        body: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": next(self._ids),
            "method": method,
        }
        if params is not None:
            body["params"] = params
        try:
            response = self._client.post(
                self._mcp_url,
                headers=self._headers(),
                json=body,
                timeout=self._timeout,
                follow_redirects=True,
            )
        except httpx.RequestError as exc:
            raise OctogenMCPError(f"MCP request failed: {exc}") from exc
        if response.status_code >= 400:
            raise OctogenMCPError(
                f"MCP {method} failed with HTTP {response.status_code}: "
                f"{_response_excerpt(response)}"
            )
        try:
            data = response.json()
        except ValueError as exc:
            raise OctogenMCPError(
                f"MCP {method} returned non-JSON response: "
                f"{_response_excerpt(response)}"
            ) from exc
        if not isinstance(data, dict):
            raise OctogenMCPError(f"MCP {method} returned unexpected JSON shape.")
        if data.get("error"):
            raise OctogenMCPError(
                f"MCP {method} failed: {json.dumps(data['error'], sort_keys=True)}"
            )
        return data

    def _headers(self) -> dict[str, str]:
        token = (
            self._access_token_provider()
            if self._access_token_provider is not None
            else self._access_token
        )
        if not token:
            raise OctogenMCPError("MCP access token provider returned an empty token.")
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        }


class BigQueryAutoSubscribeCatalogResult(BaseModel):
    """Per-catalog outcome for one autosubscribe run."""

    model_config = ConfigDict(populate_by_name=True)

    catalog_key: str
    action: CatalogAction
    status: str | None = None
    reason_code: str | None = None
    listing_resource: str | None = None
    linked_dataset: str | None = None
    sample_query: str | None = None
    refresh_status: str | None = None
    message: str | None = None


class BigQueryAutoSubscribeResult(BaseModel):
    """Summary payload emitted by the autosubscribe CLI."""

    model_config = ConfigDict(populate_by_name=True)

    applied: bool
    subscriber_project_id: str
    subscriber_principal: str
    subscriber_id: str | None
    registered_subscriber: bool
    would_register_subscriber: bool
    catalogs: list[BigQueryAutoSubscribeCatalogResult]
    summary: dict[str, int]


def autosubscribe_bigquery_listings(
    *,
    mcp: MCPToolCaller,
    subscriber_project_id: str,
    subscriber_principal: str,
    apply: bool = False,
    catalogs: list[str] | None = None,
    friendly_name: str | None = None,
    subscribe: SubscribeListing = subscribe_to_listing,
) -> BigQueryAutoSubscribeResult:
    """Subscribe the configured Reader to every ready BigQuery listing.

    This function performs one idempotent sync pass. Without ``apply`` it only
    reports what would happen. With ``apply`` it may register the Octogen
    subscriber desired state and create linked datasets in ``subscriber_project_id``.
    """

    requested_catalogs = _clean_catalogs(catalogs)
    listing_args = {"catalogs": requested_catalogs} if requested_catalogs else {}
    listings = _as_list(
        mcp.call_tool("list_bigquery_listing_resources", listing_args),
        tool="list_bigquery_listing_resources",
    )
    listing_by_catalog = {
        str(item.get("catalogKey")): item
        for item in listings
        if isinstance(item, dict) and item.get("catalogKey")
    }

    detail = _as_dict(
        mcp.call_tool("list_bigquery_subscribers", {}),
        tool="list_bigquery_subscribers",
    )
    subscriber = _find_subscriber(
        detail,
        subscriber_project_id=subscriber_project_id,
        subscriber_principal=subscriber_principal,
        enabled_only=True,
    )
    registered_subscriber = False
    would_register_subscriber = subscriber is None

    if subscriber is None and apply:
        created = _as_dict(
            mcp.call_tool(
                "register_bigquery_subscriber",
                {
                    "request": {
                        "subscriberProjectId": subscriber_project_id,
                        "subscriberPrincipal": subscriber_principal,
                    }
                },
            ),
            tool="register_bigquery_subscriber",
        )
        subscriber = _as_dict(
            created.get("subscriber"), tool="register_bigquery_subscriber.subscriber"
        )
        registered_subscriber = True
        detail = _as_dict(
            mcp.call_tool("list_bigquery_subscribers", {}),
            tool="list_bigquery_subscribers",
        )

    if subscriber is None:
        results = [
            BigQueryAutoSubscribeCatalogResult(
                catalog_key=catalog_key,
                action="pending",
                listing_resource=_string_or_none(listing.get("listingResource")),
                linked_dataset=_string_or_none(listing.get("linkedDatasetSuggestion")),
                sample_query=_string_or_none(listing.get("sampleQuery")),
                message=(
                    "Reader is not registered. Run with --apply to register it; "
                    "a later run can subscribe once Octogen grants listing access."
                ),
            )
            for catalog_key, listing in sorted(listing_by_catalog.items())
        ]
        return _result(
            apply=apply,
            subscriber_project_id=subscriber_project_id,
            subscriber_principal=subscriber_principal,
            subscriber_id=None,
            registered_subscriber=False,
            would_register_subscriber=would_register_subscriber,
            catalogs=results,
        )

    subscriber_id = str(subscriber.get("subscriberId") or "")
    cells = _subscriber_cells(detail, subscriber_id=subscriber_id)
    if requested_catalogs:
        requested_set = set(requested_catalogs)
        cells = [cell for cell in cells if cell.get("catalogKey") in requested_set]
    results = [
        _handle_cell(
            mcp=mcp,
            cell=cell,
            listing=_as_optional_dict(
                listing_by_catalog.get(str(cell.get("catalogKey")))
            ),
            subscriber_project_id=subscriber_project_id,
            subscriber_principal=subscriber_principal,
            apply=apply,
            friendly_name=friendly_name,
            subscribe=subscribe,
        )
        for cell in sorted(cells, key=lambda item: str(item.get("catalogKey") or ""))
    ]

    return _result(
        apply=apply,
        subscriber_project_id=subscriber_project_id,
        subscriber_principal=subscriber_principal,
        subscriber_id=subscriber_id or None,
        registered_subscriber=registered_subscriber,
        would_register_subscriber=would_register_subscriber,
        catalogs=results,
    )


def _handle_cell(
    *,
    mcp: MCPToolCaller,
    cell: dict[str, Any],
    listing: dict[str, Any] | None,
    subscriber_project_id: str,
    subscriber_principal: str,
    apply: bool,
    friendly_name: str | None,
    subscribe: SubscribeListing,
) -> BigQueryAutoSubscribeCatalogResult:
    catalog_key = str(cell.get("catalogKey") or "")
    status = _string_or_none(cell.get("status"))
    reason_code = _string_or_none(cell.get("reasonCode"))
    listing_resource = _string_or_none(cell.get("listingResource")) or _string_or_none(
        (listing or {}).get("listingResource")
    )
    linked_dataset = _string_or_none(
        cell.get("linkedDatasetSuggestion")
    ) or _string_or_none((listing or {}).get("linkedDatasetSuggestion"))
    sample_query = _string_or_none(cell.get("sampleQuery")) or _string_or_none(
        (listing or {}).get("sampleQuery")
    )

    if status in {"active", "source_stale"}:
        return BigQueryAutoSubscribeCatalogResult(
            catalog_key=catalog_key,
            action="already_active",
            status=status,
            reason_code=reason_code,
            listing_resource=listing_resource,
            linked_dataset=linked_dataset,
            sample_query=sample_query,
        )

    if status != "awaiting_subscription":
        return _non_ready_cell_result(
            catalog_key=catalog_key,
            status=status,
            reason_code=reason_code,
            listing_resource=listing_resource,
            linked_dataset=linked_dataset,
            sample_query=sample_query,
        )

    if not apply:
        return BigQueryAutoSubscribeCatalogResult(
            catalog_key=catalog_key,
            action="would_subscribe",
            status=status,
            reason_code=reason_code,
            listing_resource=listing_resource,
            linked_dataset=linked_dataset,
            sample_query=sample_query,
            message="Run with --apply to create the linked dataset.",
        )

    if not listing_resource:
        return BigQueryAutoSubscribeCatalogResult(
            catalog_key=catalog_key,
            action="error",
            status=status,
            reason_code=reason_code,
            linked_dataset=linked_dataset,
            sample_query=sample_query,
            message="Cell is ready but no listingResource was returned.",
        )

    try:
        subscription = subscribe(
            listing_resource=listing_resource,
            destination_project=subscriber_project_id,
            destination_dataset_id=linked_dataset,
            location=_string_or_none(cell.get("location"))
            or _string_or_none((listing or {}).get("location")),
            friendly_name=friendly_name,
        )
    except OctogenBigQueryAccessPendingError as exc:
        return BigQueryAutoSubscribeCatalogResult(
            catalog_key=catalog_key,
            action="pending",
            status=status,
            reason_code=reason_code,
            listing_resource=listing_resource,
            linked_dataset=linked_dataset,
            sample_query=sample_query,
            message=str(exc),
        )
    except OctogenBigQueryError as exc:
        return BigQueryAutoSubscribeCatalogResult(
            catalog_key=catalog_key,
            action="error",
            status=status,
            reason_code=reason_code,
            listing_resource=listing_resource,
            linked_dataset=linked_dataset,
            sample_query=sample_query,
            message=str(exc),
        )

    try:
        refreshed = _as_dict(
            mcp.call_tool(
                "refresh_bigquery_subscription_status",
                {
                    "catalog_key": catalog_key,
                    "subscriber_principal": subscriber_principal,
                    "share_schema": cell.get("shareSchema")
                    or "exported_product_view_v1",
                    "schema_version": cell.get("schemaVersion") or "v1",
                },
            ),
            tool="refresh_bigquery_subscription_status",
        )
    except OctogenMCPError as exc:
        return BigQueryAutoSubscribeCatalogResult(
            catalog_key=catalog_key,
            action="error",
            status=status,
            reason_code=reason_code,
            listing_resource=listing_resource,
            linked_dataset=subscription.linked_dataset,
            sample_query=subscription.sample_query,
            message=f"Subscribed, but Octogen status refresh failed: {exc}",
        )

    action: CatalogAction = (
        "already_subscribed" if subscription.already_subscribed else "subscribed"
    )
    return BigQueryAutoSubscribeCatalogResult(
        catalog_key=catalog_key,
        action=action,
        status=status,
        reason_code=reason_code,
        listing_resource=listing_resource,
        linked_dataset=subscription.linked_dataset,
        sample_query=subscription.sample_query,
        refresh_status=_string_or_none(refreshed.get("status")),
    )


def _non_ready_cell_result(
    *,
    catalog_key: str,
    status: str | None,
    reason_code: str | None,
    listing_resource: str | None,
    linked_dataset: str | None,
    sample_query: str | None,
) -> BigQueryAutoSubscribeCatalogResult:
    if (
        status in {"refresh_failed", "access_grant_failed"}
        or reason_code == "needs_attention"
    ):
        return BigQueryAutoSubscribeCatalogResult(
            catalog_key=catalog_key,
            action="error",
            status=status,
            reason_code=reason_code,
            listing_resource=listing_resource,
            linked_dataset=linked_dataset,
            sample_query=sample_query,
            message="Octogen reports this catalog needs attention.",
        )
    if reason_code in {"catalog_not_enabled", "scope_revoked", "removing"}:
        return BigQueryAutoSubscribeCatalogResult(
            catalog_key=catalog_key,
            action="skipped",
            status=status,
            reason_code=reason_code,
            listing_resource=listing_resource,
            linked_dataset=linked_dataset,
            sample_query=sample_query,
            message=f"Catalog is not ready for subscription ({reason_code}).",
        )
    return BigQueryAutoSubscribeCatalogResult(
        catalog_key=catalog_key,
        action="pending",
        status=status,
        reason_code=reason_code,
        listing_resource=listing_resource,
        linked_dataset=linked_dataset,
        sample_query=sample_query,
        message="Waiting for Octogen to grant Analytics Hub subscriber access.",
    )


def _extract_tool_value(data: dict[str, Any]) -> Any:
    result = data.get("result")
    if not isinstance(result, dict):
        raise OctogenMCPError("MCP response is missing result.")
    structured = result.get("structuredContent")
    if isinstance(structured, dict) and "result" in structured:
        return structured["result"]

    # Fallback for MCP servers/clients that only expose textual tool content.
    content = result.get("content")
    if isinstance(content, list):
        for part in content:
            if not isinstance(part, dict) or part.get("type") != "text":
                continue
            text = part.get("text")
            if not isinstance(text, str):
                continue
            try:
                return json.loads(text)
            except ValueError:
                return text
    raise OctogenMCPError("MCP tool response is missing structuredContent.result.")


def _raise_tool_error(tool: str, value: Any) -> None:
    if isinstance(value, dict) and value.get("error"):
        message = value.get("message") or value.get("error")
        raise OctogenMCPError(f"MCP tool {tool} failed: {message}")


def _result(
    *,
    apply: bool,
    subscriber_project_id: str,
    subscriber_principal: str,
    subscriber_id: str | None,
    registered_subscriber: bool,
    would_register_subscriber: bool,
    catalogs: list[BigQueryAutoSubscribeCatalogResult],
) -> BigQueryAutoSubscribeResult:
    summary: dict[str, int] = {}
    for item in catalogs:
        summary[item.action] = summary.get(item.action, 0) + 1
    return BigQueryAutoSubscribeResult(
        applied=apply,
        subscriber_project_id=subscriber_project_id,
        subscriber_principal=subscriber_principal,
        subscriber_id=subscriber_id,
        registered_subscriber=registered_subscriber,
        would_register_subscriber=would_register_subscriber,
        catalogs=catalogs,
        summary=summary,
    )


def _subscriber_cells(
    detail: dict[str, Any], *, subscriber_id: str
) -> list[dict[str, Any]]:
    cells = detail.get("cells") or []
    if not isinstance(cells, list):
        raise OctogenMCPError("list_bigquery_subscribers returned invalid cells.")
    return [
        cell
        for cell in cells
        if isinstance(cell, dict)
        and str(cell.get("subscriberId") or "") == subscriber_id
    ]


def _find_subscriber(
    detail: dict[str, Any],
    *,
    subscriber_project_id: str,
    subscriber_principal: str,
    enabled_only: bool,
) -> dict[str, Any] | None:
    subscribers = detail.get("subscribers") or []
    if not isinstance(subscribers, list):
        raise OctogenMCPError("list_bigquery_subscribers returned invalid subscribers.")
    for subscriber in subscribers:
        if not isinstance(subscriber, dict):
            continue
        if subscriber.get("subscriberProjectId") != subscriber_project_id:
            continue
        if subscriber.get("subscriberPrincipal") != subscriber_principal:
            continue
        if enabled_only and subscriber.get("desiredState") != "enabled":
            continue
        return subscriber
    return None


def _clean_catalogs(catalogs: list[str] | None) -> list[str]:
    if not catalogs:
        return []
    seen: set[str] = set()
    cleaned: list[str] = []
    for catalog in catalogs:
        item = str(catalog or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        cleaned.append(item)
    return cleaned


def _as_dict(value: Any, *, tool: str) -> dict[str, Any]:
    _raise_tool_error(tool, value)
    if not isinstance(value, dict):
        raise OctogenMCPError(
            f"{tool} returned {type(value).__name__}, expected object."
        )
    return value


def _as_optional_dict(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _as_list(value: Any, *, tool: str) -> list[Any]:
    _raise_tool_error(tool, value)
    if not isinstance(value, list):
        raise OctogenMCPError(f"{tool} returned {type(value).__name__}, expected list.")
    return value


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text else None


def _response_excerpt(response: httpx.Response) -> str:
    text = response.text.strip()
    return text[:500] if text else "<empty response>"
