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

export interface LookupProductOptions {
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

export interface TextSearchQuery {
  searchId?: string;
  text: string;
  limit?: number;
  rankingText?: string;
  retrievalEmbeddingColumns?: EmbeddingColumn[];
  rankingEmbeddingColumns?: EmbeddingColumn[];
  facets?: Facet[];
  exclusionFacets?: Facet[];
  priceMin?: number;
  priceMax?: number;
  brandQualityMin?: number;
  brandQualityMax?: number;
  similarToBrands?: string[];
  brandSimilarityWeight?: number;
  textSimilarityWeight?: number;
  searchAfter?: unknown[];
  browseMenuUuid?: string;
  compactMode?: "card" | "compact" | "medium" | "enriched";
}

export interface TextSearchQueryPayload {
  search_id?: string;
  text: string;
  limit?: number;
  ranking_text?: string;
  retrieval_embedding_columns?: EmbeddingColumn[];
  ranking_embedding_columns?: EmbeddingColumn[];
  facets?: Facet[];
  exclusion_facets?: Facet[];
  price_min?: number;
  price_max?: number;
  brand_quality_min?: number;
  brand_quality_max?: number;
  similar_to_brands?: string[];
  brand_similarity_weight?: number;
  text_similarity_weight?: number;
  search_after?: unknown[];
  browse_menu_uuid?: string;
  compact_mode?: "card" | "compact" | "medium" | "enriched";
}

export interface SearchProductsParams {
  catalog?: string;
  cursor?: string;
  limit?: number;
  q?: string;
  textSearchQuery?: TextSearchQuery;
  facets?: Facet[];
  priceMin?: number;
  priceMax?: number;
}

export interface ProgrammaticProductSearchRequest {
  catalog?: string;
  cursor?: string;
  limit: number;
  q?: string;
  text_search_query?: TextSearchQueryPayload;
  facets?: Facet[];
  price_min?: number;
  price_max?: number;
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

/**
 * One product to refresh: exactly one of `url` or `uuid`, optionally scoped to
 * a `catalog`. Hand-written rather than aliased from the contract because the
 * generated shape admits `null` for every field, which the payload builder
 * rejects anyway.
 */
export interface ProductRefreshTarget {
  url?: string;
  uuid?: string;
  catalog?: string;
}

export interface RefreshProductsParams {
  targets: ProductRefreshTarget[];
}

export type ProgrammaticProductRefreshRequest =
  components["schemas"]["ProgrammaticProductRefreshRequest"];

export type ProgrammaticProductRefreshTarget =
  components["schemas"]["ProgrammaticProductRefreshTarget"];

export type ProductRefreshAcceptedTarget =
  components["schemas"]["ProgrammaticProductRefreshAcceptedTarget"];

export type ProductRefreshRejectedTarget =
  components["schemas"]["ProgrammaticProductRefreshRejectedTarget"];

/**
 * `202` body of `POST /v1/products/refresh`. `workflowStatus` describes the
 * dispatch of the refresh workflow, not the refresh itself: `launched` means
 * the crawl was handed off, and a non-empty `rejected` can accompany a
 * successful dispatch of the rest.
 */
export type ProductRefreshResponse =
  components["schemas"]["ProgrammaticProductRefreshResponse"];

export interface MoreLikeThisSource {
  url?: string;
  uuid?: string;
}

export interface MoreLikeThisProductsParams {
  source: MoreLikeThisSource;
  catalog?: string;
  cursor?: string;
  limit?: number;
  includeFacets?: Facet[];
  excludeFacets?: Facet[];
  pricePreference?: PricePreference;
  debug?: boolean;
}

export interface ProgrammaticMoreLikeThisRequest {
  source: MoreLikeThisSource;
  catalog?: string;
  cursor?: string;
  limit: number;
  include_facets?: Facet[];
  exclude_facets?: Facet[];
  price_preference: PricePreference;
  debug: boolean;
}

export interface MoreLikeThisSourceResponse {
  catalogKey: string;
  uuid: string;
  productUrl: string;
  title?: string | null;
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
  limit: number;
}

export interface MoreLikeThisProductsResponse {
  source: MoreLikeThisSourceResponse;
  items: MerchantProductListItem[];
  nextCursor?: string | null;
  effectiveQuery?: MoreLikeThisEffectiveQuery | null;
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

export interface MerchantProductListItem {
  uuid: string;
  catalogKey?: string | null;
  productUrl: string;
  title?: string | null;
  brand?: BrandView | null;
  currentPrice?: number | null;
  originalPrice?: number | null;
  imageUrl?: string | null;
  images?: string[];
  rating?: RatingView | null;
  isActive?: boolean;
  rawScore?: number | null;
  displayMatchScore?: number | null;
  updatedAt?: string | null;
}

export interface MerchantProductListPage {
  items: MerchantProductListItem[];
  nextCursor?: string | null;
}

export interface MerchantProductView extends Omit<
  MerchantProductListItem,
  "uuid" | "isActive"
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
  method: "json_ld" | "open_graph" | "html_meta" | "resolved_url";
  rendered?: boolean;
  missingFields?: string[];
}

export interface MerchantProductUrlLookupResponse {
  requestId?: string | null;
  source: "indexed" | "on_demand";
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
  warnings?: string[];
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

// ── Covered domains (/v1/domains) ───────────────────────────────────────────

export type DomainEntry = components["schemas"]["DomainEntry"];

export type ListDomainsResponse = components["schemas"]["ListDomainsResponse"];

export interface ListDomainsOptions {
  /**
   * Revalidate instead of refetching: an `ETag` from a previous response. When
   * the server's list is unchanged it answers `304` and
   * {@link ListDomainsResult.notModified} is `true` with no `domains` body.
   */
  ifNoneMatch?: string;
}

export interface ListDomainsResult {
  /** `true` when the server answered `304` — reuse the cached snapshot. */
  notModified: boolean;
  /** The covered-domain set; `undefined` on a `304`. */
  domains: readonly DomainEntry[] | undefined;
  /** The strong `ETag` to revalidate with next time. */
  etag: string | undefined;
  /** `max-age` from `Cache-Control`, in seconds, when the server sent one. */
  maxAgeSeconds: number | undefined;
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

// ── Voyages (/v1/voyage) ────────────────────────────────────────────────────

export type VoyageTask = components["schemas"]["VoyageTask"];

export type VoyageStatus = NonNullable<VoyageTask["status"]>;

export type VoyagePhase = NonNullable<VoyageTask["phase"]>;

export type VoyageResult = components["schemas"]["VoyageResult"];

export type VoyageError = components["schemas"]["VoyageError"];

export type VoyageQuotas = components["schemas"]["VoyageQuotas"];

export type VoyageListResponse = components["schemas"]["VoyageListResponse"];

export type VoyageStartRequest = components["schemas"]["VoyageStartRequest"];

export interface StartVoyageResult {
  task: VoyageTask;
  /**
   * `true` when this call dispatched a new voyage (`202`, quota consumed);
   * `false` when it joined one already running for the domain (`200`, no quota
   * consumed). Voyages are shared per domain, so joining is the common case
   * for a popular merchant.
   */
  created: boolean;
}

export interface ListVoyagesParams {
  status?: VoyageStatus;
  cursor?: string;
  limit?: number;
}
