/**
 * `storerouter brands <search|similar|prefix|show|products|categories>` — brand
 * discovery over `/v1/brands`.
 *
 * Search, similar, prefix, show and categories read corpus-wide brand
 * metadata; `products` browses within the catalogs the key can access. There
 * is no command that lists every brand: the full directory is not public.
 *
 * `{brand}` is a slug or a case-insensitive name, sent as given. A brand the
 * server cannot resolve (`404 brand_not_found`) and an empty result both exit
 * `6`; the `code` field separates them.
 */

import type {
  BrandCoverageResponse,
  BrandProductsPage,
  BrandTopCategoriesPage,
  SearchBrandsFromTextParams,
  SearchSimilarBrandsParams,
  SimilarBrandView,
  SimilarBrandsResponse,
} from "@octogen-ai/sdk";

import { contractFlags, contractRequest } from "../contract.js";

import { call } from "../client.js";
import type { CommandContext } from "../context.js";
import { ExitCode, noResult, usageError } from "../exit.js";
import {
  BRAND_CATEGORIES_FIELDS,
  BRAND_PREFIX_FIELDS,
  BRAND_PRODUCTS_FIELDS,
  BRAND_SEARCH_FIELDS,
  BRAND_SHOW_FIELDS,
  BRAND_SIMILAR_FIELDS,
} from "../fields.js";
import type { CommandSpec } from "../registry.js";
import { parseFacets } from "./search.js";
import { formatCount, renderSnapshot } from "./stores.js";

/** The one positional brand, or a usage error naming the command. */
function brandArgument(context: CommandContext): string {
  const brand = context.positionals.join(" ").trim();
  if (brand.length === 0) {
    throw usageError(
      `storerouter ${context.command} <brand> requires a brand name or slug, such as reformation.`,
      "missing_argument",
    );
  }
  return brand;
}

/** `404 brand_not_found` is a decided answer, exit `6`; any other error is left to the taxonomy. */
function brandMissOrRethrow(
  error: unknown,
  brand: string,
  answeredWith: string,
): unknown {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  const status: unknown = (error as { status?: unknown }).status;
  const code: unknown = (error as { code?: unknown }).code;
  if (status === 404 && code === "brand_not_found") {
    return noResult({
      answeredWith: `404 brand_not_found from ${answeredWith}`,
      code: "brand_not_found",
      data: { brand },
      message: `No brand matches ${JSON.stringify(brand)}.`,
      remediation: {
        command: `storerouter brands prefix ${brand.slice(0, 3).trim()}`,
      },
      serverAnswered: true,
    });
  }
  return error;
}

function brandSummary(brand: SimilarBrandView): Record<string, unknown> {
  return {
    uuid: brand.brandUuid,
    name: brand.brandName ?? null,
    slug: brand.brandSlug ?? null,
    domain: brand.domain ?? null,
    description: brand.brandDescription ?? null,
  };
}

/** Descriptions run to paragraphs; a listing shows one line of each (`--json` has all). */
const DESCRIPTION_CHARS = 100;

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= DESCRIPTION_CHARS
    ? flat
    : `${flat.slice(0, DESCRIPTION_CHARS - 1).trimEnd()}…`;
}

function brandLines(results: readonly SimilarBrandView[]): string[] {
  return results.map(
    (brand) =>
      `  ${brand.brandName ?? "(unnamed)"}${brand.domain ? ` · ${brand.domain}` : ""}${
        brand.brandDescription ? `\n    ${oneLine(brand.brandDescription)}` : ""
      }`,
  );
}

function emitBrands(
  context: CommandContext,
  response: SimilarBrandsResponse,
  heading: string,
  data: Record<string, unknown>,
): ExitCode {
  context.writer.emit({
    command: context.command,
    data: {
      ...data,
      count: response.results.length,
      totalFound: response.totalFound,
      brands: response.results.map(brandSummary),
    },
    exitCode: ExitCode.Success,
    human: () => [heading, ...brandLines(response.results)].join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

// ── brands search ───────────────────────────────────────────────────────────

async function runSearch(context: CommandContext): Promise<ExitCode> {
  const text = context.positionals.join(" ").trim();
  if (text.length === 0) {
    throw usageError(
      "storerouter brands search <description> requires a description, such as 'sustainable linen basics'.",
      "missing_argument",
    );
  }
  const facets = parseFacets(context.args.strings("facet"), "--facet");
  const params = contractRequest<SearchBrandsFromTextParams>(
    "searchBrandsFromText",
    BRAND_SEARCH_FIELDS,
    context.args,
    { text, ...(facets.length === 0 ? {} : { facets }) },
  );

  const api = context.api();
  const response = await call(api, "POST /brands/search", () =>
    api.client.searchBrandsFromText(params),
  );
  if (response.results.length === 0) {
    throw noResult({
      answeredWith: "200 POST /brands/search with an empty results[]",
      code: "no_matches",
      data: { query: text, brands: [] },
      message: `No brands matched ${JSON.stringify(text)}.`,
      serverAnswered: true,
    });
  }
  return emitBrands(
    context,
    response,
    `${String(response.results.length)} brands for ${JSON.stringify(text)}`,
    { query: text, like: params.referenceBrands ?? [] },
  );
}

export const brandsSearchCommand = {
  flags: contractFlags("searchBrandsFromText", BRAND_SEARCH_FIELDS),
  name: "brands search",
  notes: [
    "Ranks brands by how well they match a plain-language description.",
    "--like names brands whose style steers the ranking; repeat it for several.",
    "Brand facets use the brand index's names, e.g. --facet facet_price_tier=premium.",
    "",
    "Exit 6 means the server searched and no brand matched.",
  ],
  operations: ["searchBrandsFromText"] as const,
  run: runSearch,
  summary: "Find brands from a plain-language description",
  usage: "brands search <description> [--like <brand>]… [--facet k=v]… [--limit <n>]",
} satisfies CommandSpec;

// ── brands similar ──────────────────────────────────────────────────────────

async function runSimilar(context: CommandContext): Promise<ExitCode> {
  const brands = context.positionals.map((brand) => brand.trim()).filter(Boolean);
  if (brands.length === 0) {
    throw usageError(
      "storerouter brands similar <brand>… requires at least one brand. Quote names with spaces.",
      "missing_argument",
    );
  }
  const facets = parseFacets(context.args.strings("facet"), "--facet");
  const exclude = parseFacets(context.args.strings("exclude-facet"), "--exclude-facet");
  const params = contractRequest<SearchSimilarBrandsParams>(
    "searchSimilarBrands",
    BRAND_SIMILAR_FIELDS,
    context.args,
    {
      brands,
      ...(facets.length === 0 ? {} : { facets }),
      ...(exclude.length === 0 ? {} : { exclusionFacets: exclude }),
    },
  );

  const api = context.api();
  let response: SimilarBrandsResponse;
  try {
    response = await call(api, "POST /brands/similar", () =>
      api.client.searchSimilarBrands(params),
    );
  } catch (error) {
    throw brandMissOrRethrow(error, brands.join(", "), "POST /brands/similar");
  }
  if (response.results.length === 0) {
    throw noResult({
      answeredWith: "200 POST /brands/similar with an empty results[]",
      code: "no_matches",
      data: { source: brands, brands: [] },
      message: `No brands similar to ${brands.join(", ")} were found.`,
      serverAnswered: true,
    });
  }
  return emitBrands(
    context,
    response,
    `${String(response.results.length)} brands similar to ${brands.join(", ")}`,
    { source: brands },
  );
}

export const brandsSimilarCommand = {
  flags: contractFlags("searchSimilarBrands", BRAND_SIMILAR_FIELDS),
  name: "brands similar",
  notes: [
    "Each positional is one source brand (case-insensitive name); quote names",
    "with spaces. Up to 20.",
    "",
    "Exit 6 covers both 'a source brand is unknown' and 'nothing was similar';",
    "the `code` field separates them.",
  ],
  operations: ["searchSimilarBrands"] as const,
  run: runSimilar,
  summary: "Find brands similar to one or more brands",
  usage: "brands similar <brand>… [--facet k=v]… [--exclude-facet k=v]… [--limit <n>]",
} satisfies CommandSpec;

// ── brands prefix ───────────────────────────────────────────────────────────

async function runPrefix(context: CommandContext): Promise<ExitCode> {
  const prefix = context.positionals.join(" ").trim();
  if (prefix.length === 0) {
    throw usageError(
      "storerouter brands prefix <prefix> requires the start of a brand name.",
      "missing_argument",
    );
  }
  const params = contractRequest<{ prefix: string; limit: number }>(
    "searchBrandPrefix",
    BRAND_PREFIX_FIELDS,
    context.args,
    { prefix },
  );

  const api = context.api();
  const names = await call(api, "GET /brands/prefix", () =>
    api.client.searchBrandPrefix(params.prefix, { limit: params.limit }),
  );
  if (names.length === 0) {
    throw noResult({
      answeredWith: "200 GET /brands/prefix with an empty list",
      code: "no_matches",
      data: { prefix, brands: [] },
      message: `No brand names start with ${JSON.stringify(prefix)}.`,
      serverAnswered: true,
    });
  }
  context.writer.emit({
    command: context.command,
    data: { prefix, count: names.length, brands: names },
    exitCode: ExitCode.Success,
    human: () => names.join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

export const brandsPrefixCommand = {
  flags: contractFlags("searchBrandPrefix", BRAND_PREFIX_FIELDS),
  name: "brands prefix",
  notes: [
    "Canonical brand names that start with <prefix>, for completing a name",
    "before passing it to `brands show` or `brands products`.",
  ],
  operations: ["searchBrandPrefix"] as const,
  run: runPrefix,
  summary: "Complete a brand name from its first letters",
  usage: "brands prefix <prefix> [--limit <n>]",
} satisfies CommandSpec;

// ── brands show ─────────────────────────────────────────────────────────────

function detailLine(
  label: string,
  value: string | number | null | undefined,
): string[] {
  return value === null || value === undefined || value === ""
    ? []
    : [`  ${label.padEnd(10)} ${String(value)}`];
}

/** Catalogs carrying the brand, most products first, with hosts for `stores show`. */
function renderBrandCatalogs(details: BrandCoverageResponse): string[] {
  const { catalogs } = details;
  if (catalogs.length === 0) return ["  catalogs   —"];
  const names = catalogs.map((c) => `${c.catalogDisplayName} (${c.catalog})`);
  const counts = catalogs.map((c) => formatCount(c.productCount));
  const nameWidth = Math.max(...names.map((name) => name.length));
  const countWidth = Math.max(...counts.map((count) => count.length));
  const lines = [
    `  catalogs   ${String(catalogs.length)}${details.catalogsTruncated ? "+" : ""}`,
  ];
  catalogs.forEach((catalog, i) => {
    const hosts = catalog.hosts.slice(0, HOSTS_PER_CATALOG).join(", ");
    const more = catalog.hosts.length > HOSTS_PER_CATALOG ? ", …" : "";
    lines.push(
      `    ${(names[i] ?? "").padEnd(nameWidth)}  ${(counts[i] ?? "").padStart(countWidth)}  ${hosts}${more}`.trimEnd(),
    );
  });
  if (details.catalogsTruncated) {
    lines.push("    … more catalogs not listed");
  }
  return lines;
}

/** Hosts shown per catalog; any one of them works with `storerouter stores show`. */
const HOSTS_PER_CATALOG = 2;

async function runShow(context: CommandContext): Promise<ExitCode> {
  const brand = brandArgument(context);
  contractRequest("getBrandDetails", BRAND_SHOW_FIELDS, context.args, { brand });

  const api = context.api();
  let details: BrandCoverageResponse;
  try {
    details = await call(api, `GET /brands/${encodeURIComponent(brand)}`, () =>
      api.client.getBrandDetails(brand),
    );
  } catch (error) {
    throw brandMissOrRethrow(error, brand, "GET /brands/{brand}");
  }
  context.writer.emit({
    command: context.command,
    data: { brand: details },
    exitCode: ExitCode.Success,
    human: () =>
      [
        details.brandName,
        ...detailLine("slug", details.brandSlug),
        ...detailLine("domain", details.domain),
        ...detailLine("founded", details.foundedYear),
        ...detailLine("origin", details.originCountry),
        ...detailLine("tier", details.priceTier),
        ...(details.brandDescription ? ["", `  ${details.brandDescription}`] : []),
        "",
        "Coverage across catalogs",
        ...renderSnapshot(details),
        ...renderBrandCatalogs(details),
      ].join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

export const brandsShowCommand = {
  name: "brands show",
  notes: [
    "<brand> is a slug or a case-insensitive name. Exit 6 means the server",
    "answered 404 brand_not_found.",
    "",
    "Coverage counts the brand's products in every catalog, shaped like one",
    "`stores show` catalog. Pass a listed host to `stores show` for that store's",
    "coverage.",
  ],
  operations: ["getBrandDetails"] as const,
  run: runShow,
  summary: "Show one brand's details and coverage: facets, prices, catalogs",
  usage: "brands show <brand>",
} satisfies CommandSpec;

// ── brands products ─────────────────────────────────────────────────────────

async function runProducts(context: CommandContext): Promise<ExitCode> {
  const brand = brandArgument(context);
  const params = contractRequest<{ brand: string; limit: number; offset: number }>(
    "browseBrandProducts",
    BRAND_PRODUCTS_FIELDS,
    context.args,
    { brand },
  );

  const api = context.api();
  let page: BrandProductsPage;
  try {
    page = await call(api, `GET /brands/${encodeURIComponent(brand)}/products`, () =>
      api.client.browseBrandProducts(brand, {
        limit: params.limit,
        offset: params.offset,
      }),
    );
  } catch (error) {
    throw brandMissOrRethrow(error, brand, "GET /brands/{brand}/products");
  }
  // Rows without a usable product URL are dropped after the limit/offset
  // window, so a page can be short, or empty, with more to come.
  if (page.products.length === 0 && !page.hasMore) {
    throw noResult({
      answeredWith: "200 GET /brands/{brand}/products with an empty products[]",
      code: "no_matches",
      data: { brand: page.brandName, total: page.total, items: [] },
      message: `No ${page.brandName} products are available at offset ${String(page.offset)}.`,
      serverAnswered: true,
    });
  }
  const nextOffset = page.hasMore ? page.offset + page.limit : null;
  context.writer.emit({
    command: context.command,
    data: {
      brand: page.brandName,
      slug: page.brandSlug ?? null,
      total: page.total,
      count: page.products.length,
      offset: page.offset,
      nextOffset,
      items: page.products.map((item) => ({
        uuid: item.uuid,
        catalog: item.catalogKey ?? null,
        title: item.title ?? null,
        currentPrice: item.currentPrice ?? null,
        productUrl: item.productUrl,
      })),
    },
    exitCode: ExitCode.Success,
    human: () =>
      [
        `${String(page.products.length)} of ${String(page.total)} ${page.brandName} products`,
        ...page.products.map(
          (item) =>
            `  ${item.title ?? "(untitled)"} · ${
              item.currentPrice === null || item.currentPrice === undefined
                ? "—"
                : String(item.currentPrice)
            }\n    ${item.productUrl}`,
        ),
        nextOffset === null ? "" : `  next: --offset ${String(nextOffset)}`,
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

export const brandsProductsCommand = {
  flags: contractFlags("browseBrandProducts", BRAND_PRODUCTS_FIELDS),
  name: "brands products",
  notes: [
    "Products from the catalogs your key can access. Continue with --offset",
    "<nextOffset>; paging stops at offset 10000. A page can hold fewer than",
    "--limit products, or none, while more remain: follow nextOffset, not the count.",
  ],
  operations: ["browseBrandProducts"] as const,
  run: runProducts,
  summary: "Browse one brand's products",
  usage: "brands products <brand> [--limit <n>] [--offset <n>]",
} satisfies CommandSpec;

// ── brands categories ───────────────────────────────────────────────────────

async function runCategories(context: CommandContext): Promise<ExitCode> {
  const brand = brandArgument(context);
  const params = contractRequest<{ brand: string; limit: number; minLevel: number }>(
    "getBrandTopCategories",
    BRAND_CATEGORIES_FIELDS,
    context.args,
    { brand },
  );

  const api = context.api();
  let page: BrandTopCategoriesPage;
  try {
    page = await call(
      api,
      `GET /brands/${encodeURIComponent(brand)}/top-categories`,
      () =>
        api.client.getBrandTopCategories(brand, {
          minLevel: params.minLevel,
          limit: params.limit,
        }),
    );
  } catch (error) {
    throw brandMissOrRethrow(error, brand, "GET /brands/{brand}/top-categories");
  }
  if (page.topCategories.length === 0) {
    throw noResult({
      answeredWith: "200 GET /brands/{brand}/top-categories with an empty list",
      code: "no_matches",
      data: { brand: page.brandName, categories: [] },
      message: `No categories are counted for ${page.brandName}.`,
      serverAnswered: true,
    });
  }
  context.writer.emit({
    command: context.command,
    data: {
      brand: page.brandName,
      categories: page.topCategories.map((category) => ({
        name: category.categoryName,
        level: category.categoryLevel,
      })),
    },
    exitCode: ExitCode.Success,
    human: () =>
      [
        `Top categories for ${page.brandName}`,
        ...page.topCategories.map(
          (category) =>
            `  ${category.categoryName} (level ${String(category.categoryLevel)})`,
        ),
      ].join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

export const brandsCategoriesCommand = {
  flags: contractFlags("getBrandTopCategories", BRAND_CATEGORIES_FIELDS),
  name: "brands categories",
  notes: [
    "Categories ranked by how many of the brand's products they hold.",
    "--min-level skips shallower taxonomy levels, e.g. 2 for Dresses over Clothing.",
  ],
  operations: ["getBrandTopCategories"] as const,
  run: runCategories,
  summary: "Show a brand's top categories by product count",
  usage: "brands categories <brand> [--min-level <n>] [--limit <n>]",
} satisfies CommandSpec;
