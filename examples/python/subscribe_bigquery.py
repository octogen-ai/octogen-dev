r"""Subscribe to an Octogen catalog's BigQuery listing (Phase 1 prototype).

Octogen grants your principal access to a BigQuery Analytics Hub *listing*; this
creates the *linked dataset* in YOUR GCP project so you can query the catalog.
It runs under your Application Default Credentials (`gcloud auth
application-default login`) and needs the ``bigquery`` extra:

    pip install "octogen-ai-sdk[bigquery]"

Run from the repository root. Get the listing resource from the MCP
``list_bigquery_listing_resources`` tool or from the Platform UI BigQuery
sharing page:

    uv run --project sdks/python --extra bigquery \
        python examples/python/subscribe_bigquery.py \
        projects/octogen-prod/locations/us/dataExchanges/oneoff/listings/farfetch \
        my-gcp-project
"""

from __future__ import annotations

import sys

from octogen_ai_sdk import subscribe_to_listing
from octogen_ai_sdk.errors import (
    OctogenBigQueryAccessPendingError,
    OctogenBigQueryError,
)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: subscribe_bigquery.py <listing-resource> <destination-project>")
        return 2
    listing_resource, destination_project = sys.argv[1], sys.argv[2]

    try:
        result = subscribe_to_listing(
            listing_resource=listing_resource,
            destination_project=destination_project,
        )
    except OctogenBigQueryAccessPendingError as exc:
        # Expected right after the subscriber is registered — the IAM grant is async.
        print(f"Not ready yet: {exc}")
        return 3
    except OctogenBigQueryError as exc:
        print(f"Failed: {exc}")
        return 1

    verb = "Already subscribed" if result.already_subscribed else "Subscribed"
    print(f"{verb}: {result.linked_project}.{result.linked_dataset} [{result.state}]")
    print(f"Try it: {result.sample_query}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
