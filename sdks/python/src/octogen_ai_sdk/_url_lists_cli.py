"""CLI for managing Octogen coverage URL lists.

Installed as ``octogen-url-lists``. A URL list is a named set of product URLs
Octogen joins against its crawled catalogs daily, publishing the matches to a
per-list BigQuery listing your registered Readers can subscribe to.

    octogen-url-lists create --name q3-campaign --apply
    octogen-url-lists add-urls cul_01... --file urls.txt --apply
    octogen-url-lists get cul_01...

Mutating commands (``create``, ``add-urls``, ``remove-urls``, ``delete``) are
dry-run by default and need ``--apply``, matching ``octogen-bq-subscribe`` and
``octogen-bq-autosubscribe``. Read commands run immediately.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

from octogen_ai_sdk.client import DEFAULT_BASE_URL, DEFAULT_TIMEOUT, OctogenClient
from octogen_ai_sdk.errors import (
    MissingAPIKeyError,
    OctogenAPIError,
    OctogenConnectionError,
    OctogenError,
)
from octogen_ai_sdk.models import CoverageUrlList

MAX_URLS_PER_REQUEST = 1_000
MAX_NAME_LENGTH = 80
PAGE_LIMIT = 100

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_USAGE = 2
EXIT_PARTIAL = 3


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        return asyncio.run(_dispatch(args))
    except KeyboardInterrupt:  # pragma: no cover - interactive only
        print("aborted", file=sys.stderr)
        return EXIT_FAILED


def _build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--api-key",
        default=None,
        help=(
            "Platform API key. Defaults to the "
            "OCTOGEN_PLATFORM_API_KEY environment variable."
        ),
    )
    common.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"API base URL. Defaults to {DEFAULT_BASE_URL}.",
    )
    common.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help="HTTP timeout in seconds.",
    )
    common.add_argument("--json", action="store_true", help="Emit JSON output.")

    urls_input = argparse.ArgumentParser(add_help=False)
    urls_input.add_argument(
        "--file",
        default=None,
        help=(
            "File of URLs, one per line. Blank lines and lines starting with # "
            "are skipped. Pass - to read standard input."
        ),
    )
    urls_input.add_argument(
        "--url",
        action="append",
        default=[],
        help="A single URL. Repeat for several.",
    )

    apply_flag = argparse.ArgumentParser(add_help=False)
    apply_flag.add_argument(
        "--apply",
        action="store_true",
        help="Actually perform the change. Without this, prints the plan (dry-run).",
    )

    parser = argparse.ArgumentParser(
        prog="octogen-url-lists",
        description=(
            "Manage Octogen coverage URL lists. Mutating commands are dry-run "
            "by default; pass --apply to make changes."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser(
        "create", parents=[common, apply_flag], help="Create a URL list."
    )
    create.add_argument(
        "--name", required=True, help=f"List name, 1-{MAX_NAME_LENGTH} characters."
    )

    sub.add_parser("list", parents=[common], help="List your URL lists.")

    get = sub.add_parser("get", parents=[common], help="Show one URL list.")
    get.add_argument("url_list_id")

    enumerate_urls = sub.add_parser(
        "urls", parents=[common], help="Enumerate a list's URLs."
    )
    enumerate_urls.add_argument("url_list_id")
    enumerate_urls.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Stop after this many URLs. 0 (default) reads every page.",
    )

    add = sub.add_parser(
        "add-urls",
        parents=[common, urls_input, apply_flag],
        help="Add URLs to a list.",
    )
    add.add_argument("url_list_id")

    remove = sub.add_parser(
        "remove-urls",
        parents=[common, urls_input, apply_flag],
        help="Remove URLs from a list.",
    )
    remove.add_argument("url_list_id")

    contains = sub.add_parser(
        "contains",
        parents=[common, urls_input],
        help="Check which URLs are members of a list.",
    )
    contains.add_argument("url_list_id")

    delete = sub.add_parser(
        "delete",
        parents=[common, apply_flag],
        help="Permanently delete a list and its BigQuery resources.",
    )
    delete.add_argument("url_list_id")
    delete.add_argument(
        "--yes",
        action="store_true",
        help="Skip the interactive confirmation. Required when stdin is not a TTY.",
    )
    return parser


async def _dispatch(args: argparse.Namespace) -> int:
    try:
        if args.command == "create":
            return await _cmd_create(args)
        if args.command == "list":
            return await _cmd_list(args)
        if args.command == "get":
            return await _cmd_get(args)
        if args.command == "urls":
            return await _cmd_urls(args)
        if args.command in {"add-urls", "remove-urls", "contains"}:
            return await _cmd_urls_operation(args)
        if args.command == "delete":
            return await _cmd_delete(args)
    except MissingAPIKeyError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_USAGE
    except OctogenAPIError as exc:
        print(f"error: {_api_error_text(exc)}", file=sys.stderr)
        return EXIT_FAILED
    except (OctogenConnectionError, OctogenError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_FAILED
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_USAGE
    raise AssertionError(f"unhandled command {args.command!r}")  # pragma: no cover


def _client(args: argparse.Namespace) -> OctogenClient:
    return OctogenClient(
        api_key=args.api_key,
        base_url=args.base_url,
        timeout=args.timeout,
    )


async def _cmd_create(args: argparse.Namespace) -> int:
    name = args.name.strip()
    if not name or len(name) > MAX_NAME_LENGTH:
        raise ValueError(f"--name must be 1-{MAX_NAME_LENGTH} characters")

    if not args.apply:
        _emit(
            args,
            {"applied": False, "action": "create", "name": name},
            lambda: print(f"DRY RUN (pass --apply to create)\n  name: {name}"),
        )
        return EXIT_OK

    async with _client(args) as client:
        url_list = await client.create_coverage_url_list(name=name)
    _emit(
        args,
        {"applied": True, **_list_payload(url_list)},
        lambda: _print_list(url_list),
    )
    return EXIT_OK


async def _cmd_list(args: argparse.Namespace) -> int:
    items: list[CoverageUrlList] = []
    cursor: str | None = None
    async with _client(args) as client:
        while True:
            page = await client.list_coverage_url_lists(cursor=cursor, limit=PAGE_LIMIT)
            items.extend(page.items)
            cursor = page.next_cursor
            if cursor is None:
                break

    def _text() -> None:
        if not items:
            print("no URL lists")
            return
        for item in items:
            exported = item.big_query.last_exported_at if item.big_query else None
            suffix = f"  last export {exported}" if exported else ""
            print(
                f"{item.url_list_id}  {item.status:<14} "
                f"{item.url_count:>8} urls  {item.name}{suffix}"
            )

    _emit(args, {"items": [_list_payload(item) for item in items]}, _text)
    return EXIT_OK


async def _cmd_get(args: argparse.Namespace) -> int:
    async with _client(args) as client:
        url_list = await client.get_coverage_url_list(args.url_list_id)
    _emit(args, _list_payload(url_list), lambda: _print_list(url_list))
    return EXIT_OK


async def _cmd_urls(args: argparse.Namespace) -> int:
    if args.limit < 0:
        raise ValueError("--limit must be zero or greater")
    collected: list[dict[str, Any]] = []
    cursor: str | None = None
    async with _client(args) as client:
        while True:
            page = await client.list_coverage_url_list_urls(
                args.url_list_id, cursor=cursor, limit=PAGE_LIMIT
            )
            for entry in page.items:
                collected.append(
                    {
                        "url": entry.url,
                        "normalizedUrl": entry.normalized_url,
                        "addedAt": entry.added_at.isoformat(),
                    }
                )
                if args.limit and len(collected) >= args.limit:
                    cursor = None
                    break
            else:
                cursor = page.next_cursor
            if cursor is None:
                break

    def _text() -> None:
        for entry in collected:
            print(entry["normalizedUrl"])

    _emit(args, {"items": collected, "count": len(collected)}, _text)
    return EXIT_OK


async def _cmd_urls_operation(args: argparse.Namespace) -> int:
    urls = _load_urls(file=args.file, inline=args.url)
    batches = _batched(urls, MAX_URLS_PER_REQUEST)
    verb, past_tense = {
        "add-urls": ("add", "added"),
        "remove-urls": ("remove", "removed"),
        "contains": ("check", "checked"),
    }[args.command]

    if args.command != "contains" and not args.apply:
        plan = {
            "applied": False,
            "action": verb,
            "urlListId": args.url_list_id,
            "urls": len(urls),
            "requests": len(batches),
        }
        _emit(
            args,
            plan,
            lambda: print(
                f"DRY RUN (pass --apply to {verb})\n"
                f"  list    : {args.url_list_id}\n"
                f"  urls    : {len(urls)} ({len(batches)} request(s))"
            ),
        )
        return EXIT_OK

    async with _client(args) as client:
        if args.command == "contains":
            return await _run_contains(args, client, batches)
        return await _run_mutation(args, client, batches, verb, past_tense)


async def _run_mutation(
    args: argparse.Namespace,
    client: OctogenClient,
    batches: list[list[str]],
    verb: str,
    past_tense: str,
) -> int:
    call = (
        client.add_coverage_url_list_urls
        if args.command == "add-urls"
        else client.remove_coverage_url_list_urls
    )
    accepted = 0
    rejected: list[dict[str, str]] = []
    url_count: int | None = None
    completed = 0
    # Batching is ours, not the API's: one user intent becomes N requests, so
    # a mid-loop failure leaves earlier batches applied. Reporting that as a
    # clean failure would tell automation nothing changed when it did.
    # Any SDK error, not just OctogenAPIError: a timeout partway through a
    # long file loses exactly the same progress a 409 would.
    failure: OctogenError | None = None

    for batch in batches:
        try:
            response = await call(args.url_list_id, urls=batch)
        except OctogenError as exc:
            failure = exc
            break
        completed += 1
        accepted += len(response.accepted)
        rejected.extend(
            {"url": item.url, "code": item.code, "message": item.message}
            for item in response.rejected
        )
        url_count = response.url_count

    payload: dict[str, Any] = {
        "applied": completed > 0,
        "action": verb,
        "urlListId": args.url_list_id,
        "accepted": accepted,
        "rejected": rejected,
        "urlCount": url_count,
        "completedRequests": completed,
        "totalRequests": len(batches),
    }
    if failure is not None:
        api_failure = failure if isinstance(failure, OctogenAPIError) else None
        payload["error"] = {
            "detail": (
                api_failure.detail
                if api_failure is not None and isinstance(api_failure.detail, str)
                else None
            ),
            "statusCode": api_failure.status_code if api_failure is not None else None,
            "message": str(failure),
        }

    def _text() -> None:
        if completed:
            print(f"{past_tense} {accepted} url(s); list now holds {url_count}")
            _print_rejected(rejected)

    _emit(args, payload, _text)

    if failure is not None:
        applied_note = (
            f"{accepted} url(s) from the first {completed} request(s) were "
            f"already {past_tense} and remain applied. Re-running the same "
            "input is safe — adds and removes are idempotent."
            if completed
            else "No requests completed, so the list is unchanged."
        )
        print(
            f"error: {_failure_text(failure)}\n"
            f"  stopped after {completed}/{len(batches)} request(s). "
            f"{applied_note}",
            file=sys.stderr,
        )
        return EXIT_FAILED
    return EXIT_PARTIAL if rejected else EXIT_OK


async def _run_contains(
    args: argparse.Namespace,
    client: OctogenClient,
    batches: list[list[str]],
) -> int:
    results: list[dict[str, Any]] = []
    for batch in batches:
        response = await client.check_coverage_url_list_urls(
            args.url_list_id, urls=batch
        )
        results.extend(
            {
                "url": item.url,
                "normalizedUrl": item.normalized_url,
                "present": item.present,
                "addedAt": item.added_at.isoformat() if item.added_at else None,
            }
            for item in response.results
        )
    present = sum(1 for item in results if item["present"])

    def _text() -> None:
        for item in results:
            mark = "present" if item["present"] else "absent "
            print(f"{mark}  {item['url']}")
        print(f"{present}/{len(results)} present")

    _emit(args, {"results": results, "present": present}, _text)
    return EXIT_OK


async def _cmd_delete(args: argparse.Namespace) -> int:
    async with _client(args) as client:
        url_list = await client.get_coverage_url_list(args.url_list_id)

        if not args.apply:
            _emit(
                args,
                {
                    "applied": False,
                    "action": "delete",
                    **_list_payload(url_list),
                },
                lambda: print(
                    "DRY RUN (pass --apply to delete)\n"
                    f"  would permanently delete {url_list.url_list_id} "
                    f"({url_list.name}) holding {url_list.url_count} url(s) "
                    "and its BigQuery listing and datasets"
                ),
            )
            return EXIT_OK

        if not args.yes:
            if not sys.stdin.isatty():
                raise ValueError(
                    "refusing to delete without a TTY; pass --yes to confirm"
                )
            # The warning and prompt are UI, not output: keeping them off
            # stdout leaves --json a single parseable document.
            print(
                f"About to PERMANENTLY delete {url_list.url_list_id} "
                f"({url_list.name}) holding {url_list.url_count} url(s), "
                "along with its BigQuery listing and datasets. "
                "There is no restore.",
                file=sys.stderr,
            )
            print(
                f"Type the list name ({url_list.name}) to confirm: ",
                end="",
                file=sys.stderr,
                flush=True,
            )
            typed = input()
            if typed.strip() != url_list.name:
                raise ValueError("confirmation did not match; nothing was deleted")

        deleted = await client.delete_coverage_url_list(args.url_list_id)

    _emit(
        args,
        {"applied": True, **_list_payload(deleted)},
        lambda: print(f"deleting {deleted.url_list_id} [{deleted.status}]"),
    )
    return EXIT_OK


def _load_urls(*, file: str | None, inline: Sequence[str]) -> list[str]:
    raw: list[str] = list(inline)
    if file:
        raw.extend(_read_url_file(file))
    if not raw:
        raise ValueError("no URLs given; pass --file or --url")

    seen: set[str] = set()
    urls: list[str] = []
    for value in raw:
        candidate = value.strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        urls.append(candidate)
    if not urls:
        raise ValueError("no URLs given; pass --file or --url")
    return urls


def _read_url_file(file: str) -> list[str]:
    if file == "-":
        text = sys.stdin.read()
    else:
        path = Path(file)
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            raise ValueError(f"cannot read {file}: {exc}") from exc
    return [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def _batched(urls: Sequence[str], size: int) -> list[list[str]]:
    return [list(urls[index : index + size]) for index in range(0, len(urls), size)]


def _list_payload(url_list: CoverageUrlList) -> dict[str, Any]:
    return url_list.model_dump(mode="json", by_alias=True)


def _print_list(url_list: CoverageUrlList) -> None:
    print(f"{url_list.url_list_id}  [{url_list.status}]")
    print(f"  name     : {url_list.name}")
    print(f"  urls     : {url_list.url_count}")
    if url_list.big_query is None:
        print("  bigquery : provisioning (not ready yet)")
        return
    big_query = url_list.big_query
    print(f"  listing  : {big_query.exchange_id}/{big_query.listing_id}")
    print(f"  dataset  : {big_query.shared_dataset_id}.{big_query.view_id}")
    if big_query.last_exported_at is None:
        # Freshly active lists have a listing but no snapshot until the first
        # daily export lands.
        print("  exported : never (waiting for the first daily export)")
    else:
        print(
            f"  exported : {big_query.last_exported_at} "
            f"({big_query.last_row_count} rows)"
        )
    print(f"  readers  : {big_query.reader_count}")


def _print_rejected(rejected: Iterable[dict[str, str]]) -> None:
    items = list(rejected)
    if not items:
        return
    print(f"{len(items)} rejected:")
    for item in items[:10]:
        print(f"  {item['code']}: {item['url']}")
    if len(items) > 10:
        print(f"  ... and {len(items) - 10} more (use --json for all)")


def _emit(args: argparse.Namespace, payload: dict[str, Any], text: Any = None) -> None:
    if args.json:
        print(json.dumps(payload, indent=2))
    elif text is not None:
        text()


def _failure_text(exc: OctogenError) -> str:
    """Errors reaching here may be transport-level, which carry no code."""
    if isinstance(exc, OctogenAPIError):
        return _api_error_text(exc)
    return str(exc)


def _api_error_text(exc: OctogenAPIError) -> str:
    detail = exc.detail if isinstance(exc.detail, str) else None
    hint = _ERROR_HINTS.get(detail or "")
    base = f"{detail or exc}" if detail else str(exc)
    if exc.status_code:
        base = f"{base} (HTTP {exc.status_code})"
    return f"{base}\n  {hint}" if hint else base


_ERROR_HINTS = {
    "url_list_not_found": "No list with that id in your organization.",
    "url_list_deleting": "The list is being deleted; mutations are refused.",
    "url_list_migrating": "Entries are being re-normalized; retry shortly.",
    "url_list_name_conflict": "A live list already uses that name.",
    "url_list_limit_exceeded": (
        "Your organization already has the maximum number of live lists; "
        "delete one first."
    ),
    "list_url_capacity_exceeded": (
        "The add would exceed the per-list URL cap, so that request was refused whole."
    ),
    "invalid_cursor": "The pagination cursor is stale; rerun without a cursor.",
    "url_lists_unavailable": "The feature is temporarily unavailable; retry later.",
}


if __name__ == "__main__":
    raise SystemExit(main())
