"""Tests for the BigQuery Analytics Hub subscribe helper.

The google dependency is encapsulated behind ListingSubscriber, so the
orchestration, parsing, and error mapping are tested with no GCP access.
"""

from __future__ import annotations

import pytest
from octogen_ai_sdk import bigquery as bq
from octogen_ai_sdk.errors import (
    OctogenBigQueryAccessPendingError,
    OctogenBigQueryError,
)

LISTING = "projects/octogen-prod/locations/us/dataExchanges/oneoff/listings/farfetch"


class FakeSubscriber:
    """In-memory ListingSubscriber for tests."""

    def __init__(self, *, existing: bq._SubscriptionInfo | None = None) -> None:
        self._existing = existing
        self.subscribe_calls: list[dict] = []

    def find_existing(self, *, project, location, listing_resource):  # noqa: ANN001
        return self._existing

    def subscribe(
        self, *, listing_resource, project, dataset_id, location, friendly_name
    ):  # noqa: ANN001
        self.subscribe_calls.append(
            {
                "listing_resource": listing_resource,
                "project": project,
                "dataset_id": dataset_id,
                "location": location,
                "friendly_name": friendly_name,
            }
        )
        return bq._SubscriptionInfo(
            name=f"projects/{project}/locations/{location}/subscriptions/sub_x",
            state="STATE_ACTIVE",
            linked_project=project,
            linked_dataset=dataset_id,
        )


class TestParsing:
    def test_parse_listing_resource_extracts_parts(self) -> None:
        parts = bq.parse_listing_resource(f"  {LISTING}  ")
        assert parts.project == "octogen-prod"
        assert parts.location == "us"
        assert parts.exchange == "oneoff"
        assert parts.listing == "farfetch"
        assert parts.raw == LISTING

    @pytest.mark.parametrize(
        "bad",
        [
            "farfetch",
            "projects/p/datasets/d",
            "projects/p/locations/us/listings/x",  # missing dataExchanges
        ],
    )
    def test_parse_listing_resource_rejects_bad_input(self, bad: str) -> None:
        with pytest.raises(OctogenBigQueryError, match="Invalid listing resource"):
            bq.parse_listing_resource(bad)

    def test_default_dataset_id_sanitizes(self) -> None:
        assert bq.default_dataset_id("farfetch") == "octogen_farfetch"
        assert bq.default_dataset_id("apc-us") == "octogen_apc_us"
        assert bq.default_dataset_id("--weird--") == "octogen_weird"

    def test_build_sample_query(self) -> None:
        q = bq.build_sample_query("proj", "octogen_farfetch")
        assert "`proj.octogen_farfetch.product`" in q


class TestSubscribeOrchestration:
    def test_first_time_subscribe_derives_location_and_dataset(self) -> None:
        sub = FakeSubscriber()
        result = bq.subscribe_to_listing(
            listing_resource=LISTING,
            destination_project="my-proj",
            subscriber=sub,
        )
        assert result.already_subscribed is False
        assert result.linked_project == "my-proj"
        assert result.linked_dataset == "octogen_farfetch"
        assert result.state == "STATE_ACTIVE"
        assert "`my-proj.octogen_farfetch.product`" in result.sample_query
        # Location + dataset id were derived from the listing resource.
        [call] = sub.subscribe_calls
        assert call["location"] == "us"
        assert call["dataset_id"] == "octogen_farfetch"

    def test_explicit_dataset_and_location_win(self) -> None:
        sub = FakeSubscriber()
        bq.subscribe_to_listing(
            listing_resource=LISTING,
            destination_project="my-proj",
            destination_dataset_id="custom_ds",
            location="eu",
            subscriber=sub,
        )
        [call] = sub.subscribe_calls
        assert call["dataset_id"] == "custom_ds"
        assert call["location"] == "eu"

    def test_idempotent_when_already_subscribed(self) -> None:
        existing = bq._SubscriptionInfo(
            name="projects/my-proj/locations/us/subscriptions/sub_existing",
            state="STATE_ACTIVE",
            linked_project="my-proj",
            linked_dataset="octogen_farfetch",
        )
        sub = FakeSubscriber(existing=existing)
        result = bq.subscribe_to_listing(
            listing_resource=LISTING,
            destination_project="my-proj",
            subscriber=sub,
        )
        assert result.already_subscribed is True
        assert result.subscription_name == existing.name
        assert sub.subscribe_calls == []  # did not re-subscribe


class TestErrorMapping:
    def test_permission_denied_maps_to_access_pending(self) -> None:
        class PermissionDenied(Exception):
            pass

        mapped = bq._wrap_google_error(PermissionDenied("nope"))
        assert isinstance(mapped, OctogenBigQueryAccessPendingError)

    def test_403_code_maps_to_access_pending(self) -> None:
        class SomeError(Exception):
            code = 403

        assert isinstance(
            bq._wrap_google_error(SomeError("denied")),
            OctogenBigQueryAccessPendingError,
        )

    def test_other_errors_map_to_generic(self) -> None:
        mapped = bq._wrap_google_error(ValueError("boom"))
        assert isinstance(mapped, OctogenBigQueryError)
        assert not isinstance(mapped, OctogenBigQueryAccessPendingError)


def test_public_exports() -> None:
    import octogen_ai_sdk

    assert octogen_ai_sdk.subscribe_to_listing is bq.subscribe_to_listing
    assert octogen_ai_sdk.BigQuerySubscriptionResult is bq.BigQuerySubscriptionResult
