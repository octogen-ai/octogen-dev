/**
 * `storerouter stores <search|similar|show|products|categories>` — store discovery
 * and one store's coverage and products.
 *
 * `stores search <description>` ranks profiled stores by observed assortment
 * (`POST /v1/stores/search`); an empty answer exits `6`.
 *
 * `stores show <domain|url>` is one domain in, one snapshot out
 * (`GET /v1/stores/{domain}`). There is deliberately no list mode and no local
 * host cache: the full covered-host list is not public, and nothing here may
 * rebuild it. Ask about the store you have. Exit `0` covered, `6` when the
 * server answers `404 domain_not_covered`, and never `6` for any other reason.
 *
 * `stores categories <domain|url>` ranks the `category_path.depth_<n>` fields of
 * that same snapshot, so it needs no profile and no second request.
 *
 * `stores products <domain|url> [query]` is `POST /v1/products/search` with
 * `stores: [domain]`; `stores similar <domain|url>…` is `POST /v1/stores/similar`.
 */

import {
  normalizeHost,
  type MerchantProductListPage,
  type SearchProductsParams,
  type SearchSimilarStoresParams,
  type SearchStoresParams,
  type StoreCoverageResponse,
  type StoreSearchResponse,
  type StoreSearchResult,
} from "@octogen-ai/sdk";

import { call } from "../client.js";
import { contractFlags, contractRequest } from "../contract.js";
import type { CommandContext } from "../context.js";
import { ExitCode, noResult, usageError } from "../exit.js";
import {
  STORE_PRODUCTS_FIELDS,
  STORE_SEARCH_FIELDS,
  STORE_SIMILAR_FIELDS,
} from "../fields.js";
import type { CommandSpec } from "../registry.js";
import { parseFacets } from "./search.js";

type CatalogCoverage = StoreCoverageResponse["catalogs"][number];

/** What a store catalog and a brand share: one population's snapshot. */
export type CoverageSnapshot = Pick<
  CatalogCoverage,
  "computedAt" | "fields" | "price" | "productCount"
>;

/** The one `<domain|url>` positional, normalized the way the API normalizes hosts. */
function hostArgument(context: CommandContext, command: string): string {
  const input = context.positionals[0];
  if (input === undefined || input.length === 0) {
    throw usageError(
      `storerouter ${command} <domain|url> requires a store domain, such as thereformation.com.`,
      "missing_argument",
    );
  }
  if (context.positionals.length > 1) {
    throw usageError(
      `storerouter ${command} takes one domain. For several, run it once per domain.`,
      "too_many_arguments",
    );
  }
  return parseHost(input);
}

/**
 * Normalized the way the API normalizes `source_hosts`: lowercased, port and
 * leading `www.` dropped, so a product URL asks about its store.
 */
function parseHost(input: string): string {
  const host = normalizeHost(input);
  if (host === undefined) {
    throw usageError(
      `No host in ${JSON.stringify(input)}. Pass a domain such as thereformation.com, or a URL.`,
      "invalid_host",
    );
  }
  return host;
}

async function getStore(
  context: CommandContext,
  host: string,
): Promise<StoreCoverageResponse> {
  const api = context.api();
  try {
    return await call(api, `GET /stores/${host}`, () => api.client.getStore(host), {
      coverageAdjacent: true,
    });
  } catch (error) {
    throw asNotCoveredOrRethrow(error, host);
  }
}

async function runShow(context: CommandContext): Promise<ExitCode> {
  const { writer } = context;
  const response = await getStore(context, hostArgument(context, "stores show"));

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
function asNotCoveredOrRethrow(
  error: unknown,
  host: string,
  route = "GET /stores/{domain}",
): unknown {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  const status: unknown = (error as { status?: unknown }).status;
  const code: unknown = (error as { code?: unknown }).code;
  if (status === 404 && code === "domain_not_covered") {
    return noResult({
      answeredWith: `404 domain_not_covered from ${route}`,
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

// ── stores categories ───────────────────────────────────────────────────────

/** `category_path.depth_<n>` coverage fields carry one taxonomy level each. */
const CATEGORY_FIELD = /^category_path\.depth_(\d+)$/;

/**
 * Coverage keeps each field's top 10 values, so ranking across levels is exact
 * only up to 10: an 11th value at one level could outrank another's 10th.
 */
const MAX_CATEGORIES = 10;

interface StoreCategory {
  name: string;
  level: number;
  count: number;
  share: number;
}

/** A catalog's categories at `minLevel` or deeper, most products first. */
function topCategories(
  catalog: CatalogCoverage,
  minLevel: number,
  limit: number,
): StoreCategory[] {
  const categories: StoreCategory[] = [];
  for (const field of catalog.fields) {
    const level = Number(CATEGORY_FIELD.exec(field.name)?.[1]);
    if (!Number.isInteger(level) || level < minLevel) {
      continue;
    }
    for (const value of field.topValues) {
      categories.push({
        name: value.label,
        level,
        count: value.count,
        share: catalog.productCount === 0 ? 0 : value.count / catalog.productCount,
      });
    }
  }
  // Ties go to the deeper, more specific level, then to the name.
  return categories
    .sort(
      (a, b) => b.count - a.count || b.level - a.level || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

async function runCategories(context: CommandContext): Promise<ExitCode> {
  const host = hostArgument(context, "stores categories");
  const minLevel = context.args.integer("min-level", { min: 0, max: 10 }) ?? 0;
  const limit = context.args.integer("limit", { min: 1, max: MAX_CATEGORIES }) ?? 3;
  const response = await getStore(context, host);

  const catalogs = response.catalogs.map((catalog) => ({
    catalog: catalog.catalog,
    catalogDisplayName: catalog.catalogDisplayName,
    productCount: catalog.productCount,
    computedAt: catalog.computedAt,
    categories: topCategories(catalog, minLevel, limit),
  }));
  if (catalogs.every((catalog) => catalog.categories.length === 0)) {
    throw noResult({
      answeredWith: "200 GET /stores/{domain} with no category coverage",
      code: "no_matches",
      data: { host: response.host, catalogs },
      message: `No categories are counted for ${response.host} at level ${String(minLevel)} or deeper.`,
      serverAnswered: true,
    });
  }
  context.writer.emit({
    command: context.command,
    data: { host: response.host, catalogs },
    exitCode: ExitCode.Success,
    human: () =>
      [
        `Top categories for ${response.host}`,
        ...catalogs.flatMap((catalog) => [
          "",
          `${catalog.catalogDisplayName} (${catalog.catalog}) · ${formatCount(
            catalog.productCount,
          )} products`,
          ...(catalog.categories.length === 0
            ? ["  —"]
            : catalog.categories.map(
                (category) =>
                  `  ${category.name} (level ${String(category.level)})  ${formatCount(
                    category.count,
                  )} · ${String(Math.round(category.share * 100))}%`,
              )),
        ]),
      ].join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

export const storesCategoriesCommand = {
  flags: {
    "min-level": {
      describe:
        "Skip shallower taxonomy levels, e.g. 2 for Dresses over Clothing. Default: 0. Maximum: 10.",
      kind: "number",
      placeholder: "n",
    },
    limit: {
      describe: `Categories per catalog. Default: 3. Maximum: ${String(MAX_CATEGORIES)}.`,
      kind: "number",
      placeholder: "n",
    },
  },
  name: "stores categories",
  notes: [
    "Categories ranked by how many of the store's indexed products they hold,",
    "with each one's share of the catalog. Read from the same coverage snapshot",
    "as `stores show`, one list per catalog serving the domain.",
    "",
    "Exit 6 means the domain is not covered, or no category is counted at",
    "--min-level or deeper.",
  ],
  operations: ["getStore"] as const,
  run: runCategories,
  summary: "Show a store's top categories by product count",
  usage: "stores categories <domain|url> [--min-level <n>] [--limit <n>]",
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

// ── stores products ─────────────────────────────────────────────────────────

async function runProducts(context: CommandContext): Promise<ExitCode> {
  const [input, ...words] = context.positionals;
  if (input === undefined || input.length === 0) {
    throw usageError(
      "storerouter stores products <domain|url> [query] requires a store domain, such as thereformation.com.",
      "missing_argument",
    );
  }
  const host = parseHost(input);
  const query = words.join(" ").trim();
  const facets = parseFacets(context.args.strings("facet"), "--facet");
  const params = contractRequest<SearchProductsParams>(
    "searchProducts",
    STORE_PRODUCTS_FIELDS,
    context.args,
    {
      stores: [host],
      ...(query.length === 0 ? {} : { q: query }),
      ...(facets.length === 0 ? {} : { facets }),
    },
  );
  if (
    params.priceMin !== undefined &&
    params.priceMax !== undefined &&
    params.priceMin > params.priceMax
  ) {
    throw usageError(
      `--price-min ${String(params.priceMin)} is above --price-max ${String(params.priceMax)}.`,
      "conflicting_options",
    );
  }

  const api = context.api();
  let page: MerchantProductListPage;
  try {
    // One request per page: the server resolves the domain to its catalogs.
    page = await call(api, "POST /products/search", () =>
      api.client.searchProducts(params),
    );
  } catch (error) {
    throw asNotCoveredOrRethrow(error, host, "POST /products/search");
  }
  if (page.items.length === 0) {
    throw noResult({
      answeredWith: "200 POST /products/search with an empty items[]",
      code: "no_matches",
      data: { host, query: query || null, items: [], nextCursor: null },
      message:
        query.length === 0
          ? `No products are available from ${host} with these filters.`
          : `No products from ${host} matched ${JSON.stringify(query)}.`,
      serverAnswered: true,
    });
  }
  context.writer.emit({
    command: context.command,
    data: {
      host,
      query: query || null,
      count: page.items.length,
      nextCursor: page.nextCursor ?? null,
      items: page.items.map((item) => ({
        uuid: item.uuid,
        catalog: item.catalogKey ?? null,
        title: item.title ?? null,
        brand: item.brand?.name ?? null,
        currentPrice: item.currentPrice ?? null,
        productUrl: item.productUrl,
      })),
    },
    exitCode: ExitCode.Success,
    human: () =>
      [
        `${String(page.items.length)} ${host} products${
          query.length === 0 ? "" : ` for ${JSON.stringify(query)}`
        }`,
        ...page.items.map(
          (item) =>
            `  ${item.brand?.name ?? "—"} · ${item.title ?? "(untitled)"} · ${
              item.currentPrice === null || item.currentPrice === undefined
                ? "—"
                : String(item.currentPrice)
            }\n    ${item.productUrl}`,
        ),
        page.nextCursor === null || page.nextCursor === undefined
          ? ""
          : `  next: --cursor ${page.nextCursor}`,
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

export const storesProductsCommand = {
  flags: contractFlags("searchProducts", STORE_PRODUCTS_FIELDS),
  name: "stores products",
  notes: [
    "Products from every catalog serving the domain, in one request per page:",
    "the API resolves the domain the way `stores show` does. Words after the",
    "domain are the query; with none, it browses by the filters alone.",
    "Continue with --cursor <nextCursor> and the same arguments.",
    "",
    "Exit 6 means the domain is not covered (`domain_not_covered`), or nothing",
    "matched (`no_matches`).",
  ],
  operations: ["searchProducts"] as const,
  run: runProducts,
  summary: "Browse or search one store's products",
  usage:
    "stores products <domain|url> [query] [--facet k=v]… [--price-min <n>] [--price-max <n>] [--limit <n>] [--cursor <c>]",
} satisfies CommandSpec;

// ── stores similar ──────────────────────────────────────────────────────────

/** Both of similar's `404`s are decided answers; anything else is the taxonomy's. */
function similarMissOrRethrow(error: unknown, hosts: readonly string[]): unknown {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  const status: unknown = (error as { status?: unknown }).status;
  const code: unknown = (error as { code?: unknown }).code;
  const named = hosts.length === 1 ? hosts[0] : `One of ${hosts.join(", ")}`;
  if (status === 404 && code === "domain_not_covered") {
    return noResult({
      answeredWith: "404 domain_not_covered from POST /stores/similar",
      code: "domain_not_covered",
      coverage: "not_covered",
      data: { stores: hosts, covered: false },
      message: `${String(named)} is not covered: no StoreRouter catalog serves it.`,
      remediation: { url: "https://storerouter.ai/contact" },
      serverAnswered: true,
    });
  }
  if (status === 404 && code === "store_not_profiled") {
    return noResult({
      answeredWith: "404 store_not_profiled from POST /stores/similar",
      code: "store_not_profiled",
      data: { stores: hosts },
      message: `${String(named)} has no published store profile to compare.`,
      serverAnswered: true,
    });
  }
  return error;
}

async function runSimilar(context: CommandContext): Promise<ExitCode> {
  if (context.positionals.length === 0) {
    throw usageError(
      "storerouter stores similar <domain|url>… requires at least one store domain, such as thereformation.com.",
      "missing_argument",
    );
  }
  const hosts = [...new Set(context.positionals.map(parseHost))];
  const params = contractRequest<SearchSimilarStoresParams>(
    "searchSimilarStores",
    STORE_SIMILAR_FIELDS,
    context.args,
    { stores: hosts },
  );

  const api = context.api();
  let response: StoreSearchResponse;
  try {
    response = await call(api, "POST /stores/similar", () =>
      api.client.searchSimilarStores(params),
    );
  } catch (error) {
    throw similarMissOrRethrow(error, hosts);
  }
  if (response.results.length === 0) {
    throw noResult({
      answeredWith: "200 POST /stores/similar with an empty results[]",
      code: "no_matches",
      data: { similarTo: hosts, stores: [] },
      message: `No other profiled stores to compare with ${hosts.join(", ")}.`,
      serverAnswered: true,
    });
  }
  const count = response.results.length;
  context.writer.emit({
    command: context.command,
    data: {
      similarTo: hosts,
      count,
      stores: response.results.map(withoutDistributions),
    },
    exitCode: ExitCode.Success,
    human: () =>
      [
        `${String(count)} store${count === 1 ? "" : "s"} like ${hosts.join(", ")}`,
        ...response.results.map(storeLine),
      ].join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

export const storesSimilarCommand = {
  flags: contractFlags("searchSimilarStores", STORE_SIMILAR_FIELDS),
  name: "stores similar",
  notes: [
    "Ranks profiled stores by how much their whole assortment resembles the",
    "given stores'; several stores are averaged. Compares the same profiled",
    "stores as `stores search`, so fewer than --limit results is normal, and",
    "the given stores never appear in their own results.",
    "",
    "Exit 6 means a store is not covered (`domain_not_covered`), has no",
    "published profile (`store_not_profiled`), or nothing else is profiled.",
  ],
  operations: ["searchSimilarStores"] as const,
  run: runSimilar,
  summary: "Find stores similar to one or more stores",
  usage: "stores similar <domain|url>… [--limit <n>]",
} satisfies CommandSpec;
