/**
 * `octogen refresh <url...>` — schedule product refreshes.
 *
 * This is the command exit `7` exists for. `POST /products/refresh` answers
 * `202` with per-target `accepted[]` and `rejected[]`, so "did it work" is not a
 * yes or a no, and collapsing it to one would either hide a rejection or throw
 * away accepted work.
 *
 * The mapping, which is a table rather than a judgement call:
 *
 * | Accepted | Rejected                    | Exit | Why                                  |
 * | -------- | --------------------------- | ---- | ------------------------------------ |
 * | > 0      | 0                           | 0    | everything was scheduled             |
 * | > 0      | > 0                         | 7    | partial success, literally           |
 * | 0        | all `product_not_found`     | 6    | the server looked; nothing to refresh |
 * | 0        | all `catalog_not_granted`   | 4    | not entitled to any of them          |
 * | 0        | all `invalid_url`           | 2    | our input was wrong                  |
 * | 0        | mixed or unrecognized codes | 7    | answered per target; read rejected[] |
 *
 * The `0`/all-`product_not_found` row is the only one that reaches `6`, and it
 * qualifies for the same reason a lookup miss does: the server consulted the
 * catalogs and had nothing.
 */

import type { ProductRefreshResponse, ProductRefreshTarget } from "@octogen-ai/sdk";

import { call } from "../client.js";
import type { CommandContext } from "../context.js";
import { CliError, ExitCode, noResult, usageError } from "../exit.js";
import type { CommandSpec } from "../registry.js";

const MAX_TARGETS = 500;

async function runRefresh(context: CommandContext): Promise<ExitCode> {
  const { args, writer } = context;
  const urls = context.positionals.filter((value) => value.length > 0);
  const uuids = args.strings("uuid");
  const catalog = args.string("catalog");

  if (urls.length === 0 && uuids.length === 0) {
    throw usageError(
      "octogen refresh <url...> requires at least one URL, or --uuid <uuid>.",
      "missing_argument",
    );
  }
  if (urls.length + uuids.length > MAX_TARGETS) {
    throw usageError(
      `octogen refresh takes at most ${String(MAX_TARGETS)} targets per call ` +
        `(got ${String(urls.length + uuids.length)}).`,
      "too_many_arguments",
    );
  }

  const targets: ProductRefreshTarget[] = [
    ...urls.map((url) => target({ catalog, url })),
    ...uuids.map((uuid) => target({ catalog, uuid })),
  ];

  const api = context.api();
  const response: ProductRefreshResponse = await call(
    api,
    "POST /products/refresh",
    () => api.client.refreshProducts({ targets }),
  );

  const accepted = response.accepted.length;
  const rejected = response.rejected;
  const data: Record<string, unknown> = {
    requestId: response.requestId,
    submitted: response.submitted,
    accepted: response.accepted,
    rejected,
    // `workflowStatus` describes the *dispatch* of the refresh workflow, not
    // the refresh: `launched` means the crawl was handed off, and the products
    // are not re-crawled yet.
    workflowStatus: response.workflowStatus ?? null,
    workflowId: response.workflowId ?? null,
  };

  const exitCode = decideExit(accepted, rejected);
  if (exitCode === ExitCode.NoResult) {
    throw noResult({
      answeredWith: "202 POST /products/refresh, every target product_not_found",
      code: "product_not_found",
      data,
      message:
        `None of the ${String(rejected.length)} targets matched an active ` +
        `product, so nothing was scheduled.`,
      serverAnswered: true,
    });
  }
  if (exitCode === ExitCode.NotEntitled || exitCode === ExitCode.Usage) {
    throw new CliError(summarize(accepted, rejected), {
      code: rejected[0]?.code ?? "refresh_rejected",
      data,
      detail: rejected,
      exitCode,
    });
  }

  writer.emit({
    command: context.command,
    data,
    exitCode,
    human: () =>
      [
        summarize(accepted, rejected),
        ...response.accepted.map(
          (item) => `  scheduled  ${item.url} (${item.catalog})`,
        ),
        ...rejected.map(
          (item) =>
            `  rejected   ${item.target.url ?? item.target.uuid ?? "?"} — ${item.code}: ${item.message}`,
        ),
      ].join("\n"),
    ok: exitCode === ExitCode.Success,
  });
  return exitCode;
}

type Rejected = ProductRefreshResponse["rejected"];

export function decideExit(accepted: number, rejected: Rejected): ExitCode {
  if (rejected.length === 0) {
    return ExitCode.Success;
  }
  if (accepted > 0) {
    return ExitCode.Partial;
  }
  const codes = new Set(rejected.map((item) => item.code));
  if (codes.size === 1) {
    const only = [...codes][0];
    if (only === "product_not_found") {
      return ExitCode.NoResult;
    }
    if (only === "catalog_not_granted") {
      return ExitCode.NotEntitled;
    }
    if (only === "invalid_url") {
      return ExitCode.Usage;
    }
  }
  // Answered per target, nothing scheduled, and no single explanation. `7`
  // rather than `1`: the server did answer, and `rejected[]` says what happened.
  return ExitCode.Partial;
}

function summarize(accepted: number, rejected: Rejected): string {
  return `${String(accepted)} scheduled, ${String(rejected.length)} rejected`;
}

function target(parts: {
  catalog: string | undefined;
  url?: string;
  uuid?: string;
}): ProductRefreshTarget {
  const built: ProductRefreshTarget = {};
  if (parts.url !== undefined) {
    built.url = parts.url;
  }
  if (parts.uuid !== undefined) {
    built.uuid = parts.uuid;
  }
  if (parts.catalog !== undefined) {
    built.catalog = parts.catalog;
  }
  return built;
}

export const refreshCommand = {
  flags: {
    catalog: {
      describe: "Scope every target to this catalog key.",
      kind: "string",
      placeholder: "key",
    },
    uuid: {
      describe: "Refresh by product UUID instead of URL (repeatable).",
      kind: "string",
      multiple: true,
      placeholder: "uuid",
    },
  },
  name: "refresh",
  notes: [
    "A 202 means the refresh workflow was dispatched, not that the products",
    "have been re-crawled. Poll with `octogen lookup` if you need the result.",
    "",
    "Exit 7 is partial success: some targets scheduled, some rejected. Read",
    "rejected[] — each entry names the target and why. Requires an API key.",
  ],
  operations: ["refreshProducts"] as const,
  run: runRefresh,
  summary: "Schedule a re-crawl for one or more products",
  usage: "refresh <url...> [--uuid <uuid>]… [--catalog <key>]",
} satisfies CommandSpec;
