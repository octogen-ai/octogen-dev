/**
 * `storerouter stores <search|show>` — store discovery and one store's coverage.
 *
 * `stores search <description>` ranks profiled stores by observed assortment
 * (`POST /v1/stores/search`); an empty answer exits `6`.
 *
 * `stores show <domain|url>` is one domain in, one snapshot out
 * (`GET /v1/stores/{domain}`). There is deliberately no list mode and no local
 * host cache: the full covered-host list is not public, and nothing here may
 * rebuild it. Ask about the store you have. Exit `0` covered, `6` when the
 * server answers `404 domain_not_covered`, and never `6` for any other reason.
 */

import {
  normalizeHost,
  type SearchStoresParams,
  type StoreCoverageResponse,
  type StoreSearchResult,
} from "@octogen-ai/sdk";

import { call } from "../client.js";
import { contractFlags, contractRequest } from "../contract.js";
import type { CommandContext } from "../context.js";
import { ExitCode, noResult, usageError } from "../exit.js";
import { STORE_SEARCH_FIELDS } from "../fields.js";
import type { CommandSpec } from "../registry.js";

type CatalogCoverage = StoreCoverageResponse["catalogs"][number];

/** What a store catalog and a brand share: one population's snapshot. */
export type CoverageSnapshot = Pick<
  CatalogCoverage,
  "computedAt" | "fields" | "price" | "productCount"
>;

async function runShow(context: CommandContext): Promise<ExitCode> {
  const { writer } = context;
  const input = context.positionals[0];
  if (input === undefined || input.length === 0) {
    throw usageError(
      "storerouter stores show <domain|url> requires a store domain, such as thereformation.com.",
      "missing_argument",
    );
  }
  if (context.positionals.length > 1) {
    throw usageError(
      "storerouter stores show takes one domain. For several, run it once per domain.",
      "too_many_arguments",
    );
  }
  // Normalized the way the API normalizes `source_hosts`: lowercased, port and
  // leading `www.` dropped, so a product URL asks about its store.
  const host = normalizeHost(input);
  if (host === undefined) {
    throw usageError(
      `No host in ${JSON.stringify(input)}. Pass a domain such as thereformation.com, or a URL.`,
      "invalid_host",
    );
  }

  const api = context.api();

  let response: StoreCoverageResponse;
  try {
    response = await call(api, `GET /stores/${host}`, () => api.client.getStore(host), {
      coverageAdjacent: true,
    });
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
      answeredWith: "404 domain_not_covered from GET /stores/{domain}",
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

function renderCoverage(response: StoreCoverageResponse): string {
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
  return [
    `${catalog.catalogDisplayName} (${catalog.catalog})`,
    ...renderSnapshot(catalog),
  ];
}

/** Indented product count, price, freshness and best-covered fields. */
export function renderSnapshot(catalog: CoverageSnapshot): string[] {
  const lines = [
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
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const storesShowCommand = {
  name: "stores show",
  notes: [
    "Takes a bare domain or any URL on the store, normalized the way the API",
    "normalizes hosts: lowercased, port and leading `www.` dropped. So",
    "`https://www.TheReformation.com/products/x` asks about thereformation.com.",
    "",
    "Exit 6 means the server answered 404 domain_not_covered: no catalog serves",
    "that domain. One domain per call; there is no list of covered stores.",
  ],
  operations: ["getStore"] as const,
  run: runShow,
  summary: "Show one store's coverage: catalogs, product counts, fields, prices",
  usage: "stores show <domain|url>",
} satisfies CommandSpec;

// ── stores search ───────────────────────────────────────────────────────────

async function runSearch(context: CommandContext): Promise<ExitCode> {
  const text = context.positionals.join(" ").trim();
  if (text.length === 0) {
    throw usageError(
      "storerouter stores search <description> requires a description, such as 'linen dresses'.",
      "missing_argument",
    );
  }
  const params = contractRequest<SearchStoresParams>(
    "searchStores",
    STORE_SEARCH_FIELDS,
    context.args,
    { text },
  );

  const api = context.api();
  const response = await call(api, "POST /stores/search", () =>
    api.client.searchStores(params),
  );
  if (response.results.length === 0) {
    throw noResult({
      answeredWith: "200 POST /stores/search with an empty results[]",
      code: "no_matches",
      data: { query: text, stores: [] },
      message: `No profiled stores matched ${JSON.stringify(text)}.`,
      serverAnswered: true,
    });
  }
  const count = response.results.length;
  context.writer.emit({
    command: context.command,
    data: { query: text, count, stores: response.results.map(withoutDistributions) },
    exitCode: ExitCode.Success,
    human: () =>
      [
        `${String(count)} store${count === 1 ? "" : "s"} for ${JSON.stringify(text)}`,
        ...response.results.map(storeLine),
      ].join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

/**
 * A matched department carries every field distribution of its profile, about
 * 100 KB per store, so `--json` keeps its identity, size and summary;
 * `stores show <domain> --json` has the full profile.
 */
function withoutDistributions(result: StoreSearchResult): Record<string, unknown> {
  const department = result.matchedDepartment;
  if (department === null || department === undefined) {
    return { ...result, matchedDepartment: null };
  }
  return {
    ...result,
    matchedDepartment: {
      departmentId: department.departmentId,
      categoryPath: department.categoryPath,
      productCount: department.productCount,
      summary: department.summary,
    },
  };
}

/** Name and domain, then the department that matched and its profiled size. */
function storeLine(result: StoreSearchResult): string {
  const line = `  ${result.store.displayName} · ${result.store.primaryDomain}`;
  const department = result.matchedDepartment;
  if (department === null || department === undefined) {
    return line;
  }
  return `${line}\n    ${department.categoryPath.join(" > ")} · ${formatCount(
    department.productCount,
  )} products profiled`;
}

export const storesSearchCommand = {
  flags: contractFlags("searchStores", STORE_SEARCH_FIELDS),
  name: "stores search",
  notes: [
    "Ranks stores by how well their observed assortment matches a plain-language",
    "description, plus an exact store-name or domain match. Searches the stores",
    "with published profiles, not every covered store, so fewer than --limit",
    "results is normal and there is no next page.",
    "",
    "Product counts describe the store's profiled department, not products that",
    "match the description: use `storerouter search` for products, and",
    "`storerouter stores show <domain>` for one store's coverage and full profile.",
    "--json omits each matched department's distributions, which `stores show` has.",
    "",
    "Exit 6 means the server searched and no profiled store matched.",
  ],
  operations: ["searchStores"] as const,
  run: runSearch,
  summary: "Find stores from a plain-language description of what they sell",
  usage: "stores search <description> [--limit <n>]",
} satisfies CommandSpec;
