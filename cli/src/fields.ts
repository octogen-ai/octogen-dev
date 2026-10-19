/** Declarative CLI presentation and SDK argument names. API shape lives in generated/contract.ts. */
import type { components } from "@octogen-ai/sdk";

import { CONTRACT, scalar, type Binding } from "./contract.js";
export type FieldBinding = Binding;

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

// ── POST /products/lookup ──────────────────────────────────────────────────

export const LOOKUP_FIELDS = {
  format: unsupported(
    "The typed SDK and lookup command return JSON. Use `storerouter api` for Markdown responses.",
  ),
  matchMode: { flag: "--match-mode" },
  onDemandCachePolicy: { flag: "--on-demand-cache-policy" },
  resolutionMode: { flag: "--resolution-mode" },
  url: { flag: "<url> (positional)" },
} satisfies FieldMap<LookupRequest>;

function choices(operation: string, field: string): readonly string[] {
  return (
    scalar(CONTRACT.operations[operation]?.body.properties?.[field] ?? {}).enum ?? []
  ).map(String);
}
export const MATCH_MODES = choices("lookupProduct", "matchMode");
export const RESOLUTION_MODES = choices("lookupProduct", "resolutionMode");
export const CACHE_POLICIES = choices("lookupProduct", "onDemandCachePolicy");

// ── POST /products/search ──────────────────────────────────────────────────

export const SEARCH_FIELDS = {
  brand_quality_max: unsupported(
    "Brand-quality bounds are a ranking-policy knob; reach them with `storerouter api`.",
  ),
  brand_quality_min: unsupported(
    "Brand-quality bounds are a ranking-policy knob; reach them with `storerouter api`.",
  ),
  catalogs: { flag: "--catalog", codec: "singleton" },
  cursor: { flag: "--cursor" },
  debug: unsupported(
    "Reserved for diagnostic detail; the effective query arrives without it. " +
      "Reach it with `storerouter api`.",
  ),
  diversity: unsupported(
    "Opt-in retailer spreading changes page 1's results. Use `storerouter api` " +
      "when you need it.",
  ),
  exclude_facets: unsupported(
    "Not yet a flag on `search`; send it with `storerouter api POST /products/search`.",
  ),
  facets: { flag: "--facet", codec: "facets", multiple: true, placeholder: "k=v" },
  fallback_category: unsupported(
    "Constrains vague queries to a category when understanding finds none. Use " +
      "`storerouter api` when you need it.",
  ),
  limit: { flag: "--limit" },
  omit_generated_facets: unsupported(
    "Corrects an understood facet visible only in `effectiveQuery`, which this " +
      "command does not show.",
  ),
  price_max: { flag: "--price-max", sdkName: "priceMax" },
  price_min: { flag: "--price-min", sdkName: "priceMin" },
  q: { flag: "<query> (positional)" },
  relax: unsupported(
    "Opt-in query relaxation changes matching. Use `storerouter api` when you need it.",
  ),
  similar_to_brands: unsupported(
    "Ranks by brand aesthetic rather than filtering; reach it with `storerouter api`.",
  ),
  understand: unsupported(
    "Literal matching changes what the positional query means; reach it with " +
      "`storerouter api`.",
  ),
} satisfies FieldMap<SearchRequest>;

// ── POST /products/more-like-this ──────────────────────────────────────────

export const SIMILAR_FIELDS = {
  brand_quality_max: unsupported(
    "Brand-quality bounds are a ranking-policy knob; reach them with `storerouter api`.",
  ),
  brand_quality_min: unsupported(
    "Brand-quality bounds are a ranking-policy knob; reach them with `storerouter api`.",
  ),
  catalogs: { flag: "--catalog", multiple: true },
  cursor: { flag: "--cursor" },
  debug: unsupported("Effective-query debugging; reach it with `storerouter api`."),
  exclude_facets: {
    flag: "--exclude-facet",
    sdkName: "excludeFacets",
    codec: "facets",
    multiple: true,
    placeholder: "k=v",
  },
  facets: { flag: "--facet", codec: "facets", multiple: true, placeholder: "k=v" },
  limit: { flag: "--limit" },
  omit_generated_facets: unsupported(
    "Corrects a server-generated facet visible only in `effectiveQuery`, which " +
      "this command does not request.",
  ),
  price_max: { flag: "--price-max", sdkName: "priceMax" },
  price_min: { flag: "--price-min", sdkName: "priceMin" },
  price_preference: { flag: "--price-preference", sdkName: "pricePreference" },
  ranking_embedding_columns: unsupported("Retrieval tuning; not a session concern."),
  relax: { flag: "--relax", negatable: true },
  retrieval_embedding_columns: unsupported("Retrieval tuning; not a session concern."),
  source: { flag: "<url|uuid> (positional)", codec: "custom" },
  sources: unsupported(
    "Several source products at once; reach them with `storerouter api`.",
  ),
} satisfies FieldMap<MoreLikeThisRequest>;

export const PRICE_PREFERENCES = choices("moreLikeThisProducts", "price_preference");

// ── POST /products/resolve-from-html ───────────────────────────────────────

export const RESOLVE_FIELDS = {
  html: { flag: "--html", codec: "custom", placeholder: "file|-" },
  url: { flag: "--url" },
} satisfies FieldMap<ResolveRequest>;

/**
 * Every field map, including operations with no request fields.
 */
export const FIELD_MAPS: Readonly<
  Record<string, Readonly<Record<string, FieldBinding>>>
> = Object.freeze({
  lookupProduct: LOOKUP_FIELDS,
  moreLikeThisProducts: SIMILAR_FIELDS,
  resolveProductFromHtml: RESOLVE_FIELDS,
  searchProducts: SEARCH_FIELDS,
  getMe: {},
});
