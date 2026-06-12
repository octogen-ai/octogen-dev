"""CLI for automatically subscribing to newly available Octogen BigQuery listings."""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

from octogen_ai_sdk.bigquery_autosubscribe import (
    DEFAULT_MCP_URL,
    BigQueryAutoSubscribeResult,
    BigQueryMCPClient,
    autosubscribe_bigquery_listings,
)
from octogen_ai_sdk.errors import OctogenBigQueryError, OctogenMCPError
from octogen_ai_sdk.mcp_auth import (
    DEFAULT_MCP_TOKEN_ENDPOINT,
    MCPRefreshTokenProvider,
    read_text_file,
)

_RefreshTokenProvider = MCPRefreshTokenProvider


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="octogen-bq-autosubscribe",
        description=(
            "Register a BigQuery Reader and subscribe ready Octogen listings. "
            "Dry-run by default; pass --apply to mutate Octogen and GCP."
        ),
    )
    parser.add_argument(
        "--project",
        "--subscriber-project-id",
        dest="subscriber_project_id",
        required=True,
        help="Destination GCP project where linked datasets will be created.",
    )
    parser.add_argument(
        "--principal",
        "--subscriber-principal",
        dest="subscriber_principal",
        required=True,
        help=(
            "Subscriber IAM principal registered in Octogen, for example "
            "serviceAccount:bq-reader@my-project.iam.gserviceaccount.com."
        ),
    )
    parser.add_argument(
        "--catalog",
        action="append",
        default=[],
        help="Optional catalog filter. Repeat or pass comma-separated values.",
    )
    parser.add_argument(
        "--mcp-url",
        default=os.getenv("OCTOGEN_MCP_URL", DEFAULT_MCP_URL),
        help=f"Octogen MCP URL. Defaults to {DEFAULT_MCP_URL}.",
    )
    parser.add_argument(
        "--mcp-access-token",
        default=os.getenv("OCTOGEN_MCP_ACCESS_TOKEN"),
        help=(
            "OAuth access token for Octogen MCP. Prefer --mcp-refresh-token-file "
            "for cron so the command can refresh tokens itself."
        ),
    )
    parser.add_argument(
        "--mcp-token-command",
        default=os.getenv("OCTOGEN_MCP_TOKEN_COMMAND"),
        help=(
            "Command that prints a fresh MCP access token, or JSON with an "
            "access_token field. The command is split with shlex and is not "
            "run through a shell."
        ),
    )
    parser.add_argument(
        "--mcp-client-id",
        default=os.getenv("OCTOGEN_MCP_CLIENT_ID"),
        help="Public OAuth client id used to refresh an MCP OAuth token.",
    )
    parser.add_argument(
        "--mcp-client-id-file",
        default=os.getenv("OCTOGEN_MCP_CLIENT_ID_FILE"),
        help="File containing the public OAuth client id from octogen-mcp-login.",
    )
    parser.add_argument(
        "--mcp-refresh-token",
        default=os.getenv("OCTOGEN_MCP_REFRESH_TOKEN"),
        help=(
            "MCP OAuth refresh token. Prefer --mcp-refresh-token-file so rotated "
            "refresh tokens can be persisted between cron runs."
        ),
    )
    parser.add_argument(
        "--mcp-refresh-token-file",
        default=os.getenv("OCTOGEN_MCP_REFRESH_TOKEN_FILE"),
        help=(
            "File containing an MCP OAuth refresh token. If WorkOS rotates the "
            "refresh token, the replacement is written back to this file."
        ),
    )
    parser.add_argument(
        "--mcp-token-endpoint",
        default=os.getenv(
            "OCTOGEN_MCP_TOKEN_ENDPOINT",
            DEFAULT_MCP_TOKEN_ENDPOINT,
        ),
        help="OAuth token endpoint for MCP refresh-token exchange.",
    )
    parser.add_argument(
        "--friendly-name",
        default=None,
        help="Optional friendly name for newly created linked datasets.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="HTTP timeout in seconds for MCP calls.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Register the Reader and create linked datasets. Default is dry-run.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    args = parser.parse_args(argv)

    try:
        token_provider = _build_token_provider(
            access_token=args.mcp_access_token,
            token_command=args.mcp_token_command,
            client_id=args.mcp_client_id,
            client_id_file=args.mcp_client_id_file,
            refresh_token=args.mcp_refresh_token,
            refresh_token_file=args.mcp_refresh_token_file,
            token_endpoint=args.mcp_token_endpoint,
            timeout=args.timeout,
        )
        with BigQueryMCPClient(
            mcp_url=args.mcp_url,
            access_token_provider=token_provider,
            timeout=args.timeout,
        ) as mcp:
            result = autosubscribe_bigquery_listings(
                mcp=mcp,
                subscriber_project_id=args.subscriber_project_id,
                subscriber_principal=args.subscriber_principal,
                catalogs=_parse_catalogs(args.catalog),
                friendly_name=args.friendly_name,
                apply=args.apply,
            )
    except (OctogenMCPError, OctogenBigQueryError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(result.model_dump_json(indent=2))
    else:
        _print_text(result)
    return 1 if result.summary.get("error", 0) else 0


def _build_token_provider(
    *,
    access_token: str | None,
    token_command: str | None,
    client_id: str | None,
    client_id_file: str | None,
    refresh_token: str | None,
    refresh_token_file: str | None,
    token_endpoint: str,
    timeout: float,
) -> Callable[[], str]:
    if token_command:
        return lambda: _run_token_command(token_command)
    if refresh_token or refresh_token_file:
        client_id = _resolve_client_id(client_id, client_id_file)
        if not client_id:
            raise ValueError(
                "--mcp-client-id, OCTOGEN_MCP_CLIENT_ID, --mcp-client-id-file, "
                "or OCTOGEN_MCP_CLIENT_ID_FILE is required when using an MCP "
                "refresh token."
            )
        return MCPRefreshTokenProvider(
            client_id=client_id,
            refresh_token=refresh_token,
            refresh_token_file=Path(refresh_token_file) if refresh_token_file else None,
            token_endpoint=token_endpoint,
            timeout=timeout,
        )
    if access_token:
        return lambda: access_token
    raise ValueError(
        "MCP authentication is required. Set OCTOGEN_MCP_REFRESH_TOKEN_FILE "
        "with OCTOGEN_MCP_CLIENT_ID or OCTOGEN_MCP_CLIENT_ID_FILE, set "
        "OCTOGEN_MCP_ACCESS_TOKEN, pass --mcp-access-token, or pass "
        "--mcp-token-command."
    )


def _run_token_command(command: str) -> str:
    try:
        completed = subprocess.run(
            shlex.split(command),
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ValueError(f"MCP token command failed: {exc}") from exc
    output = completed.stdout.strip()
    if not output:
        raise ValueError("MCP token command printed no token.")
    if output.startswith("{"):
        try:
            payload: Any = json.loads(output)
        except ValueError as exc:
            raise ValueError("MCP token command printed invalid JSON.") from exc
        if isinstance(payload, dict) and payload.get("access_token"):
            return str(payload["access_token"])
        raise ValueError("MCP token command JSON must contain access_token.")
    return output.splitlines()[0].strip()


def _resolve_client_id(client_id: str | None, client_id_file: str | None) -> str | None:
    if client_id:
        return client_id
    if client_id_file:
        value = read_text_file(Path(client_id_file))
        return value or None
    return None


def _parse_catalogs(values: list[str]) -> list[str]:
    catalogs: list[str] = []
    for value in values:
        for item in value.split(","):
            item = item.strip()
            if item:
                catalogs.append(item)
    return catalogs


def _print_text(result: BigQueryAutoSubscribeResult) -> None:
    mode = "APPLIED" if result.applied else "DRY RUN (pass --apply to mutate)"
    print(mode)
    if result.subscriber_id:
        print(f"subscriber: {result.subscriber_id}")
    elif result.would_register_subscriber:
        print("subscriber: would register")
    if result.registered_subscriber:
        print("registered subscriber desired state in Octogen")
    print(f"summary: {_summary_text(result.summary)}")
    for item in result.catalogs:
        target = item.linked_dataset or "-"
        status = item.status or "-"
        print(f"- {item.catalog_key}: {item.action} [{status}] -> {target}")
        if item.message:
            print(f"  {item.message}")
        if item.refresh_status:
            print(f"  refreshed Octogen status: {item.refresh_status}")
        if item.sample_query and item.action in {
            "subscribed",
            "already_subscribed",
            "already_active",
        }:
            print(f"  sample query: {item.sample_query}")


def _summary_text(summary: dict[str, int]) -> str:
    if not summary:
        return "no eligible catalogs"
    return ", ".join(f"{key}={value}" for key, value in sorted(summary.items()))


if __name__ == "__main__":
    raise SystemExit(main())
