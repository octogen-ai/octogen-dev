/**
 * `octogen lookup <url>` — resolve one product URL.
 *
 * The request field is **`url`**, not `productUrl`: bodies are
 * `extra="forbid"`, so a guess is a hard `422`. Which field maps to which flag
 * is pinned by `LOOKUP_FIELDS` in `fields.ts`, against the generated type.
 */

import type {
  LookupProductOptions,
  ProductLookupCachePolicy,
  ProductLookupMatchMode,
  ProductLookupResolutionMode,
  MerchantProductUrlLookupResponse,
} from "@octogen-ai/sdk";

import { call } from "../client.js";
import type { CommandContext } from "../context.js";
import { ExitCode, noResult, usageError } from "../exit.js";
import { CACHE_POLICIES, MATCH_MODES, RESOLUTION_MODES } from "../fields.js";
import type { CommandSpec } from "../registry.js";

async function runLookup(context: CommandContext): Promise<ExitCode> {
  const { args, writer } = context;
  const url = context.positionals[0];
  if (url === undefined || url.length === 0) {
    throw usageError(
      "octogen lookup <url> requires a product URL.",
      "missing_argument",
    );
  }
  if (context.positionals.length > 1) {
    throw usageError(
      "octogen lookup takes one URL. For several, run it once per URL — each " +
        "is a separate request against your rate limit.",
      "too_many_arguments",
    );
  }

  const options: LookupProductOptions = {};
  const matchMode = args.string("match-mode");
  if (matchMode !== undefined) {
    options.matchMode = matchMode as ProductLookupMatchMode;
  }
  const resolutionMode = args.string("resolution-mode");
  if (resolutionMode !== undefined) {
    options.resolutionMode = resolutionMode as ProductLookupResolutionMode;
  }
  const cachePolicy = args.string("on-demand-cache-policy");
  if (cachePolicy !== undefined) {
    options.onDemandCachePolicy = cachePolicy as ProductLookupCachePolicy;
  }
  // The SDK rejects this pair too, but as a `TypeError` that would surface as an
  // unexpected failure. Caught here it is what it is: a usage error.
  if (options.resolutionMode === "index_only" && cachePolicy === "refresh") {
    throw usageError(
      "--on-demand-cache-policy does not apply to --resolution-mode index_only.",
      "conflicting_options",
    );
  }

  const api = context.api();

  let response: MerchantProductUrlLookupResponse;
  try {
    response = await call(
      api,
      "POST /products/lookup",
      () => api.client.lookupProduct(url, options),
      { coverageAdjacent: true },
    );
  } catch (error) {
    // A `404 product_not_found` is the server telling us it looked and found
    // nothing — a miss, exit `6`. Everything else keeps whatever the taxonomy
    // decided, which is never `6`.
    throw asMissOrRethrow(error, url);
  }

  const product = response.product;
  writer.emit({
    command: context.command,
    data: {
      source: response.source,
      catalog: response.catalogKey ?? null,
      matchedVia: response.matchedVia ?? null,
      requestedUrl: response.requestedUrl ?? url,
      canonicalUrl: response.canonicalUrl ?? null,
      product: {
        uuid: product.uuid,
        title: product.title ?? null,
        brand: product.brand?.name ?? null,
        currentPrice: product.currentPrice ?? null,
        currency: product.currency ?? null,
        inStock: product.inStock ?? null,
        imageCount: product.images?.length ?? 0,
        variantCount: product.variants?.length ?? 0,
      },
      full: product,
      warnings: response.warnings ?? [],
    },
    exitCode: ExitCode.Success,
    human: () =>
      [
        product.title ?? "(untitled)",
        `  brand      ${product.brand?.name ?? "—"}`,
        `  price      ${formatPrice(product.currentPrice, product.currency)}`,
        `  catalog    ${response.catalogKey ?? "—"} (${response.source}${
          response.matchedVia === undefined || response.matchedVia === null
            ? ""
            : `, ${response.matchedVia}`
        })`,
        `  images     ${String(product.images?.length ?? 0)}`,
        `  variants   ${String(product.variants?.length ?? 0)}`,
        `  uuid       ${product.uuid ?? "—"}`,
      ].join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

/**
 * A miss versus everything else.
 *
 * The distinction is `product_not_found` on a `404`, which is the server saying
 * it consulted the catalogs. A `404` with any other body is left to the
 * taxonomy — an unrecognized shape must not borrow the meaning of exit `6`.
 */
function asMissOrRethrow(error: unknown, url: string): unknown {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  const status: unknown = (error as { status?: unknown }).status;
  const code: unknown = (error as { code?: unknown }).code;
  if (status === 404 && code === "product_not_found") {
    return noResult({
      answeredWith: "404 product_not_found from POST /products/lookup",
      code: "product_not_found",
      // Not a coverage answer: the host may well be covered and this one URL
      // not indexed. `octogen domains --check` is the coverage question.
      coverage: "unknown",
      data: { url },
      message: `No product found for ${url}.`,
      remediation: { command: `octogen domains --check ${url}` },
      serverAnswered: true,
    });
  }
  return error;
}

function formatPrice(
  price: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (price === null || price === undefined) {
    return "—";
  }
  return `${String(price)}${currency === null || currency === undefined ? "" : ` ${currency}`}`;
}

export const lookupCommand = {
  flags: {
    "match-mode": {
      choices: MATCH_MODES,
      describe:
        "Index match strictness. loose (server default) also resolves path-case, query-param, and Shopify collection aliases.",
      kind: "string",
      placeholder: MATCH_MODES.join("|"),
    },
    "on-demand-cache-policy": {
      choices: CACHE_POLICIES,
      describe: "Cache behavior when the request enters the on-demand path.",
      kind: "string",
      placeholder: CACHE_POLICIES.join("|"),
    },
    "resolution-mode": {
      choices: RESOLUTION_MODES,
      describe:
        "auto checks the index then resolves on demand; index_only never fetches; on_demand_only skips the index.",
      kind: "string",
      placeholder: RESOLUTION_MODES.join("|"),
    },
  },
  name: "lookup",
  notes: [
    "Exit 6 means the server looked and found nothing for this URL — which is",
    "not the same as the merchant being uncovered. Ask the coverage question",
    "with `octogen domains --check <url>`.",
    "",
    "Keyless-eligible, except --resolution-mode on_demand_only, which makes",
    "Octogen fetch the page and needs a key.",
  ],
  operations: ["lookupProduct"] as const,
  run: runLookup,
  summary: "Resolve one product URL to a product",
  usage:
    "lookup <url> [--match-mode …] [--resolution-mode …] [--on-demand-cache-policy …]",
} satisfies CommandSpec;
