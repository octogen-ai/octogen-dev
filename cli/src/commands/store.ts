/**
 * `storerouter store <host|url>` — one covered store's coverage snapshot.
 *
 * One host in, one snapshot out (`GET /v1/domains/{host}`). There is
 * deliberately no list mode and no local host cache: the full covered-host
 * list is not public, and nothing here may rebuild it. Ask about the store you
 * have.
 *
 * Exit `0` covered, `6` when the server answers `404 domain_not_covered`, and
 * never `6` for any other reason.
 */

import { normalizeHost, type DomainCoverageResponse } from "@octogen-ai/sdk";

import { call } from "../client.js";
import type { CommandContext } from "../context.js";
import { ExitCode, noResult, usageError } from "../exit.js";
import type { CommandSpec } from "../registry.js";

type CatalogCoverage = DomainCoverageResponse["catalogs"][number];

async function runStore(context: CommandContext): Promise<ExitCode> {
  const { writer } = context;
  const input = context.positionals[0];
  if (input === undefined || input.length === 0) {
    throw usageError(
      "storerouter store <host|url> requires a store host, such as thereformation.com.",
      "missing_argument",
    );
  }
  if (context.positionals.length > 1) {
    throw usageError(
      "storerouter store takes one host. For several, run it once per host.",
      "too_many_arguments",
    );
  }
  // Normalized the way the API normalizes `source_hosts`: lowercased, port and
  // leading `www.` dropped, so a product URL asks about its store.
  const host = normalizeHost(input);
  if (host === undefined) {
    throw usageError(
      `No host in ${JSON.stringify(input)}. Pass a host such as thereformation.com, or a URL.`,
      "invalid_host",
    );
  }

  const api = context.api();

  let response: DomainCoverageResponse;
  try {
    response = await call(
      api,
      `GET /domains/${host}`,
      () => api.client.getDomain(host),
      { coverageAdjacent: true },
    );
  } catch (error) {
    throw asNotCoveredOrRethrow(error, host);
  }

  writer.emit({
    command: context.command,
    data: {
      host: response.host,
      covered: true,
      coverage: "covered",
      catalogs: response.catalogs,
    },
    exitCode: ExitCode.Success,
    human: () => renderCoverage(response),
    ok: true,
  });
  return ExitCode.Success;
}

/**
 * `404 domain_not_covered` is the server saying no catalog claims the host —
 * a decided answer, exit `6`. A `404` with any other body is left to the
 * taxonomy: an unrecognized shape must not borrow the meaning of `6`.
 */
function asNotCoveredOrRethrow(error: unknown, host: string): unknown {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  const status: unknown = (error as { status?: unknown }).status;
  const code: unknown = (error as { code?: unknown }).code;
  if (status === 404 && code === "domain_not_covered") {
    return noResult({
      answeredWith: "404 domain_not_covered from GET /domains/{host}",
      code: "domain_not_covered",
      coverage: "not_covered",
      data: { host, covered: false, catalogs: [] },
      message: `${host} is not covered: no StoreRouter catalog serves it.`,
      remediation: { url: "https://storerouter.ai/contact" },
      serverAnswered: true,
    });
  }
  return error;
}

function renderCoverage(response: DomainCoverageResponse): string {
  const count = response.catalogs.length;
  const lines = [
    `${response.host} is covered by ${String(count)} catalog${count === 1 ? "" : "s"}`,
  ];
  for (const catalog of response.catalogs) {
    lines.push("", ...renderCatalog(catalog));
  }
  return lines.join("\n");
}

function renderCatalog(catalog: CatalogCoverage): string[] {
  const lines = [
    `${catalog.catalogDisplayName} (${catalog.catalog})`,
    `  products   ${formatCount(catalog.productCount)}`,
    `  price      ${formatPrice(catalog.price)}`,
    `  computed   ${catalog.computedAt}`,
  ];
  if (catalog.fields.length === 0) {
    lines.push("  fields     —");
    return lines;
  }
  // The server orders fields by `source`, then coverage, so each group's head
  // is its best-covered fields. A big catalog has well over a hundred.
  const groups = new Map<string, CatalogCoverage["fields"]>();
  for (const field of catalog.fields) {
    groups.set(field.source, [...(groups.get(field.source) ?? []), field]);
  }
  const counts = [...groups].map(
    ([source, fields]) => `${source} ${String(fields.length)}`,
  );
  lines.push(
    `  fields     ${String(catalog.fields.length)} populated (${counts.join(", ")})`,
  );
  const shown = [...groups.values()].flatMap((fields) =>
    fields.slice(0, FIELDS_PER_SOURCE),
  );
  const width = Math.max(...shown.map((field) => field.name.length));
  for (const field of shown) {
    const top = field.topValues
      .slice(0, 3)
      .map((value) => value.label)
      .join(", ");
    const percent = `${String(Math.round(field.coverage * 100))}%`.padStart(4);
    lines.push(
      `    ${field.name.padEnd(width)}  ${percent}  ${top}${
        field.truncated || field.topValues.length > 3 ? ", …" : ""
      }`,
    );
  }
  const hidden = catalog.fields.length - shown.length;
  if (hidden > 0) {
    lines.push(`    … ${String(hidden)} more fields (--json for all)`);
  }
  return lines;
}

/** Fields shown per source in the human summary; `--json` carries them all. */
const FIELDS_PER_SOURCE = 6;

function formatPrice(price: CatalogCoverage["price"]): string {
  if (price === null || price === undefined) {
    return "—";
  }
  const first = price.buckets[0];
  const last = price.buckets[price.buckets.length - 1];
  const range =
    first === undefined || last === undefined
      ? ""
      : `, ${formatAmount(first.min)}–${formatAmount(last.max)}`;
  return `median ${formatAmount(price.median)}${range} (${formatCount(price.populated)} priced)`;
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Thousands separators without `Intl`, so the browser runtime prints the same. */
function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const storeCommand = {
  name: "store",
  notes: [
    "Takes a bare host or any URL on the store, normalized the way the API",
    "normalizes hosts: lowercased, port and leading `www.` dropped. So",
    "`https://www.TheReformation.com/products/x` asks about thereformation.com.",
    "",
    "Exit 6 means the server answered 404 domain_not_covered: no catalog serves",
    "that host. One host per call; there is no list of covered hosts.",
  ],
  operations: ["getDomain"] as const,
  run: runStore,
  summary: "Show one store's coverage: catalogs, product counts, fields, prices",
  usage: "store <host|url>",
} satisfies CommandSpec;
