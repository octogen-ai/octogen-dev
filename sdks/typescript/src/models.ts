import type { RequestOptions } from "./request-context.js";
import type { components } from "./generated/types.js";

export const AgeGroup = {
  INFANT: "infant",
  TODDLER: "toddler",
  KIDS: "kids",
  ADULT: "adult",
} as const;

export type AgeGroup = (typeof AgeGroup)[keyof typeof AgeGroup];

export const Gender = {
  MALE: "male",
  FEMALE: "female",
  UNISEX: "unisex",
} as const;

export type Gender = (typeof Gender)[keyof typeof Gender];

export const ColorFamily = {
  PINK: "Pink",
  RED: "Red",
  ORANGE: "Orange",
  BROWN: "Brown",
  YELLOW: "Yellow",
  GREEN: "Green",
  BLUE: "Blue",
  PURPLE: "Purple",
  WHITE: "White",
  GRAY: "Gray",
  BLACK: "Black",
} as const;

export type ColorFamily = (typeof ColorFamily)[keyof typeof ColorFamily];

export const EmbeddingColumn = {
  EMBEDDING: "embedding",
  STYLE_EMBEDDING: "style_embedding",
  TAGS_EMBEDDING: "tags_embedding",
  ATTRIBUTES_EMBEDDING: "attributes_embedding",
} as const;

export type EmbeddingColumn = (typeof EmbeddingColumn)[keyof typeof EmbeddingColumn];

export const PricePreference = {
  LOWER: "lower",
  ANY: "any",
  HIGHER: "higher",
} as const;

export type PricePreference = (typeof PricePreference)[keyof typeof PricePreference];

export const ProductLookupResolutionMode = {
  AUTO: "auto",
  INDEX_ONLY: "index_only",
  ON_DEMAND_ONLY: "on_demand_only",
} as const;

export type ProductLookupResolutionMode =
  (typeof ProductLookupResolutionMode)[keyof typeof ProductLookupResolutionMode];

export const ProductLookupCachePolicy = {
  PREFER_CACHE: "prefer_cache",
  REFRESH: "refresh",
} as const;

export type ProductLookupCachePolicy =
  (typeof ProductLookupCachePolicy)[keyof typeof ProductLookupCachePolicy];

export const ProductLookupMatchMode = {
  STRICT: "strict",
  LOOSE: "loose",
} as const;

export type ProductLookupMatchMode =
  (typeof ProductLookupMatchMode)[keyof typeof ProductLookupMatchMode];

export interface LookupProductOptions extends RequestOptions {
  /**
   * Index match strictness. `loose` (the server default) also resolves URLs
   * that differ from the indexed product only by path case, a non-indexed
   * query parameter, or a Shopify collection-scoped path.
   */
  matchMode?: ProductLookupMatchMode;
  resolutionMode?: ProductLookupResolutionMode;
  onDemandCachePolicy?: ProductLookupCachePolicy;
}

export const FacetName = {
  BRAND_NAME: "brand_name",
  BRAND_SLUG: "brand_slug",
  RAW_BRAND_NAME: "raw_brand_name",
  PRODUCT_TYPE: "product_type",
  GENDER: "gender",
  AGE_GROUPS: "age_groups",
  COLOR: "color",
  COLOR_FAMILY: "color_family",
  IS_ACTIVEWEAR: "is_activewear",
  CATEGORY_PATH_DEPTH_0: "category_path.depth_0",
  CATEGORY_PATH_DEPTH_1: "category_path.depth_1",
  CATEGORY_PATH_DEPTH_2: "category_path.depth_2",
  CATEGORY_PATH_DEPTH_3: "category_path.depth_3",
  CATEGORY_PATH_DEPTH_4: "category_path.depth_4",
  CATEGORY_PATH_DEPTH_5: "category_path.depth_5",
  CATEGORY_PATH_DEPTH_6: "category_path.depth_6",
} as const;

export type FacetName = (typeof FacetName)[keyof typeof FacetName];

export type CustomString = string & Record<never, never>;

export interface Facet {
  name: FacetName | CustomString;
  values: string[];
}

export interface SearchProductsParams {
  /**
   * Free-text query. Omit to browse by filters alone. By default it is
   * understood: rewritten for retrieval, with category, gender, colour, brand,
   * price and attribute filters derived from it.
   */
  q?: string;
  /**
   * Run query understanding on `q` (the server default). Set `false` to match
   * `q` as written and filter only by the facets and bounds you send. Requires
   * `q`.
   */
  understand?: boolean;
  /**
   * Filters a product must match: every facet, and any value within a facet.
   * A facet you send replaces any understood facet of the same name. Each name
   * at most once.
   */
  facets?: Facet[];
  /**
   * Filters a product must not match: products with any listed value of any
   * listed facet are removed. Each name at most once.
   */
  excludeFacets?: Facet[];
  /**
   * Names of understood facets to drop before searching (use the names
   * `effectiveQuery` reports with `source: "generated"`). Requires understood
   * `q`; a name may not also appear in `facets`.
   */
  omitGeneratedFacets?: string[];
  /** Inclusive minimum price, `>= 0`. */
  priceMin?: number;
  /** Inclusive maximum price, `>= priceMin`. */
  priceMax?: number;
  /** Inclusive minimum brand quality score, 1 (very poor) to 6 (exceptional). */
  brandQualityMin?: number;
  /** Inclusive maximum brand quality score, 1 to 6. */
  brandQualityMax?: number;
  /**
   * 1–10 brand names whose style to favour. Ranks by similarity to their
   * aesthetic; it does not filter. Replaces any brands understood from `q`.
   */
  similarToBrands?: string[];
  /**
   * Category path, root first (1–4 names as the `category_path.depth_N` facets
   * accept them, e.g. `["apparel & accessories", "clothing"]`), searched when
   * understanding finds no category in `q`. Not applied when the understood
   * query has a top-level category or `facets` has a `category_path` facet;
   * reported in `effectiveQuery` as `generated`. Requires understood `q`.
   */
  fallbackCategory?: string[];
  /**
   * Restrict results to these catalog keys (1–500). Omit to search every
   * catalog your key can access. Keys are sent as given; one outside your
   * grants simply matches nothing.
   */
  catalogs?: readonly string[];
  /** Maximum results per page, 1–100 (default 50). */
  limit?: number;
  /** `nextCursor` from the previous page, with the same request otherwise. */
  cursor?: string;
  /**
   * When an understood `q` returns nothing, retry with understood filters
   * dropped in stages. Facets you send are never dropped. Requires understood
   * `q`; replay a relaxed page's cursor with `relax: true`.
   */
  relax?: boolean;
  /**
   * Spread page 1 across retailers and drop products whose image repeats one
   * already on the page. No effect with `catalogs`, a key limited to specific
   * catalogs, or a `brand_name` facet. A cursor continues only with the
   * setting it was minted under.
   */
  diversity?: boolean;
  /**
   * Reserved for diagnostic detail.
   * {@link ProgrammaticProductSearchPage.effectiveQuery} arrives without it.
   */
  debug?: boolean;
}

/** The `POST /v1/products/search` body, under its wire names. */
export interface ProgrammaticProductSearchRequest {
  q?: string;
  understand?: boolean;
  facets?: Facet[];
  exclude_facets?: Facet[];
  omit_generated_facets?: string[];
  price_min?: number;
  price_max?: number;
  brand_quality_min?: number;
  brand_quality_max?: number;
  similar_to_brands?: string[];
  fallback_category?: string[];
  catalogs?: string[];
  limit: number;
  cursor?: string;
  relax?: boolean;
  diversity?: boolean;
  debug?: boolean;
}

/** One facet that ran, and where it came from (`caller` or `generated`). */
export type ProgrammaticProductSearchEffectiveFacet =
  components["schemas"]["ProgrammaticProductSearchEffectiveFacet"];

/** What relaxation did on a `relax: true` request. */
export type ProgrammaticProductSearchRelaxation =
  components["schemas"]["ProgrammaticProductSearchRelaxation"];

/**
 * The search that actually ran, in the request's own vocabulary. A report, not
 * a request fragment: understood facets of one name can AND together, which a
 * request cannot express.
 */
export type ProgrammaticProductSearchEffectiveQuery =
  components["schemas"]["ProgrammaticProductSearchEffectiveQuery"];

/** One page of `searchProducts` results. */
export interface ProgrammaticProductSearchPage extends MerchantProductListPage {
  /** Server-generated UUID for this execution, matching `X-Request-ID`. */
  requestId: string;
  /**
   * The search that actually ran. Present on every response; servers that
   * predate it send it only with `debug: true`.
   */
  effectiveQuery?: ProgrammaticProductSearchEffectiveQuery | null;
}

export type ProgrammaticProductLookupRequest =
  components["schemas"]["ProgrammaticProductLookupRequest"];

/**
 * The lookup body as a *caller* sends it.
 *
 * Derived from the generated type rather than re-declared, so a field rename in
 * the contract still breaks this — but relaxed: `matchMode`, `resolutionMode`,
 * and `onDemandCachePolicy` are `required` in the generated shape because the
 * contract gives them defaults, and a caller must be able to omit them and let
 * the server decide.
 */
export type ProgrammaticProductLookupRequestBody = Partial<
  Omit<ProgrammaticProductLookupRequest, "url">
> & { url: string };

export interface MoreLikeThisSource {
  url?: string;
  uuid?: string;
}

export interface MoreLikeThisProductsParams {
  /** The product to find similar products for. Pass exactly one of `source` and `sources`. */
  source?: MoreLikeThisSource;
  /**
   * 1–20 distinct indexed product UUIDs to find products similar to as a set,
   * for example a collection. Results exclude every source; a facet is
   * generated only when every source has it, with the values of all of them;
   * and `pricePreference` compares with the sources' median price. One UUID
   * behaves exactly like `source: { uuid }`. The response then carries
   * `sources`, in request order, instead of `source`.
   */
  sources?: readonly string[];
  /**
   * Restrict results to these catalog keys (1–100). The source product itself
   * may live outside the list. Omit to draw results from every active catalog.
   */
  catalogs?: readonly string[];
  cursor?: string;
  limit?: number;
  /**
   * Filters a product must match, as on search. A facet you send replaces the
   * generated facet of the same name and is never relaxed. Sent as `facets`;
   * replaces the removed `includeFacets`, which the API refuses.
   */
  facets?: Facet[];
  /** Filters a product must not match, as on search. */
  excludeFacets?: Facet[];
  /**
   * Generated facets to drop by name, when you have no value of your own to
   * put in their place (a same-name `facets` entry replaces one instead).
   * Unknown names are ignored. Unlike search, needs no `q`.
   */
  omitGeneratedFacets?: readonly string[];
  /** Embedding columns that retrieve candidates (1 or more). Omit for the server's default. */
  retrievalEmbeddingColumns?: readonly EmbeddingColumn[];
  /** Embedding columns that rank candidates (1 or more). Omit for the base embedding. */
  rankingEmbeddingColumns?: readonly EmbeddingColumn[];
  /** Inclusive price bounds, as on search. Never relaxed. */
  priceMin?: number;
  priceMax?: number;
  /** Inclusive brand-quality bounds, 1 (very poor) to 6 (exceptional). */
  brandQualityMin?: number;
  brandQualityMax?: number;
  pricePreference?: PricePreference;
  /**
   * Retry a short page 1 with Platform's generated facets dropped, never the
   * facets or bounds you sent. Omitted unless set; the server defaults it to
   * `true` (search defaults to `false`, because there the generated facets
   * come from your `q`). For a `url` or `uuid` source, page 1 is short when it
   * has fewer than `min(5, limit)` results and no `nextCursor`; an image
   * source relaxes only an empty page. With `debug: true`, reported in
   * `effectiveQuery.relaxation`. A relaxed page's cursor is refused with
   * `relax: false`.
   */
  relax?: boolean;
  debug?: boolean;
}

export interface ProgrammaticMoreLikeThisRequest {
  source?: MoreLikeThisSource;
  sources?: string[];
  catalogs?: string[];
  cursor?: string;
  limit: number;
  facets?: Facet[];
  exclude_facets?: Facet[];
  omit_generated_facets?: string[];
  retrieval_embedding_columns?: EmbeddingColumn[];
  ranking_embedding_columns?: EmbeddingColumn[];
  price_min?: number;
  price_max?: number;
  brand_quality_min?: number;
  brand_quality_max?: number;
  price_preference: PricePreference;
  relax?: boolean;
  debug: boolean;
}

export interface MoreLikeThisSourceResponse {
  catalogKey: string;
  uuid: string;
  productUrl: string;
  title?: string | null;
}

/** Identity of an image source, which has no indexed product. */
export interface MoreLikeThisSourceImageResponse {
  /** Content hash of the submitted image bytes. */
  hash: string;
}

export interface MoreLikeThisEffectiveFacet {
  name: string;
  values: string[];
}

export interface MoreLikeThisEffectiveQuery {
  text: string;
  retrievalEmbeddingColumns?: string[] | null;
  rankingEmbeddingColumns?: string[] | null;
  facets?: MoreLikeThisEffectiveFacet[] | null;
  exclusionFacets?: MoreLikeThisEffectiveFacet[] | null;
  priceMin?: number | null;
  priceMax?: number | null;
  brandQualityMin?: number | null;
  brandQualityMax?: number | null;
  /** What relaxation did, in search's shape (`rounds` is 0 when page 1 needed none). Absent with `relax: false`. */
  relaxation?: ProgrammaticProductSearchRelaxation | null;
  limit: number;
}

export interface MoreLikeThisProductsResponse {
  /** The resolved `source`; absent when the request sent `sources`. */
  source?: MoreLikeThisSourceResponse | null;
  /** The resolved `sources`, in request order; present only when the request sent `sources`. */
  sources?: MoreLikeThisSourceResponse[] | null;
  /** The image source's identity; absent for product sources. */
  sourceImage?: MoreLikeThisSourceImageResponse | null;
  /**
   * How an image source was resolved (`"image_query_generation"` or
   * `"cached_image_query"`); absent for product sources.
   */
  resolution?: string | null;
  items: MerchantProductListItem[];
  nextCursor?: string | null;
  effectiveQuery?: MoreLikeThisEffectiveQuery | null;
  /** Server-generated id for this execution, matching `X-Request-ID`. */
  requestId?: string | null;
}

export interface AttributeValue {
  name: string;
  handle: string;
}

export interface Attribute {
  handle: string;
  name: string;
  values?: AttributeValue[];
}

export interface BrandView {
  name: string;
  slug?: string | null;
  url?: string | null;
  description?: string | null;
}

export interface ColorView {
  label: string;
  swatchUrl?: string | null;
  hexCode?: string | null;
}

export interface CategoryView {
  name: string;
  url?: string | null;
}

export interface RatingView {
  average?: number | null;
  count?: number | null;
}

export interface AudienceView {
  genders?: string[];
  ageGroups?: string[];
}

export interface BreadcrumbView {
  name: string;
  url?: string | null;
}

export interface PromotionView {
  description?: string | null;
  code?: string | null;
}

export interface ReviewView {
  author?: string | null;
  rating?: number | null;
  body?: string | null;
  publishedAt?: string | null;
}

export interface VideoView {
  url?: string | null;
  thumbnailUrl?: string | null;
  name?: string | null;
}

export interface ProductDetailsView {
  materials?: string[];
  fit?: string[];
  dimensions?: string | null;
  patterns?: string[];
}

export interface IdentifiersView {
  productId?: string | null;
  gtin?: string | null;
  productGroupId?: string | null;
}

export interface MerchantVariantView {
  sku?: string | null;
  productUrl?: string | null;
  color?: ColorView | null;
  size?: string | null;
  inStock?: boolean | null;
  imageUrl?: string | null;
}

export interface CanonicalBrandEnrichment {
  facet_origin_country?: string | null;
  facet_price_tier?: string | null;
  facet_target_audience?: string | null;
  facet_style_identity?: string[] | null;
  facet_sustainability?: string[] | null;
  facet_brand_ethics?: string[] | null;
  facet_brand_inclusivity?: string[] | null;
  facet_brand_cultural_anchors?: string[] | null;
  facet_key_people_names?: string[] | null;
  facet_key_people_nationalities?: string[] | null;
  facet_brand_hype_cycle_stage?: string[] | null;
  brand_quality_score?: number | null;
  domain?: string | null;
  founded_year?: number | null;
  directory_subheading?: string | null;
  brand_description?: string | null;
  brand_positioning?: string | null;
  occasion_fit?: string | null;
  brand_craft_production?: string | null;
  brand_accessibility_index?: string | null;
  brand_community_perception?: string | null;
  brand_popularity_level?: string | null;
  brand_popularity_trend_direction?: string | null;
  brand_quality_justification?: string | null;
}

export interface CanonicalBrand {
  brand_uuid: string;
  brand_name: string;
  brand_slug?: string | null;
  brand_synonyms?: string[] | null;
  brand_enrichment?: CanonicalBrandEnrichment | null;
}

export interface ProductEnrichment {
  type?: string | null;
  type_synonyms?: string[] | null;
  tags?: string[] | null;
  styles?: string[] | null;
  image_with_single_product?: boolean | null;
  gender?: Gender | CustomString | null;
  is_activewear?: boolean | null;
  age_groups?: (AgeGroup | CustomString)[] | null;
  color?: string[] | null;
  color_family?: (ColorFamily | CustomString)[] | null;
  category_path?: string[] | null;
  attributes?: Record<string, string[]> | null;
  attribute_handles?: Record<string, string[]> | null;
  structured_attributes?: Attribute[] | null;
  brand_id?: string | null;
  canonical_brand?: CanonicalBrand | null;
  summary?: string | null;
}

/**
 * One product image: source URL, Octogen-hosted copy, and display metadata.
 * `url` is the merchant source; `cdnUrl` is the hosted copy — prefer it and
 * fall back to `url`.
 */
export type MerchantProductImageMetadataView =
  components["schemas"]["MerchantProductImageMetadataView"];

export interface MerchantProductListItem {
  uuid: string;
  catalogKey?: string | null;
  productUrl: string;
  title?: string | null;
  brand?: BrandView | null;
  currentPrice?: number | null;
  originalPrice?: number | null;
  /**
   * Deprecated: primary image CDN URL, kept populated during migration. Read
   * {@link primaryImage} instead.
   */
  imageUrl?: string | null;
  /**
   * The product's display image with full metadata. Its `url` is the merchant
   * source URL; `cdnUrl` carries the hosted copy when one exists.
   */
  primaryImage?: MerchantProductImageMetadataView | null;
  images?: MerchantProductImageMetadataView[];
  rating?: RatingView | null;
  isActive?: boolean;
  rawScore?: number | null;
  displayMatchScore?: number | null;
  updatedAt?: string | null;
  // Card fields on search and more-like-this results; null or absent when the
  // product does not carry them or the server predates them.
  /** ISO 4217 currency of the prices; null when unknown or mixed. */
  currency?: string | null;
  /** Product-family availability, not a particular color's or size's stock. */
  inStock?: boolean | null;
  /** Product-family color labels; the linked variant may differ. */
  colors?: string[] | null;
  sizes?: string[] | null;
  /**
   * `"male"`, `"female"` or `"unisex"`; null when unknown or when several are
   * listed. Typed open so a new value is not a type error.
   */
  gender?: "male" | "female" | "unisex" | CustomString | null;
  /**
   * Taxonomy category path, root first, in the names the `category_path.depth_N`
   * facets accept.
   */
  categoryPath?: string[] | null;
  catalogDisplayName?: string | null;
}

export interface MerchantProductListPage {
  items: MerchantProductListItem[];
  nextCursor?: string | null;
}

export interface MerchantProductView extends Omit<
  MerchantProductListItem,
  | "uuid"
  | "isActive"
  | "colors"
  | "sizes"
  | "gender"
  | "categoryPath"
  | "catalogDisplayName"
> {
  uuid: string | null;
  isActive?: boolean | null;
  currency?: string | null;
  description?: string | null;
  inStock?: boolean | null;
  categories?: CategoryView[];
  sizes?: string[];
  colors?: ColorView[];
  tags?: string[];
  variants?: MerchantVariantView[];
  details?: ProductDetailsView;
  audience?: AudienceView | null;
  identifiers?: IdentifiersView;
  breadcrumbs?: BreadcrumbView[];
  promotions?: PromotionView[];
  reviews?: ReviewView[];
  videos?: VideoView[];
  enrichment?: ProductEnrichment | null;
}

export interface ProductResolutionMetadata {
  completeness: "complete" | "partial";
  method: "json_ld" | "open_graph" | "html_meta" | "resolved_url" | "catalog_extractor";
  rendered?: boolean | null;
  missingFields?: string[] | null;
}

export interface MerchantProductUrlLookupResponse {
  requestId?: string | null;
  source: "indexed" | "on_demand" | "client_html";
  catalogKey?: string | null;
  catalogDisplayName?: string | null;
  sourceBaseUrl?: string | null;
  product: MerchantProductView;
  requestedUrl?: string | null;
  resolvedUrl?: string | null;
  normalizedUrl?: string | null;
  canonicalUrl?: string | null;
  /**
   * Which probe of the lookup ladder resolved the product — `exact`,
   * `normalized_exact`, `normalized_alias`, `loose`, `structural_alias`, or
   * `learned_alias:<rule_id>`. Absent for on-demand results. Informational
   * only, and the server may extend the value set, so treat it as a string.
   */
  matchedVia?: string | null;
  resolution?: ProductResolutionMetadata | null;
  cacheStatus?: "hit" | "miss" | "refresh" | null;
  warnings?: string[] | null;
}

export interface ValidationErrorModel {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface HTTPValidationError {
  detail?: ValidationErrorModel[] | null;
}

// ── Coverage URL Lists (/v1/coverage/url-lists) ─────────────────────────────

export type CoverageUrlListStatus = "provisioning" | "active" | "delete_pending";

export interface CoverageUrlListBigQuery {
  exchangeId: string;
  listingId: string;
  sharedDatasetId: string;
  viewId: string;
  lastExportedAt?: string | null;
  lastRowCount?: number | null;
  readerCount: number;
}

export interface CoverageUrlList {
  urlListId: string;
  name: string;
  status: CoverageUrlListStatus;
  urlCount: number;
  bigQuery?: CoverageUrlListBigQuery | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageUrlListPage {
  items: CoverageUrlList[];
  nextCursor?: string | null;
}

export interface CoveragePaginationParams {
  cursor?: string;
  limit?: number;
}

export interface CoverageAcceptedUrl {
  url: string;
  normalizedUrl: string;
}

export interface CoverageRejectedUrl {
  url: string;
  code: string;
  message: string;
}

export interface CoverageUrlMutationResponse {
  accepted: CoverageAcceptedUrl[];
  rejected: CoverageRejectedUrl[];
  urlCount: number;
  requestId?: string | null;
}

export interface CoverageContainsResult {
  url: string;
  normalizedUrl: string;
  present: boolean;
  addedAt?: string | null;
}

export interface CoverageContainsResponse {
  results: CoverageContainsResult[];
}

export interface CoverageUrlListUrl {
  url: string;
  normalizedUrl: string;
  addedAt: string;
}

export interface CoverageUrlListUrlsPage {
  items: CoverageUrlListUrl[];
  nextCursor?: string | null;
}

// ── One store's coverage (/v1/stores/{domain}) ───────────────────────────────

/** Every catalog serving one store domain; `host` is the normalized domain asked about. */
export type StoreCoverageResponse = components["schemas"]["StoreCoverageResponse"];

/** One catalog's snapshot: product count, populated facets, price histogram. */
export type StoreCatalogCoverage = components["schemas"]["StoreCatalogCoverage"];

/** A public search facet populated for at least one of the catalog's products. */
export type DomainField = components["schemas"]["DomainField"];

/** One of a field's most common values; send `value` as that facet's value. */
export type DomainFieldValue = components["schemas"]["DomainFieldValue"];

/** Current-price histogram of a catalog's priced products. */
export type PriceDistribution = components["schemas"]["PriceDistribution"];

/** One histogram bar: products priced in `[min, max)`. */
export type PriceBucket = components["schemas"]["PriceBucket"];

// ── Store discovery (/v1/stores/search) ─────────────────────────────────────

/** Ranked unique stores; no total or pagination is promised, and results may underfill. */
export type StoreSearchResponse = components["schemas"]["StoreSearchResponse"];

/**
 * One store with its published profile summary and, when one is relevant, its
 * strongest department. Counts describe the profiled population, not matches
 * to the query text.
 */
export type StoreSearchResult = components["schemas"]["StoreSearchResult"];

/** Wire body of `POST /v1/stores/search`; `limit` has a server default. */
export type StoreSearchRequest = Omit<
  components["schemas"]["StoreSearchRequest"],
  "limit"
> & { limit?: number };

export interface SearchStoresParams {
  /** Plain-language description of the kind of store, 1-500 characters. */
  text: string;
  /** 1-100; the server defaults to 24. */
  limit?: number;
}

// ── Brands (/v1/brands) ─────────────────────────────────────────────────────

/** A brand-index filter: a {@link BrandFacetName} or an attribute key, plus values. */
export type BrandFacet = components["schemas"]["BrandFacet"];

/** Base facet keys of the brand index. */
export type BrandFacetName = components["schemas"]["BrandFacetName"];

/**
 * One brand's public metadata plus coverage of its products across catalogs:
 * product count, populated facets and a price histogram, shaped like one
 * {@link StoreCatalogCoverage}, and the catalogs carrying the brand.
 */
export type BrandCoverageResponse = components["schemas"]["BrandCoverageResponse"];

/** One catalog carrying a brand; pass one of its `hosts` to `getStore`. */
export type BrandCatalog = components["schemas"]["BrandCatalog"];

/** One ranked brand from a text or similar-brands search. */
export type SimilarBrandView = components["schemas"]["SimilarBrandView"];

/** Brands ranked by text relevance or by similarity to the source brands. */
export type SimilarBrandsResponse = components["schemas"]["SimilarBrandsResponse"];

/** One page of a brand's active products, shaped like search items. */
export type BrandProductsPage = components["schemas"]["BrandProductsPage"];

/** A brand's top categories by product count. */
export type BrandTopCategoriesPage = components["schemas"]["BrandTopCategoriesPage"];

/** One category and its taxonomy depth. */
export type BrandTopCategoryView = components["schemas"]["BrandTopCategoryView"];

/** Wire body of `POST /v1/brands/search`; `limit` has a server default. */
export type BrandTextSearchRequest = Omit<
  components["schemas"]["BrandTextSearchRequest"],
  "limit"
> & { limit?: number };

/** Wire body of `POST /v1/brands/similar`; `limit` has a server default. */
export type SimilarBrandsRequest = Omit<
  components["schemas"]["SimilarBrandsRequest"],
  "limit"
> & { limit?: number };

export interface SearchBrandPrefixParams {
  /** 1-50; the server defaults to 20. */
  limit?: number;
}

export interface SearchBrandsFromTextParams {
  /** Natural-language brand query, 1-500 characters. */
  text: string;
  /** Up to 20 canonical brand names whose embeddings guide the search. */
  referenceBrands?: string[];
  /** Up to 20 filters; they override facets generated from `text` by name. */
  facets?: BrandFacet[];
  /** 1-100; the server defaults to 24. */
  limit?: number;
}

export interface SearchSimilarBrandsParams {
  /** 1-20 source brand names, case-insensitive. */
  brands: string[];
  /** Up to 20 inclusion filters. */
  facets?: BrandFacet[];
  /** Up to 20 exclusion filters, with the same names and bounds as `facets`. */
  exclusionFacets?: BrandFacet[];
  /** 1-100; the server defaults to 24. */
  limit?: number;
}

export interface BrowseBrandProductsParams {
  /** 1-100; the server defaults to 24. */
  limit?: number;
  /** 0-10000. `hasMore` goes false at 10000 even when more products exist. */
  offset?: number;
}

export interface GetBrandTopCategoriesParams {
  /** Shallowest taxonomy depth to count, 0-10; the server defaults to 0. */
  minLevel?: number;
  /** 1-20; the server defaults to 3. */
  limit?: number;
}

// ── Caller identity (/v1/me) ────────────────────────────────────────────────

export type MeResponse = components["schemas"]["MeResponse"];

export type MeOrganization = components["schemas"]["MeOrganization"];

export type MeKey = components["schemas"]["MeKey"];

export type MeQuotas = components["schemas"]["MeQuotas"];

export type MeRateLimit = components["schemas"]["MeRateLimit"];

// ── Resolve from HTML (/v1/products/resolve-from-html) ──────────────────────

export interface ResolveProductFromHtmlParams {
  /** Product page HTML, capped at 5 MiB by the server. */
  html: string;
  /**
   * The page's source URL — strongly recommended. It anchors relative image
   * URLs and JSON-LD selection, and is the only variant-qualified identity the
   * response retains for storefronts that encode the selected variant in query
   * parameters. Without it the page must declare its own canonical URL.
   */
  url?: string;
}

export type ProgrammaticResolveFromHtmlRequest =
  components["schemas"]["ProgrammaticResolveFromHtmlRequest"];

// ── Taxonomy (/v1/taxonomy) ─────────────────────────────────────────────────

/** One canonical category; its `facets` select it in search unchanged. */
export type TaxonomyCategory = components["schemas"]["TaxonomyCategory"];

/** One page of a category's children, or of the root categories. */
export type TaxonomyCategoryPage = components["schemas"]["TaxonomyCategoryPage"];

/** One attribute definition; `facetName` is `null` when not filterable. */
export type TaxonomyAttribute = components["schemas"]["TaxonomyAttribute"];

/** One page of the attributes a category carries. */
export type TaxonomyAttributePage = components["schemas"]["TaxonomyAttributePage"];

/** One canonical value; send `handle` in the attribute facet's `values`. */
export type TaxonomyAttributeValue = components["schemas"]["TaxonomyAttributeValue"];

/** One page of an attribute's values. */
export type TaxonomyAttributeValuePage =
  components["schemas"]["TaxonomyAttributeValuePage"];

/** `offset`/`limit` paging; continue with the page's `nextOffset`. */
export interface TaxonomyPageParams {
  offset?: number;
  limit?: number;
}

export interface ListTaxonomyCategoriesParams extends TaxonomyPageParams {
  /**
   * A category UUID, a section handle such as `apparel`, or a category path
   * such as `Apparel & Accessories > Clothing` (any letter case). Omit for the
   * root categories.
   */
  parent?: string;
}

// ── Facet counts (/v1/products/facet-counts) ────────────────────────────────

/** Facets whose values `countProductFacets` can count. */
export type FacetCountName = "color_family" | "category_path.depth_0";

/** One category to count, named by the facets that select it. */
export interface FacetCountCategory {
  /** Your identifier; its count carries it back. */
  key: string;
  /** 1–10 facets, such as a {@link TaxonomyCategory}'s `facets`. */
  facets: Facet[];
}

export interface CountProductFacetsParams {
  /**
   * Free-text query, understood as search understands it. Its understood
   * filters narrow the counts; the text itself does not.
   */
  q?: string;
  /** Filters a product must match, as on `searchProducts`. */
  facets?: Facet[];
  /** Filters a product must not match, as on `searchProducts`. */
  excludeFacets?: Facet[];
  /** Understood facets to drop, as on `searchProducts`. Requires `q`. */
  omitGeneratedFacets?: string[];
  /** Category path to filter to when `q` names none. Requires `q`. */
  fallbackCategory?: string[];
  priceMin?: number;
  priceMax?: number;
  brandQualityMin?: number;
  brandQualityMax?: number;
  /** Catalog keys to count in (1–500). Omit for every catalog your key can access. */
  catalogs?: readonly string[];
  /** Categories to count (at most 100); each count also applies its facets. */
  categories?: FacetCountCategory[];
  /**
   * Attribute handles such as `neckline` (at most 50). A value's count ignores
   * your own facet on that attribute.
   */
  attributes?: string[];
  /** Facets whose values to count; the server counts `color_family` when omitted. */
  facetNames?: FacetCountName[];
  /** Most values returned per attribute and facet, 1–1000 (server default 100). */
  valueLimit?: number;
}

/** The `POST /v1/products/facet-counts` body, under its wire names. */
export interface ProgrammaticFacetCountsRequest {
  q?: string;
  facets?: Facet[];
  exclude_facets?: Facet[];
  omit_generated_facets?: string[];
  fallback_category?: string[];
  price_min?: number;
  price_max?: number;
  brand_quality_min?: number;
  brand_quality_max?: number;
  catalogs?: string[];
  categories?: FacetCountCategory[];
  attributes?: string[];
  facet_names?: FacetCountName[];
  value_limit?: number;
}

/** Counts under one set of search filters, with the filters applied. */
export type ProgrammaticFacetCountsResponse =
  components["schemas"]["ProgrammaticFacetCountsResponse"];

export type ProgrammaticCategoryCount =
  components["schemas"]["ProgrammaticCategoryCount"];

export type ProgrammaticAttributeCounts =
  components["schemas"]["ProgrammaticAttributeCounts"];

export type ProgrammaticFacetValueCounts =
  components["schemas"]["ProgrammaticFacetValueCounts"];

export type ProgrammaticFacetValueCount =
  components["schemas"]["ProgrammaticFacetValueCount"];
