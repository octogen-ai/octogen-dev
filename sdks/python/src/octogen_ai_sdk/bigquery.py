"""Subscribe to an Octogen catalog's BigQuery Analytics Hub listing.

Octogen publishes each shared catalog as a BigQuery Analytics Hub *listing* and
grants your subscriber principal ``roles/analyticshub.subscriber`` on it. The
final step — subscribing to the listing to create a *linked dataset* in YOUR
GCP project — can only run with YOUR credentials, so it lives here in the
customer SDK rather than on the Octogen platform.

Given the listing resource name (from the Catalog Partner MCP
``list_bigquery_listing_resources`` tool or the Platform UI's BigQuery sharing
page) and your destination project, it performs the Analytics
Hub subscription under your Application Default Credentials and reports the
linked dataset. It's idempotent — re-running detects an existing subscription
to the same listing and returns it instead of subscribing again.

Requires the ``bigquery`` extra::

    pip install "octogen-ai-sdk[bigquery]"

Programmatic use::

    from octogen_ai_sdk.bigquery import subscribe_to_listing

    result = subscribe_to_listing(
        listing_resource="projects/octogen-prod/locations/us/dataExchanges/oneoff/listings/farfetch",
        destination_project="my-gcp-project",
    )
    print(result.linked_dataset, result.state)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict

from octogen_ai_sdk.errors import (
    OctogenBigQueryAccessPendingError,
    OctogenBigQueryAlreadyExistsError,
    OctogenBigQueryError,
)

# projects/{project}/locations/{location}/dataExchanges/{exchange}/listings/{listing}
_LISTING_RE = re.compile(
    r"^projects/(?P<project>[^/]+)/locations/(?P<location>[^/]+)/"
    r"dataExchanges/(?P<exchange>[^/]+)/listings/(?P<listing>[^/]+)$"
)
# BigQuery dataset ids allow letters, numbers, and underscores only.
_DATASET_SANITIZE_RE = re.compile(r"[^A-Za-z0-9_]")
# Analytics Hub Subscription.State values whose linked dataset is usable. The
# full enum is STATE_ACTIVE, STATE_STALE, STATE_INACTIVE, STATE_UNSPECIFIED —
# there is no STATE_REVOKED; INACTIVE is the cancelled/revoked case, which must
# NOT be treated as an existing subscription.
_USABLE_STATES = frozenset({"STATE_ACTIVE", "STATE_STALE"})


@dataclass(frozen=True)
class ListingResource:
    """The parsed parts of an Analytics Hub listing resource name."""

    project: str
    location: str
    exchange: str
    listing: str
    raw: str


def parse_listing_resource(resource: str) -> ListingResource:
    """Parse and validate an Analytics Hub listing resource name."""
    match = _LISTING_RE.match(resource.strip())
    if match is None:
        raise OctogenBigQueryError(
            "Invalid listing resource. Expected "
            "'projects/<p>/locations/<loc>/dataExchanges/<ex>/listings/<id>', "
            f"got {resource!r}. Get it from the MCP "
            "'list_bigquery_listing_resources' tool or the Platform UI "
            "BigQuery sharing page."
        )
    return ListingResource(raw=resource.strip(), **match.groupdict())


def default_dataset_id(listing_id: str) -> str:
    """A safe default linked-dataset id derived from the listing id."""
    sanitized = _DATASET_SANITIZE_RE.sub("_", listing_id).strip("_")
    return f"octogen_{sanitized}" if sanitized else "octogen_catalog"


def build_sample_query(project: str, dataset: str) -> str:
    """A copy-paste query an operator can run once the dataset is linked."""
    return f"SELECT * FROM `{project}.{dataset}.products_current_v1` LIMIT 10;"


class BigQuerySubscriptionResult(BaseModel):
    """Outcome of subscribing to a catalog's BigQuery listing."""

    model_config = ConfigDict(populate_by_name=True)

    listing_resource: str
    subscription_name: str | None
    state: str | None
    linked_project: str
    linked_dataset: str
    already_subscribed: bool
    sample_query: str


@dataclass(frozen=True)
class _SubscriptionInfo:
    """Backend-agnostic view of a subscription (decouples tests from google)."""

    name: str
    state: str
    linked_project: str | None
    linked_dataset: str | None


class ListingSubscriber(Protocol):
    """Seam over Analytics Hub so the orchestration is testable without GCP."""

    def find_existing(
        self, *, project: str, location: str, listing_resource: str
    ) -> _SubscriptionInfo | None: ...

    def subscribe(
        self,
        *,
        listing_resource: str,
        project: str,
        dataset_id: str,
        location: str,
        friendly_name: str | None,
    ) -> _SubscriptionInfo: ...


def subscribe_to_listing(
    *,
    listing_resource: str,
    destination_project: str,
    destination_dataset_id: str | None = None,
    location: str | None = None,
    friendly_name: str | None = None,
    subscriber: ListingSubscriber | None = None,
    credentials: Any = None,
) -> BigQuerySubscriptionResult:
    """Subscribe to a catalog's Analytics Hub listing, creating a linked dataset.

    ``location`` and the destination dataset id default to values derived from
    ``listing_resource``. Idempotent: an existing subscription to the same
    listing in the destination project is returned as-is. Raises
    :class:`OctogenBigQueryAccessPendingError` if Octogen has not yet granted
    your principal access to the listing (the grant is asynchronous — retry in a
    few minutes), or :class:`OctogenBigQueryError` for other failures.

    ``subscriber`` is injectable for testing; by default it talks to Analytics
    Hub via your Application Default Credentials.
    """
    parts = parse_listing_resource(listing_resource)
    resolved_location = location or parts.location
    dataset_id = destination_dataset_id or default_dataset_id(parts.listing)
    backend = subscriber or _AnalyticsHubSubscriber(credentials=credentials)

    existing = backend.find_existing(
        project=destination_project,
        location=resolved_location,
        listing_resource=parts.raw,
    )
    if existing is not None:
        return _result(
            parts.raw, existing, destination_project, dataset_id, already=True
        )

    try:
        info = backend.subscribe(
            listing_resource=parts.raw,
            project=destination_project,
            dataset_id=dataset_id,
            location=resolved_location,
            friendly_name=friendly_name,
        )
    except OctogenBigQueryAlreadyExistsError:
        # Analytics Hub may report the destination dataset already exists even
        # when list_subscriptions did not surface the subscription. Treat that
        # as idempotent for the requested dataset so cron reruns do not fail
        # after a successful subscribe/refresh cycle.
        info = _SubscriptionInfo(
            name="",
            state="ALREADY_EXISTS",
            linked_project=destination_project,
            linked_dataset=dataset_id,
        )
        return _result(parts.raw, info, destination_project, dataset_id, already=True)
    return _result(parts.raw, info, destination_project, dataset_id, already=False)


def _result(
    listing_resource: str,
    info: _SubscriptionInfo,
    fallback_project: str,
    fallback_dataset: str,
    *,
    already: bool,
) -> BigQuerySubscriptionResult:
    project = info.linked_project or fallback_project
    dataset = info.linked_dataset or fallback_dataset
    return BigQuerySubscriptionResult(
        listing_resource=listing_resource,
        subscription_name=info.name or None,
        state=info.state or None,
        linked_project=project,
        linked_dataset=dataset,
        already_subscribed=already,
        sample_query=build_sample_query(project, dataset),
    )


class _AnalyticsHubSubscriber:
    """Default ListingSubscriber backed by google-cloud-bigquery-analyticshub."""

    def __init__(
        self, *, credentials: Any = None, client: Any = None, ah: Any = None
    ) -> None:
        # client/ah are injection seams for tests; production passes neither.
        self._ah = ah if ah is not None else _import_analyticshub()
        if client is not None:
            self._client = client
            return
        kwargs: dict[str, Any] = {}
        if credentials is not None:
            kwargs["credentials"] = credentials
        self._client = self._ah.AnalyticsHubServiceClient(**kwargs)

    def find_existing(
        self, *, project: str, location: str, listing_resource: str
    ) -> _SubscriptionInfo | None:
        parent = f"projects/{project}/locations/{location}"
        # list_subscriptions returns a lazy pager: the RPCs fire while iterating,
        # not when the method returns. Keep the loop inside the try so a paging
        # error (e.g. PermissionDenied) is mapped to a typed SDK error instead of
        # escaping raw.
        try:
            for subscription in self._client.list_subscriptions(parent=parent):
                if getattr(subscription, "listing", None) != listing_resource:
                    continue
                # Skip cancelled/unusable subscriptions (e.g. STATE_INACTIVE) so
                # we don't report a dead subscription as already-subscribed.
                if _state_name(subscription) not in _USABLE_STATES:
                    continue
                return _subscription_info(subscription)
            return None
        except Exception as exc:  # noqa: BLE001 - surface as a typed SDK error
            raise _wrap_google_error(exc, operation="list") from exc

    def subscribe(
        self,
        *,
        listing_resource: str,
        project: str,
        dataset_id: str,
        location: str,
        friendly_name: str | None,
    ) -> _SubscriptionInfo:
        ah = self._ah
        request = ah.SubscribeListingRequest(
            name=listing_resource,
            destination_dataset=ah.DestinationDataset(
                dataset_reference=ah.DestinationDatasetReference(
                    project_id=project,
                    dataset_id=dataset_id,
                ),
                location=location,
                friendly_name=friendly_name or f"Octogen {dataset_id}",
            ),
        )
        try:
            response = self._client.subscribe_listing(request=request)
        except Exception as exc:  # noqa: BLE001 - surface as a typed SDK error
            raise _wrap_google_error(exc, operation="subscribe") from exc
        return _subscription_info(response.subscription)


def _import_analyticshub() -> Any:
    try:
        from google.cloud import bigquery_analyticshub_v1 as ah
    except ImportError as exc:  # pragma: no cover - import-guard
        raise OctogenBigQueryError(
            "BigQuery subscribe requires the 'bigquery' extra. Install with: "
            'pip install "octogen-ai-sdk[bigquery]"'
        ) from exc
    return ah


def _wrap_google_error(exc: Exception, *, operation: str) -> OctogenBigQueryError:
    """Map a google exception to a typed SDK error.

    A 403 on ``subscribe`` almost always means Octogen's listing grant hasn't
    landed yet (it's asynchronous), so we surface the retryable access-pending
    error. A 403 on any other operation — e.g. listing existing subscriptions in
    the caller's own project — is an ordinary IAM problem on the caller side, not
    a pending listing grant, so we don't mislabel it as access-pending.
    """
    name = type(exc).__name__
    is_forbidden = name == "PermissionDenied" or getattr(exc, "code", None) == 403
    is_already_exists = name == "AlreadyExists" or getattr(exc, "code", None) == 409
    if is_already_exists and operation == "subscribe":
        return OctogenBigQueryAlreadyExistsError(
            f"Destination linked dataset already exists. (Underlying: {name})"
        )
    if is_forbidden and operation == "subscribe":
        return OctogenBigQueryAccessPendingError(
            "Your principal isn't authorized on this listing yet. Octogen grants "
            "access asynchronously after the subscriber is registered — wait a few "
            "minutes and retry. (Underlying: PermissionDenied)"
        )
    if is_forbidden:
        return OctogenBigQueryError(
            f"Permission denied during {operation}: your credentials lack the "
            f"required IAM permission (this is not the listing grant). "
            f"(Underlying: {name})"
        )
    return OctogenBigQueryError(f"Analytics Hub call failed: {name}: {exc}")


def _state_name(subscription: Any) -> str:
    state = getattr(subscription, "state", None)
    return getattr(state, "name", str(state)) if state is not None else ""


def _subscription_info(subscription: Any) -> _SubscriptionInfo:
    """Best-effort extraction of the linked dataset from a google Subscription."""
    project, dataset = _linked_dataset(subscription)
    return _SubscriptionInfo(
        name=getattr(subscription, "name", "") or "",
        state=_state_name(subscription),
        linked_project=project,
        linked_dataset=dataset,
    )


def _linked_dataset(subscription: Any) -> tuple[str | None, str | None]:
    # Prefer the explicit destination_dataset reference when present.
    destination = getattr(subscription, "destination_dataset", None)
    reference = getattr(destination, "dataset_reference", None)
    if reference is not None:
        project = getattr(reference, "project_id", None) or None
        dataset = getattr(reference, "dataset_id", None) or None
        if project or dataset:
            return project, dataset
    # Otherwise parse the linked_dataset_map's linked_resource paths.
    linked_map = getattr(subscription, "linked_dataset_map", None) or {}
    values = linked_map.values() if hasattr(linked_map, "values") else []
    for linked in values:
        resource = getattr(linked, "linked_resource", "") or ""
        match = re.match(
            r"^projects/(?P<project>[^/]+)/datasets/(?P<dataset>[^/]+)$", resource
        )
        if match:
            return match.group("project"), match.group("dataset")
    return None, None
