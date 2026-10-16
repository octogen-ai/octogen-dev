/**
 * `storerouter search <query>` — text search across the indexed corpus.
 *
 * The request field is **`q`**, not `query`; the response returns `items` plus
 * `nextCursor`, and each item carries `productUrl`. Bodies are
 * `extra="forbid"`, so those names are not negotiable — they are pinned against
 * the generated type by `SEARCH_FIELDS` in `fields.ts`, which also records why
 * each field the CLI does *not* expose is not exposed.
 */

import type {
  Facet,
  MerchantProductListPage,
  SearchProductsParams,
} from "@octogen-ai/sdk";

import { contractFlags, contractRequest } from "../contract.js";
import { SEARCH_FIELDS } from "../fields.js";

import { call } from "../client.js";
import type { CommandContext } from "../context.js";
import { ExitCode, noResult, usageError } from "../exit.js";
import type { CommandSpec } from "../registry.js";

/**
 * Parse `--facet name=a,b` into the API's `{name, values}`.
 *
 * Repeating the flag with the same name merges values rather than replacing
 * them, because `--facet color=red --facet color=blue` obviously means both.
 */
export function parseFacets(entries: readonly string[], flag: string): Facet[] {
  const byName = new Map<string, string[]>();
  for (const entry of entries) {
    const equals = entry.indexOf("=");
    if (equals <= 0 || equals === entry.length - 1) {
      throw usageError(
        `${flag} must be name=value (got ${entry}). Comma-separate several ` +
          `values: ${flag} color=red,blue`,
        "invalid_option_value",
      );
    }
    const name = entry.slice(0, equals).trim();
    const values = entry
      .slice(equals + 1)
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (name.length === 0 || values.length === 0) {
      throw usageError(
        `${flag} must be name=value (got ${entry})`,
        "invalid_option_value",
      );
    }
    const existing = byName.get(name);
    if (existing === undefined) {
      byName.set(name, values);
    } else {
      existing.push(...values);
    }
  }
  return [...byName].map(([name, values]) => ({ name, values }));
}

async function runSearch(context: CommandContext): Promise<ExitCode> {
  const { args, writer } = context;
  const query = context.positionals.join(" ").trim();
  if (query.length === 0) {
    throw usageError(
      "storerouter search <query> requires a query. Quote it if it has spaces.",
      "missing_argument",
    );
  }

  const catalog = args.string("catalog");
  const facets = parseFacets(args.strings("facet"), "--facet");
  const params = contractRequest<SearchProductsParams>(
    "searchProducts",
    SEARCH_FIELDS,
    args,
    {
      q: query,
      ...(facets.length === 0 ? {} : { facets }),
    },
  );
  const priceMin = params.priceMin;
  const priceMax = params.priceMax;
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
    throw usageError(
      `--price-min ${String(priceMin)} is above --price-max ${String(priceMax)}.`,
      "conflicting_options",
    );
  }

  const api = context.api();

  const page: MerchantProductListPage = await call(api, "POST /products/search", () =>
    api.client.searchProducts(params),
  );

  if (page.items.length === 0) {
    // The server searched and matched nothing: exit `6`. Not a throttle, not a
    // coverage statement — the corpus was consulted.
    throw noResult({
      answeredWith: "200 POST /products/search with an empty items[]",
      code: "no_matches",
      data: { items: [], nextCursor: null, query },
      message: `No products matched ${JSON.stringify(query)}${
        catalog === undefined ? "" : ` in catalog ${catalog}`
      }.`,
      serverAnswered: true,
    });
  }

  writer.emit({
    command: context.command,
    data: {
      query,
      catalog: catalog ?? null,
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
        `${String(page.items.length)} results for ${JSON.stringify(query)}`,
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

export const searchCommand = {
  flags: contractFlags("searchProducts", SEARCH_FIELDS),
  name: "search",
  notes: [
    "Exit 6 means the corpus was searched and nothing matched — the answer was",
    "empty, not refused.",
    "",
    "The full search query object is deliberately not flagged; use",
    "`storerouter api POST /products/search` for it. Keyless-eligible.",
  ],
  operations: ["searchProducts"] as const,
  run: runSearch,
  summary: "Search products by text",
  usage:
    "search <query> [--catalog <key>] [--facet k=v]… [--price-min <n>] [--price-max <n>] [--limit <n>] [--cursor <c>]",
} satisfies CommandSpec;
