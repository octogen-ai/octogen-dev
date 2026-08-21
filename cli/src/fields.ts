/**
 * Request flags, derived from the generated request types.
 *
 * The problem this solves: `/v1` bodies are `extra="forbid"`, so a guessed
 * field name is a hard `422` — but the more expensive direction is the quiet
 * one. A field the API *gains* is a capability the CLI silently does not
 * expose, and nothing anywhere goes red.
 *
 * So every request body reachable from a command has a **field map keyed by the
 * generated type**: `satisfies FieldMap<T>` demands one entry per property of
 * `T` and rejects an entry for a property `T` does not have. A published field
 * therefore fails the CLI's typecheck the moment `npm run codegen` lands it,
 * and the fix is one line — a flag, or `unsupported()` with a reason.
 *
 * Enum *values* are derived the same way, by an `Exact<>` assertion against the
 * generated union rather than a hand-copied list, so a new `matchMode` cannot
 * be accepted by the type and rejected by the parser (or vice versa).
 *
 * What stays hand-written, on purpose: which flag a field maps to, its
 * spelling, whether it is positional, the human help text, and the validation
 * that turns a bad value into exit `2` instead of a `422`. None of that is in
 * the spec, and generating it would produce
 * `lookupProductProductsLookupPost(body)` — the thing the SDK exists not to be.
 */

import type { components } from "@octogen-ai/sdk";

/** How one request field reaches the CLI's surface. */
export interface FieldBinding {
  /** The flag or positional that carries it, e.g. `"--match-mode"`. */
  flag: string;
  /** Why the CLI does not expose it. Mutually exclusive with a flag. */
  unsupported?: string;
}

/** One entry per property of `T`. Missing or extra keys are type errors. */
export type FieldMap<T> = Record<keyof T, FieldBinding>;

function unsupported(reason: string): FieldBinding {
  return { flag: "(not exposed)", unsupported: reason };
}

/** `A` and `B` are the same type — used to pin a runtime list to a union. */
export type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Compile-time assertion helper: `Assert<Exact<X, Y>>`. */
export type Assert<T extends true> = T;

type LookupRequest = components["schemas"]["ProgrammaticProductLookupRequest"];
type SearchRequest = components["schemas"]["ProgrammaticProductSearchRequest"];
type MoreLikeThisRequest = components["schemas"]["ProgrammaticMoreLikeThisRequest"];
type ResolveRequest = components["schemas"]["ProgrammaticResolveFromHtmlRequest"];
type RefreshRequest = components["schemas"]["ProgrammaticProductRefreshRequest"];
type RefreshTarget = components["schemas"]["ProgrammaticProductRefreshTarget"];
type VoyageStartRequest = components["schemas"]["VoyageStartRequest"];

// ── POST /products/lookup ──────────────────────────────────────────────────

export const LOOKUP_FIELDS = {
  matchMode: { flag: "--match-mode" },
  onDemandCachePolicy: { flag: "--on-demand-cache-policy" },
  resolutionMode: { flag: "--resolution-mode" },
  url: { flag: "<url> (positional)" },
} satisfies FieldMap<LookupRequest>;

export const MATCH_MODES = ["strict", "loose"] as const;
export const RESOLUTION_MODES = ["auto", "index_only", "on_demand_only"] as const;
export const CACHE_POLICIES = ["prefer_cache", "refresh"] as const;

// Each of these fails to compile if the contract's enum gains, loses, or
// renames a member — which is the only way a `--match-mode` the server accepts
// and the CLI rejects (or the reverse) can be caught before a user finds it.
export type _MatchModesExact = Assert<
  Exact<(typeof MATCH_MODES)[number], NonNullable<LookupRequest["matchMode"]>>
>;
export type _ResolutionModesExact = Assert<
  Exact<(typeof RESOLUTION_MODES)[number], NonNullable<LookupRequest["resolutionMode"]>>
>;
export type _CachePoliciesExact = Assert<
  Exact<
    (typeof CACHE_POLICIES)[number],
    NonNullable<LookupRequest["onDemandCachePolicy"]>
  >
>;

// ── POST /products/search ──────────────────────────────────────────────────

export const SEARCH_FIELDS = {
  catalog: { flag: "--catalog" },
  catalogs: unsupported(
    "Multi-catalog allowlist. Not on the SDK's SearchProductsParams; `--catalog` " +
      "covers the single-catalog case an agent actually asks for.",
  ),
  cursor: { flag: "--cursor" },
  debug: unsupported(
    "Returns the effective query for query-understanding analysis. A debugging " +
      "surface, not a session one; reach it with `octogen api`.",
  ),
  diversity: unsupported(
    "Result diversification. Changes ranking, so exposing it as a flag would " +
      "make two runs of the same command incomparable by default.",
  ),
  embeddingDims: unsupported("Retrieval tuning; not a session concern."),
  facets: { flag: "--facet k=v (repeatable)" },
  limit: { flag: "--limit" },
  price_max: { flag: "--price-max" },
  price_min: { flag: "--price-min" },
  q: { flag: "<query> (positional)" },
  quantizeEmbedding: unsupported("Retrieval tuning; not a session concern."),
  text_search_query: unsupported(
    "The full 18-field search query object. `octogen api POST /products/search` " +
      "is the right shape for it — a flag per field would be a second API.",
  ),
} satisfies FieldMap<SearchRequest>;

// ── POST /products/more-like-this ──────────────────────────────────────────

export const SIMILAR_FIELDS = {
  catalogs: { flag: "--catalog (repeatable)" },
  cursor: { flag: "--cursor" },
  debug: unsupported("Effective-query debugging; reach it with `octogen api`."),
  exclude_facets: { flag: "--exclude-facet k=v (repeatable)" },
  include_facets: { flag: "--facet k=v (repeatable)" },
  limit: { flag: "--limit" },
  omit_generated_facets: unsupported(
    "Corrects a server-generated facet visible only in `effectiveQuery`, which " +
      "this command does not request.",
  ),
  price_preference: { flag: "--price-preference" },
  ranking_embedding_columns: unsupported("Retrieval tuning; not a session concern."),
  retrieval_embedding_columns: unsupported("Retrieval tuning; not a session concern."),
  source: { flag: "<url|uuid> (positional)" },
} satisfies FieldMap<MoreLikeThisRequest>;

export const PRICE_PREFERENCES = ["lower", "any", "higher"] as const;

export type _PricePreferencesExact = Assert<
  Exact<
    (typeof PRICE_PREFERENCES)[number],
    NonNullable<MoreLikeThisRequest["price_preference"]>
  >
>;

// ── POST /products/resolve-from-html ───────────────────────────────────────

export const RESOLVE_FIELDS = {
  html: { flag: "--html <file|->" },
  url: { flag: "--url" },
} satisfies FieldMap<ResolveRequest>;

// ── POST /products/refresh ─────────────────────────────────────────────────

export const REFRESH_FIELDS = {
  targets: { flag: "<url...> (positional)" },
} satisfies FieldMap<RefreshRequest>;

export const REFRESH_TARGET_FIELDS = {
  catalog: { flag: "--catalog" },
  url: { flag: "<url...> (positional)" },
  uuid: { flag: "--uuid (repeatable)" },
} satisfies FieldMap<RefreshTarget>;

// ── POST /voyage ───────────────────────────────────────────────────────────

export const VOYAGE_START_FIELDS = {
  domain: { flag: "<url|domain> (positional)" },
} satisfies FieldMap<VoyageStartRequest>;

/**
 * Every field map, for the test that asserts each entry is either a flag or an
 * `unsupported` with a non-trivial reason.
 */
export const FIELD_MAPS: Readonly<
  Record<string, Readonly<Record<string, FieldBinding>>>
> = Object.freeze({
  lookupProduct: LOOKUP_FIELDS,
  moreLikeThisProducts: SIMILAR_FIELDS,
  refreshProducts: REFRESH_FIELDS,
  refreshTarget: REFRESH_TARGET_FIELDS,
  resolveProductFromHtml: RESOLVE_FIELDS,
  searchProducts: SEARCH_FIELDS,
  startVoyage: VOYAGE_START_FIELDS,
});
