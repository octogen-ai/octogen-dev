"""CLI for subscribing to an Octogen catalog's BigQuery Analytics Hub listing.

Installed as ``octogen-bq-subscribe`` (with the ``bigquery`` extra). Runs the
Analytics Hub subscription under your Application Default Credentials, creating
a linked dataset in your project. Dry-run by default — pass ``--apply`` to
actually subscribe.

    octogen-bq-subscribe --listing <listing-resource> --project my-proj --apply

where ``<listing-resource>`` is copied from the Platform UI BigQuery page.
"""

from __future__ import annotations

import argparse
import json
import sys

from octogen_ai_sdk.bigquery import (
    build_sample_query,
    default_dataset_id,
    parse_listing_resource,
    subscribe_to_listing,
)
from octogen_ai_sdk.errors import (
    OctogenBigQueryAccessPendingError,
    OctogenBigQueryError,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="octogen-bq-subscribe",
        description="Subscribe to an Octogen catalog's BigQuery listing.",
    )
    parser.add_argument(
        "--listing",
        required=True,
        help="Listing resource (from the Platform UI BigQuery page).",
    )
    parser.add_argument(
        "--project",
        required=True,
        help="Destination GCP project for the linked dataset (must be yours).",
    )
    parser.add_argument(
        "--dataset",
        default=None,
        help="Linked dataset id (default: derived from the listing id).",
    )
    parser.add_argument(
        "--location",
        default=None,
        help="Dataset location (default: the listing's location).",
    )
    parser.add_argument(
        "--friendly-name", default=None, help="Linked dataset friendly name."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually subscribe. Without this, prints the plan and exits (dry-run).",
    )
    parser.add_argument(
        "--json", action="store_true", help="Emit JSON instead of text."
    )
    args = parser.parse_args(argv)

    try:
        parts = parse_listing_resource(args.listing)
    except OctogenBigQueryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    dataset_id = args.dataset or default_dataset_id(parts.listing)
    location = args.location or parts.location

    if not args.apply:
        # Keys mirror the --apply result (snake_case) so automation can parse
        # both dry-run and applied output with one schema.
        plan = {
            "applied": False,
            "listing": parts.raw,
            "linked_project": args.project,
            "linked_dataset": dataset_id,
            "location": location,
            "sample_query": build_sample_query(args.project, dataset_id),
        }
        if args.json:
            print(json.dumps(plan, indent=2))
        else:
            print("DRY RUN (pass --apply to subscribe)")
            print(f"  listing : {parts.raw}")
            print(f"  -> {args.project}.{dataset_id}  (location {location})")
        return 0

    try:
        result = subscribe_to_listing(
            listing_resource=args.listing,
            destination_project=args.project,
            destination_dataset_id=args.dataset,
            location=args.location,
            friendly_name=args.friendly_name,
        )
    except OctogenBigQueryAccessPendingError as exc:
        print(f"not ready: {exc}", file=sys.stderr)
        return 3
    except OctogenBigQueryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        payload = {"applied": True, **result.model_dump()}
        print(json.dumps(payload, indent=2))
    else:
        verb = "Already subscribed" if result.already_subscribed else "Subscribed"
        print(
            f"{verb}: {result.linked_project}.{result.linked_dataset}  [{result.state}]"
        )
        print(f"  sample query: {result.sample_query}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
