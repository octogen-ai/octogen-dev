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

export interface LookupProductOptions {
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

export interface ProgrammaticProductLookupRequest {
  url: string;
}

export interface ProductRefreshTarget {
  url?: string;
  uuid?: string;
  catalog?: string;
}

export interface RefreshProductsParams {
  targets: ProductRefreshTarget[];
}

export interface ProgrammaticProductRefreshRequest {
  targets: ProductRefreshTarget[];
}

export interface ProductRefreshAcceptedTarget {
  catalog: string;
  url: string;
}

export interface ProductRefreshRejectedTarget {
  target: ProductRefreshTarget;
  code: string;
  message: string;
}

export const ProductRefreshWorkflowStatus = {
  PENDING: "pending",
  LAUNCHING: "launching",
  LAUNCHED: "launched",
  RETRY_PENDING: "retry_pending",
} as const;

export type ProductRefreshWorkflowStatus =
  (typeof ProductRefreshWorkflowStatus)[keyof typeof ProductRefreshWorkflowStatus];

export interface ProductRefreshResponse {
  requestId: string;
  submitted: number;
  accepted: ProductRefreshAcceptedTarget[];
  rejected: ProductRefreshRejectedTarget[];
  workflowId?: string | null;
  workflowStatus?: ProductRefreshWorkflowStatus | null;
  workflowAttempts?: number;
  workflowError?: string | null;
}

export interface DomainEntry {
  /** Catalog key covering the host. */
  catalog: string;
  /** Human-readable display name for the catalog. */
  catalogDisplayName: string;
  /** Normalized covered host, e.g. `allbirds.com` or `www.allbirds.com`. */
  host: string;
}

export interface ListDomainsResponse {
  domains: DomainEntry[];
}

export interface ListDomainsOptions {
  /**
   * A previously returned `etag`. When it still matches, the server answers
   * `304` and the result's `notModified` is `true`.
   */
  ifNoneMatch?: string;
}

export interface ListDomainsFresh {
  notModified: false;
  /** Every covered host, one entry per `(host, catalog)` pair. */
  domains: DomainEntry[];
  /** Strong `ETag` for this set. Pass it back as `ifNoneMatch` to revalidate. */
  etag: string | null;
}

export interface ListDomainsNotModified {
  notModified: true;
  /** The server answered `304`: reuse the set you already cached. */
  domains: null;
  etag: string | null;
}

/**
 * Discriminated on `notModified` so a caller who sends `ifNoneMatch` cannot
 * read `domains` without first handling the `304` case.
 */
export type ListDomainsResult = ListDomainsFresh | ListDomainsNotModified;

export interface ResolveProductFromHtmlParams {
  /** Product page HTML. The API caps this at 5 MiB. */
  html: string;
  /**
   * Strongly recommended: the page's source URL, ideally `location.href` read
   * at the instant the DOM was serialized. Anchors relative image URLs and
   * JSON-LD candidate selection, and is echoed back as `requestedUrl`. When
   * absent the page must declare its own canonical URL or resolution fails.
   */
  url?: string;
}

export interface ProgrammaticResolveFromHtmlRequest {
  html: string;
  url?: string;
}

export const VoyageStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  IN_REVIEW: "in_review",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type VoyageStatus = (typeof VoyageStatus)[keyof typeof VoyageStatus];

export const VoyagePhase = {
  DISCOVERING_SITE: "discovering_site",
  SAMPLING_PRODUCTS: "sampling_products",
  BUILDING_EXTRACTION: "building_extraction",
  IN_REVIEW: "in_review",
  PUBLISHING_CATALOG: "publishing_catalog",
  COMPLETE: "complete",
  FAILED: "failed",
} as const;

export type VoyagePhase = (typeof VoyagePhase)[keyof typeof VoyagePhase];

export interface VoyageError {
  code: string;
  message: string;
}

export interface VoyageResultEndpoints {
  lookup?: string;
  search?: string;
}

export interface VoyageResult {
  catalog: string;
  endpoints?: VoyageResultEndpoints;
  productCount?: number | null;
}

export interface VoyageTask {
  taskId: string;
  domain: string;
  status: VoyageStatus;
  phase: VoyagePhase;
  phaseLabel: string;
  progressPercent: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  error?: VoyageError | null;
  result?: VoyageResult | null;
}

export interface VoyageStartRequest {
  domain: string;
}

export interface StartVoyageResult {
  task: VoyageTask;
  /**
   * `true` when this call joined a voyage that was already running (or a
   * domain that already has a live catalog) — HTTP `200`, no quota consumed.
   * `false` when it dispatched a fresh voyage — HTTP `202`, quota consumed.
   */
  joined: boolean;
}

export interface VoyageQuotaConcurrent {
  limit?: number | null;
  used?: number | null;
}

export interface VoyageQuotaMonthly {
  limit?: number | null;
  used?: number | null;
  periodStart?: string | null;
  resetsAt?: string | null;
}

export interface VoyageQuotas {
  concurrent: VoyageQuotaConcurrent;
  monthly: VoyageQuotaMonthly;
}

export interface VoyageListResponse {
  items: VoyageTask[];
  nextCursor?: string | null;
  /** `null` for super-admin callers, who have no org quota. */
  quotas?: VoyageQuotas | null;
}

export interface ListVoyagesParams {
  status?: VoyageStatus;
  cursor?: string;
  limit?: number;
}

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
