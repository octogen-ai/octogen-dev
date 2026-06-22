from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from octogen_ai_sdk import _bigquery_autosubscribe_cli as cli
from octogen_ai_sdk.bigquery import BigQuerySubscriptionResult
from octogen_ai_sdk.bigquery_autosubscribe import (
    BigQueryMCPClient,
    autosubscribe_bigquery_listings,
)

LISTING = (
    "projects/octogen-catalog-exchange/locations/US/dataExchanges/catalogs_prod/"
    "listings/catalog_farfetch_exported_product_view_v1"
)
PROJECT = "customer-project"
PRINCIPAL = "serviceAccount:bq-reader@customer-project.iam.gserviceaccount.com"
DATASET = "octogen_catalog_farfetch_exported_product_view_v1"


class FakeMCP:
    def __init__(self, responses: dict[str, list[Any]]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        self.calls.append((name, arguments or {}))
        values = self.responses[name]
        assert values, f"no response left for {name}"
        return values.pop(0)


def _listing(catalog: str = "farfetch") -> dict[str, Any]:
    return {
        "catalogKey": catalog,
        "listingResource": LISTING,
        "linkedDatasetSuggestion": (
            f"octogen_catalog_{catalog}_exported_product_view_v1"
        ),
        "location": "US",
        "sampleQuery": (
            "SELECT * FROM `your-subscriber-project."
            f"octogen_catalog_{catalog}_exported_product_view_v1"
            ".products_current_v1` LIMIT 100;"
        ),
    }


def _subscriber(desired_state: str = "enabled") -> dict[str, Any]:
    return {
        "subscriberId": "bqsub_1",
        "subscriberProjectId": PROJECT,
        "subscriberPrincipal": PRINCIPAL,
        "desiredState": desired_state,
    }


def _detail(*, subscribers: list[dict[str, Any]], cells: list[dict[str, Any]]):
    return {
        "subscribers": subscribers,
        "eligibleCatalogs": [{"catalogKey": "farfetch"}],
        "cells": cells,
    }


def _cell(status: str, reason: str | None = None) -> dict[str, Any]:
    return {
        "subscriberId": "bqsub_1",
        "catalogKey": "farfetch",
        "status": status,
        "reasonCode": reason,
        "listingResource": LISTING,
        "linkedDatasetSuggestion": DATASET,
        "location": "US",
        "shareSchema": "exported_product_view",
        "schemaVersion": "v1",
    }


def test_dry_run_reports_missing_reader_without_registering() -> None:
    mcp = FakeMCP(
        {
            "list_bigquery_listing_resources": [[_listing()]],
            "list_bigquery_subscribers": [_detail(subscribers=[], cells=[])],
        }
    )

    result = autosubscribe_bigquery_listings(
        mcp=mcp,
        subscriber_project_id=PROJECT,
        subscriber_principal=PRINCIPAL,
    )

    assert result.applied is False
    assert result.would_register_subscriber is True
    assert result.registered_subscriber is False
    assert result.summary == {"pending": 1}
    assert [call[0] for call in mcp.calls] == [
        "list_bigquery_listing_resources",
        "list_bigquery_subscribers",
    ]


def test_apply_registers_missing_reader_subscribes_and_refreshes() -> None:
    subscribe_calls: list[dict[str, Any]] = []

    def fake_subscribe(**kwargs: Any) -> BigQuerySubscriptionResult:
        subscribe_calls.append(kwargs)
        return BigQuerySubscriptionResult(
            listing_resource=kwargs["listing_resource"],
            subscription_name=(
                "projects/customer-project/locations/US/subscriptions/sub1"
            ),
            state="STATE_ACTIVE",
            linked_project=PROJECT,
            linked_dataset=kwargs["destination_dataset_id"],
            already_subscribed=False,
            sample_query=(
                "SELECT * FROM "
                f"`{PROJECT}.{kwargs['destination_dataset_id']}"
                ".products_current_v1` LIMIT 10;"
            ),
        )

    mcp = FakeMCP(
        {
            "list_bigquery_listing_resources": [[_listing()]],
            "list_bigquery_subscribers": [
                _detail(subscribers=[], cells=[]),
                _detail(
                    subscribers=[_subscriber()], cells=[_cell("awaiting_subscription")]
                ),
            ],
            "register_bigquery_subscriber": [
                {
                    "subscriber": _subscriber(),
                    "cells": [_cell("preparing", "preparing")],
                }
            ],
            "refresh_bigquery_subscription_status": [
                {"catalogKey": "farfetch", "status": "active"}
            ],
        }
    )

    result = autosubscribe_bigquery_listings(
        mcp=mcp,
        subscriber_project_id=PROJECT,
        subscriber_principal=PRINCIPAL,
        apply=True,
        subscribe=fake_subscribe,
    )

    assert result.registered_subscriber is True
    assert result.would_register_subscriber is False
    assert result.summary == {"subscribed": 1}
    assert result.catalogs[0].status == "active"
    assert result.catalogs[0].refresh_status == "active"
    assert subscribe_calls == [
        {
            "listing_resource": LISTING,
            "destination_project": PROJECT,
            "destination_dataset_id": DATASET,
            "location": "US",
            "friendly_name": None,
        }
    ]
    assert [call[0] for call in mcp.calls] == [
        "list_bigquery_listing_resources",
        "list_bigquery_subscribers",
        "register_bigquery_subscriber",
        "list_bigquery_subscribers",
        "refresh_bigquery_subscription_status",
    ]
    assert mcp.calls[-1][1] == {
        "catalog_key": "farfetch",
        "subscriber_principal": PRINCIPAL,
        "share_schema": "exported_product_view",
        "schema_version": "v1",
    }


def test_apply_uses_registration_cells_when_follow_up_list_is_empty() -> None:
    def fail_subscribe(**_kwargs: Any) -> BigQuerySubscriptionResult:
        raise AssertionError("preparing cell should not subscribe")

    mcp = FakeMCP(
        {
            "list_bigquery_listing_resources": [[_listing()]],
            "list_bigquery_subscribers": [
                _detail(subscribers=[], cells=[]),
                _detail(subscribers=[_subscriber()], cells=[]),
            ],
            "register_bigquery_subscriber": [
                {
                    "subscriber": _subscriber(),
                    "cells": [_cell("preparing", "preparing")],
                }
            ],
        }
    )

    result = autosubscribe_bigquery_listings(
        mcp=mcp,
        subscriber_project_id=PROJECT,
        subscriber_principal=PRINCIPAL,
        apply=True,
        subscribe=fail_subscribe,
    )

    assert result.registered_subscriber is True
    assert result.summary == {"pending": 1}
    assert result.catalogs[0].status == "preparing"
    assert result.catalogs[0].reason_code == "preparing"


def test_existing_reader_without_cells_reports_granted_listings_pending() -> None:
    mcp = FakeMCP(
        {
            "list_bigquery_listing_resources": [[_listing()]],
            "list_bigquery_subscribers": [
                _detail(subscribers=[_subscriber()], cells=[]),
            ],
        }
    )

    result = autosubscribe_bigquery_listings(
        mcp=mcp,
        subscriber_project_id=PROJECT,
        subscriber_principal=PRINCIPAL,
        apply=True,
    )

    assert result.would_register_subscriber is False
    assert result.summary == {"pending": 1}
    assert result.catalogs[0].catalog_key == "farfetch"
    assert result.catalogs[0].listing_resource == LISTING
    assert "waiting for Octogen subscriber status" in (result.catalogs[0].message or "")


def test_disabled_reader_is_not_registered_again() -> None:
    mcp = FakeMCP(
        {
            "list_bigquery_listing_resources": [[_listing()]],
            "list_bigquery_subscribers": [
                _detail(subscribers=[_subscriber("disabled")], cells=[]),
            ],
        }
    )

    result = autosubscribe_bigquery_listings(
        mcp=mcp,
        subscriber_project_id=PROJECT,
        subscriber_principal=PRINCIPAL,
        apply=True,
    )

    assert result.subscriber_id == "bqsub_1"
    assert result.would_register_subscriber is False
    assert result.registered_subscriber is False
    assert result.summary == {"pending": 1}
    assert result.catalogs[0].status == "disabled"
    assert [call[0] for call in mcp.calls] == [
        "list_bigquery_listing_resources",
        "list_bigquery_subscribers",
    ]


def test_apply_skips_already_active_cell() -> None:
    def fail_subscribe(**_kwargs: Any) -> BigQuerySubscriptionResult:
        raise AssertionError("subscribe should not be called")

    mcp = FakeMCP(
        {
            "list_bigquery_listing_resources": [[_listing()]],
            "list_bigquery_subscribers": [
                _detail(subscribers=[_subscriber()], cells=[_cell("active")])
            ],
        }
    )

    result = autosubscribe_bigquery_listings(
        mcp=mcp,
        subscriber_project_id=PROJECT,
        subscriber_principal=PRINCIPAL,
        apply=True,
        subscribe=fail_subscribe,
    )

    assert result.summary == {"already_active": 1}
    assert [call[0] for call in mcp.calls] == [
        "list_bigquery_listing_resources",
        "list_bigquery_subscribers",
    ]


def test_mcp_client_extracts_structured_tool_result() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        body = json.loads(request.content)
        if body["method"] == "initialize":
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body["id"], "result": {}},
            )
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": body["id"],
                "result": {
                    "structuredContent": {"result": [{"catalogKey": "farfetch"}]}
                },
            },
        )

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    with BigQueryMCPClient(
        mcp_url="https://mcp.example.test/mcp/",
        access_token_provider=lambda: "token-1",
        http_client=http_client,
    ) as client:
        value = client.call_tool("list_bigquery_listing_resources", {})

    assert value == [{"catalogKey": "farfetch"}]
    assert requests[0].headers["Authorization"] == "Bearer token-1"
    assert requests[0].headers["MCP-Protocol-Version"] == "2025-06-18"


def test_refresh_token_provider_persists_rotated_token(tmp_path: Path) -> None:
    token_file = tmp_path / "octogen-mcp.refresh"
    token_file.write_text("refresh-old\n")
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "access_token": "access-1",
                "refresh_token": "refresh-new",
                "expires_in": 300,
            },
        )

    provider = cli._RefreshTokenProvider(
        client_id="client_123",
        refresh_token=None,
        refresh_token_file=token_file,
        token_endpoint="https://auth.example.test/oauth2/token",
        timeout=5.0,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert provider() == "access-1"
    assert provider() == "access-1"
    assert token_file.read_text() == "refresh-new\n"
    assert len(requests) == 1
    assert b"refresh_token=refresh-old" in requests[0].content
    assert b"client_id=client_123" in requests[0].content
