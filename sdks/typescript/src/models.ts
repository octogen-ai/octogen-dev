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

export interface MerchantCatalogSummary {
  catalog: string;
  displayName: string;
  sourceBaseUrl?: string | null;
  productCount: number;
  lastIndexedAt?: string | null;
}

export interface MerchantProductListItem {
  uuid: string;
  productUrl: string;
  title?: string | null;
  brand?: BrandView | null;
  currentPrice?: number | null;
  originalPrice?: number | null;
  imageUrl?: string | null;
  images?: string[];
  rating?: RatingView | null;
  updatedAt?: string | null;
}

export interface MerchantProductListPage {
  items: MerchantProductListItem[];
  nextCursor?: string | null;
}

export interface MerchantProductView extends MerchantProductListItem {
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

export interface MerchantProductUrlLookupResponse {
  catalogKey: string;
  catalogDisplayName: string;
  sourceBaseUrl?: string | null;
  product: MerchantProductView;
}

export interface ValidationErrorModel {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface HTTPValidationError {
  detail?: ValidationErrorModel[] | null;
}
