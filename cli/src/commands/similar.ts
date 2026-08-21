/**
 * `octogen similar <url|uuid>` — more like this.
 *
 * The source is a URL or a UUID and exactly one of them: the API takes
 * `{source: {url}}` or `{source: {uuid}}` and rejects both. Which one you meant
 * is decided by shape here rather than by a flag, because an agent holding an
 * identifier out of a previous `search` should not have to say which kind it is.
 */

import type {
  MoreLikeThisProductsParams,
  MoreLikeThisProductsResponse,
  PricePreference,
} from "@octogen-ai/sdk";

import { call } from "../client.js";
import type { CommandContext } from "../context.js";
import { ExitCode, noResult, usageError } from "../exit.js";
import { PRICE_PREFERENCES } from "../fields.js";
import type { CommandSpec } from "../registry.js";
import { parseFacets } from "./search.js";

/** A canonical UUID, which is the only thing that is not a URL. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sourceFor(value: string): { url: string } | { uuid: string } {
  const trimmed = value.trim();
  if (UUID.test(trimmed)) {
    return { uuid: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed };
  }
  throw usageError(
    `octogen similar takes a product URL or a UUID; ${trimmed} is neither.`,
    "invalid_argument",
  );
}

async function runSimilar(context: CommandContext): Promise<ExitCode> {
  const { args, writer } = context;
  const target = context.positionals[0];
  if (target === undefined || target.length === 0) {
    throw usageError(
      "octogen similar <url|uuid> requires a source product.",
      "missing_argument",
    );
  }

  const params: MoreLikeThisProductsParams = { source: sourceFor(target) };
  const catalogs = args.strings("catalog");
  // The SDK still takes a single `catalog`; the contract's field is the
  // `catalogs` allowlist. One value is the case an agent has, so pass the
  // first and say so rather than silently dropping the rest.
  const catalog = catalogs[0];
  if (catalog !== undefined) {
    params.catalog = catalog;
  }
  if (catalogs.length > 1) {
    writer.problem({
      code: "single_catalog_only",
      message: `--catalog is single-valued here; using ${catalog ?? ""} and ignoring ${String(
        catalogs.length - 1,
      )} more.`,
      severity: "warning",
    });
  }
  const cursor = args.string("cursor");
  if (cursor !== undefined) {
    params.cursor = cursor;
  }
  const limit = args.integer("limit", { max: 100, min: 1 });
  if (limit !== undefined) {
    params.limit = limit;
  }
  const include = parseFacets(args.strings("facet"), "--facet");
  if (include.length > 0) {
    params.includeFacets = include;
  }
  const exclude = parseFacets(args.strings("exclude-facet"), "--exclude-facet");
  if (exclude.length > 0) {
    params.excludeFacets = exclude;
  }
  const preference = args.string("price-preference");
  if (preference !== undefined) {
    params.pricePreference = preference as PricePreference;
  }

  const api = context.api();
  let response: MoreLikeThisProductsResponse;
  try {
    response = await call(api, "POST /products/more-like-this", () =>
      api.client.moreLikeThisProducts(params),
    );
  } catch (error) {
    throw sourceMissOrRethrow(error, target);
  }

  if (response.items.length === 0) {
    throw noResult({
      answeredWith: "200 POST /products/more-like-this with an empty items[]",
      code: "no_matches",
      data: { items: [], nextCursor: null, source: response.source },
      message: `Nothing similar to ${target} was found.`,
      serverAnswered: true,
    });
  }

  writer.emit({
    command: context.command,
    data: {
      source: {
        uuid: response.source.uuid,
        catalog: response.source.catalogKey,
        productUrl: response.source.productUrl,
        title: response.source.title ?? null,
      },
      count: response.items.length,
      nextCursor: response.nextCursor ?? null,
      items: response.items.map((item) => ({
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
        `${String(response.items.length)} similar to ${
          response.source.title ?? response.source.productUrl
        }`,
        ...response.items.map(
          (item) =>
            `  ${item.brand?.name ?? "—"} · ${item.title ?? "(untitled)"}\n    ${item.productUrl}`,
        ),
      ].join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

/** A source the server could not resolve is a miss, not an error. */
function sourceMissOrRethrow(error: unknown, target: string): unknown {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  const status: unknown = (error as { status?: unknown }).status;
  const code: unknown = (error as { code?: unknown }).code;
  if (status === 404 && code === "product_not_found") {
    return noResult({
      answeredWith: "404 product_not_found from POST /products/more-like-this",
      code: "source_not_found",
      data: { source: target },
      message: `${target} is not an indexed product, so there is nothing to compare it to.`,
      remediation: { command: `octogen lookup ${target}` },
      serverAnswered: true,
    });
  }
  return error;
}

export const similarCommand = {
  flags: {
    catalog: {
      describe: "Restrict results to this catalog key.",
      kind: "string",
      multiple: true,
      placeholder: "key",
    },
    cursor: {
      describe: "Opaque pagination cursor.",
      kind: "string",
      placeholder: "cursor",
    },
    "exclude-facet": {
      describe: "Exclude matches with this facet value (repeatable).",
      kind: "string",
      multiple: true,
      placeholder: "k=v",
    },
    facet: {
      describe: "Additional include facet (repeatable).",
      kind: "string",
      multiple: true,
      placeholder: "k=v",
    },
    limit: { describe: "Results per page, 1–100.", kind: "number", placeholder: "n" },
    "price-preference": {
      choices: PRICE_PREFERENCES,
      describe: "Bias results cheaper, similar, or dearer than the source.",
      kind: "string",
      placeholder: PRICE_PREFERENCES.join("|"),
    },
  },
  name: "similar",
  notes: [
    "The source must be an indexed product: more-like-this does not resolve on",
    "demand. Exit 6 covers both 'the source is not indexed' and 'nothing was",
    "similar enough'; the `code` field separates them.",
    "",
    "Requires an API key.",
  ],
  operations: ["moreLikeThisProducts"] as const,
  run: runSimilar,
  summary: "Find products similar to one you already have",
  usage: "similar <url|uuid> [--catalog <key>] [--facet k=v]… [--limit <n>]",
} satisfies CommandSpec;
