"""Tests for the BigQuery Analytics Hub subscribe helper.

The google dependency is encapsulated behind ListingSubscriber, so the
orchestration, parsing, and error mapping are tested with no GCP access.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from octogen_ai_sdk import _bigquery_cli as cli
from octogen_ai_sdk import bigquery as bq
from octogen_ai_sdk.errors import (
    OctogenBigQueryAccessPendingError,
    OctogenBigQueryAlreadyExistsError,
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
        assert "`proj.octogen_farfetch.products_current_v1`" in q


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
        assert "`my-proj.octogen_farfetch.products_current_v1`" in result.sample_query
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

    def test_subscribe_already_exists_is_idempotent(self) -> None:
        class AlreadyExistsSubscriber(FakeSubscriber):
            def subscribe(
                self,
                *,
                listing_resource,
                project,
                dataset_id,
                location,
                friendly_name,
            ):  # noqa: ANN001
                raise OctogenBigQueryAlreadyExistsError("already exists")

        result = bq.subscribe_to_listing(
            listing_resource=LISTING,
            destination_project="my-proj",
            subscriber=AlreadyExistsSubscriber(),
        )

        assert result.already_subscribed is True
        assert result.state == "ALREADY_EXISTS"
        assert result.linked_project == "my-proj"
        assert result.linked_dataset == "octogen_farfetch"


class TestErrorMapping:
    def test_subscribe_permission_denied_maps_to_access_pending(self) -> None:
        class PermissionDenied(Exception):
            pass

        mapped = bq._wrap_google_error(PermissionDenied("nope"), operation="subscribe")
        assert isinstance(mapped, OctogenBigQueryAccessPendingError)

    def test_subscribe_403_code_maps_to_access_pending(self) -> None:
        class SomeError(Exception):
            code = 403

        assert isinstance(
            bq._wrap_google_error(SomeError("denied"), operation="subscribe"),
            OctogenBigQueryAccessPendingError,
        )

    def test_subscribe_already_exists_maps_to_typed_error(self) -> None:
        class AlreadyExists(Exception):
            code = 409

        assert isinstance(
            bq._wrap_google_error(AlreadyExists("exists"), operation="subscribe"),
            OctogenBigQueryAlreadyExistsError,
        )

    def test_list_403_maps_to_generic_permission_not_access_pending(self) -> None:
        # A 403 while listing the caller's own subscriptions is an IAM problem on
        # their side, not a pending Octogen listing grant.
        class PermissionDenied(Exception):
            pass

        mapped = bq._wrap_google_error(PermissionDenied("nope"), operation="list")
        assert isinstance(mapped, OctogenBigQueryError)
        assert not isinstance(mapped, OctogenBigQueryAccessPendingError)

    def test_other_errors_map_to_generic(self) -> None:
        mapped = bq._wrap_google_error(ValueError("boom"), operation="subscribe")
        assert isinstance(mapped, OctogenBigQueryError)
        assert not isinstance(mapped, OctogenBigQueryAccessPendingError)


def test_public_exports() -> None:
    import octogen_ai_sdk

    assert octogen_ai_sdk.subscribe_to_listing is bq.subscribe_to_listing
    assert octogen_ai_sdk.BigQuerySubscriptionResult is bq.BigQuerySubscriptionResult


class PermissionDenied(Exception):
    """Mimics google.api_core PermissionDenied — matched by class name."""


def _fake_subscription(*, listing, state, project=None, dataset=None, name="sub"):  # noqa: ANN001
    """A proto-shaped Subscription stand-in for the extraction helpers."""
    return SimpleNamespace(
        listing=listing,
        name=name,
        state=SimpleNamespace(name=state),
        destination_dataset=SimpleNamespace(
            dataset_reference=SimpleNamespace(project_id=project, dataset_id=dataset)
        ),
        linked_dataset_map={},
    )


class _RaisingPager:
    """Mimics a google pager that raises while iterating, not on the call."""

    def __iter__(self):  # noqa: ANN204
        raise PermissionDenied("listing not granted yet")


class FakeAnalyticsHubClient:
    """Records subscribe requests; returns canned list/subscribe responses."""

    def __init__(self, *, subscriptions=None, list_result=None):  # noqa: ANN001
        self._subscriptions = subscriptions or []
        self._list_result = list_result
        self.subscribe_requests: list = []
        self.subscribe_response = None

    def list_subscriptions(self, *, parent):  # noqa: ANN001
        if self._list_result is not None:
            return self._list_result
        return list(self._subscriptions)

    def subscribe_listing(self, *, request):  # noqa: ANN001
        self.subscribe_requests.append(request)
        return self.subscribe_response


class TestAnalyticsHubAdapter:
    """Covers _AnalyticsHubSubscriber — the real google glue behind the protocol."""

    def test_subscribe_builds_real_request_and_extracts_result(self) -> None:
        # Use the real google types so a wrong field name fails here, not in prod.
        ah = pytest.importorskip("google.cloud.bigquery_analyticshub_v1")
        client = FakeAnalyticsHubClient()
        client.subscribe_response = SimpleNamespace(
            subscription=_fake_subscription(
                listing=LISTING,
                state="STATE_ACTIVE",
                project="my-proj",
                dataset="octogen_farfetch",
                name="projects/my-proj/locations/us/subscriptions/sub_x",
            )
        )
        subscriber = bq._AnalyticsHubSubscriber(client=client, ah=ah)

        info = subscriber.subscribe(
            listing_resource=LISTING,
            project="my-proj",
            dataset_id="octogen_farfetch",
            location="us",
            friendly_name=None,
        )

        [request] = client.subscribe_requests
        assert isinstance(request, ah.SubscribeListingRequest)
        assert request.name == LISTING
        ref = request.destination_dataset.dataset_reference
        assert ref.project_id == "my-proj"
        assert ref.dataset_id == "octogen_farfetch"
        assert request.destination_dataset.location == "us"
        assert request.destination_dataset.friendly_name == "Octogen octogen_farfetch"
        assert info.linked_project == "my-proj"
        assert info.linked_dataset == "octogen_farfetch"
        assert info.state == "STATE_ACTIVE"

    def test_find_existing_returns_match_and_skips_inactive(self) -> None:
        client = FakeAnalyticsHubClient(
            subscriptions=[
                _fake_subscription(
                    listing=LISTING, state="STATE_INACTIVE", name="sub_inactive"
                ),
                _fake_subscription(
                    listing=LISTING,
                    state="STATE_ACTIVE",
                    project="my-proj",
                    dataset="octogen_farfetch",
                    name="sub_active",
                ),
            ]
        )
        subscriber = bq._AnalyticsHubSubscriber(client=client, ah=object())

        info = subscriber.find_existing(
            project="my-proj", location="us", listing_resource=LISTING
        )

        assert info is not None
        assert info.name == "sub_active"
        assert info.linked_dataset == "octogen_farfetch"

    def test_find_existing_returns_none_when_listing_not_subscribed(self) -> None:
        client = FakeAnalyticsHubClient(
            subscriptions=[
                _fake_subscription(
                    listing="projects/x/locations/us/dataExchanges/e/listings/other",
                    state="STATE_ACTIVE",
                ),
            ]
        )
        subscriber = bq._AnalyticsHubSubscriber(client=client, ah=object())

        assert (
            subscriber.find_existing(
                project="my-proj", location="us", listing_resource=LISTING
            )
            is None
        )

    def test_find_existing_wraps_paging_error(self) -> None:
        # Regression guard: the pager raises during iteration, which must still be
        # mapped to a typed SDK error (the loop lives inside the try). It's a
        # `list` 403, so it surfaces as a generic permission error, not the
        # subscribe-only access-pending error.
        client = FakeAnalyticsHubClient(list_result=_RaisingPager())
        subscriber = bq._AnalyticsHubSubscriber(client=client, ah=object())

        with pytest.raises(OctogenBigQueryError) as excinfo:
            subscriber.find_existing(
                project="my-proj", location="us", listing_resource=LISTING
            )
        assert not isinstance(excinfo.value, OctogenBigQueryAccessPendingError)


class TestExtractionHelpers:
    def test_linked_dataset_prefers_destination_reference(self) -> None:
        sub = _fake_subscription(
            listing=LISTING, state="STATE_ACTIVE", project="p", dataset="d"
        )
        assert bq._linked_dataset(sub) == ("p", "d")

    def test_linked_dataset_falls_back_to_linked_resource_map(self) -> None:
        sub = SimpleNamespace(
            name="sub",
            state=SimpleNamespace(name="STATE_ACTIVE"),
            destination_dataset=None,
            linked_dataset_map={
                "us": SimpleNamespace(linked_resource="projects/p2/datasets/d2")
            },
        )
        assert bq._linked_dataset(sub) == ("p2", "d2")

    def test_state_name_handles_missing_state(self) -> None:
        assert bq._state_name(SimpleNamespace(state=None)) == ""
        assert bq._state_name(SimpleNamespace()) == ""


class TestCli:
    def test_dry_run_json_matches_apply_schema(self, capsys) -> None:  # noqa: ANN001
        # Dry-run makes no GCP call, so this runs without the bigquery extra.
        rc = cli.main(["--listing", LISTING, "--project", "my-proj", "--json"])
        assert rc == 0
        data = json.loads(capsys.readouterr().out)
        # snake_case keys, consistent with the --apply (model_dump) output.
        assert data["applied"] is False
        assert data["linked_project"] == "my-proj"
        assert data["linked_dataset"] == "octogen_farfetch"
        assert "sample_query" in data
        # No camelCase leftovers from the old dry-run-only schema.
        assert "destinationProject" not in data
        assert "destinationDataset" not in data
