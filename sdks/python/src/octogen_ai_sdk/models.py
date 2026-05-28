"""Pydantic models for the Octogen merchant programmatic API."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class _ResponseModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")


class _RequestModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
        use_enum_values=True,
    )


class AgeGroup(StrEnum):
    INFANT = "infant"
    TODDLER = "toddler"
    KIDS = "kids"
    ADULT = "adult"


class Gender(StrEnum):
    MALE = "male"
    FEMALE = "female"
    UNISEX = "unisex"


class ColorFamily(StrEnum):
    PINK = "Pink"
    RED = "Red"
    ORANGE = "Orange"
    BROWN = "Brown"
    YELLOW = "Yellow"
    GREEN = "Green"
    BLUE = "Blue"
    PURPLE = "Purple"
    WHITE = "White"
    GRAY = "Gray"
    BLACK = "Black"


class EmbeddingColumn(StrEnum):
    EMBEDDING = "embedding"
    STYLE_EMBEDDING = "style_embedding"
    TAGS_EMBEDDING = "tags_embedding"
    ATTRIBUTES_EMBEDDING = "attributes_embedding"


class FacetName(StrEnum):
    BRAND_NAME = "brand_name"
    BRAND_SLUG = "brand_slug"
    RAW_BRAND_NAME = "raw_brand_name"
    PRODUCT_TYPE = "product_type"
    GENDER = "gender"
    AGE_GROUPS = "age_groups"
    COLOR = "color"
    COLOR_FAMILY = "color_family"
    IS_ACTIVEWEAR = "is_activewear"
    CATEGORY_PATH_DEPTH_0 = "category_path.depth_0"
    CATEGORY_PATH_DEPTH_1 = "category_path.depth_1"
    CATEGORY_PATH_DEPTH_2 = "category_path.depth_2"
    CATEGORY_PATH_DEPTH_3 = "category_path.depth_3"
    CATEGORY_PATH_DEPTH_4 = "category_path.depth_4"
    CATEGORY_PATH_DEPTH_5 = "category_path.depth_5"
    CATEGORY_PATH_DEPTH_6 = "category_path.depth_6"


class Facet(_RequestModel):
    """Facet filter accepted by product search."""

    name: FacetName | str = Field(
        description=(
            "Base facet name or dynamic attribute facet, such as "
            "'fit' or 'attribute_facets.fit'."
        )
    )
    values: list[str]


class TextSearchQuery(_RequestModel):
    """Pre-generated semantic search query for product search."""

    search_id: str | None = None
    text: str
    limit: int = 10
    ranking_text: str | None = None
    retrieval_embedding_columns: list[EmbeddingColumn] | None = None
    ranking_embedding_columns: list[EmbeddingColumn] | None = None
    facets: list[Facet] | None = None
    exclusion_facets: list[Facet] | None = None
    price_min: float | None = None
    price_max: float | None = None
    brand_quality_min: float | None = Field(default=None, ge=1, le=6)
    brand_quality_max: float | None = Field(default=None, ge=1, le=6)
    similar_to_brands: list[str] | None = None
    brand_similarity_weight: float | None = Field(default=0.7, ge=0.0, le=1.0)
    text_similarity_weight: float | None = Field(default=0.3, ge=0.0, le=1.0)
    search_after: list[Any] | None = None
    browse_menu_uuid: str | None = None
    compact_mode: Literal["card", "compact", "medium", "enriched"] | None = None


class ProgrammaticProductSearchRequest(_RequestModel):
    """Product search request targeting one catalog or all granted catalogs."""

    catalog: str | None = Field(default=None, min_length=1)
    cursor: str | None = None
    limit: int = Field(default=50, ge=1, le=100)
    q: str | None = None
    text_search_query: TextSearchQuery | None = None
    facets: list[Facet] | None = None
    price_min: float | None = None
    price_max: float | None = None


class ProgrammaticProductLookupRequest(_RequestModel):
    """Product lookup request."""

    url: str = Field(min_length=1)


class AttributeValue(_ResponseModel):
    name: str
    handle: str


class Attribute(_ResponseModel):
    handle: str
    name: str
    values: list[AttributeValue] = Field(default_factory=list)


class BrandView(_ResponseModel):
    name: str
    slug: str | None = None
    url: str | None = None
    description: str | None = None


class ColorView(_ResponseModel):
    label: str
    swatch_url: str | None = Field(default=None, alias="swatchUrl")
    hex_code: str | None = Field(default=None, alias="hexCode")


class CategoryView(_ResponseModel):
    name: str
    url: str | None = None


class RatingView(_ResponseModel):
    average: float | None = None
    count: int | None = None


class AudienceView(_ResponseModel):
    genders: list[str] = Field(default_factory=list)
    age_groups: list[str] = Field(default_factory=list, alias="ageGroups")


class BreadcrumbView(_ResponseModel):
    name: str
    url: str | None = None


class PromotionView(_ResponseModel):
    description: str | None = None
    code: str | None = None


class ReviewView(_ResponseModel):
    author: str | None = None
    rating: float | None = None
    body: str | None = None
    published_at: datetime | None = Field(default=None, alias="publishedAt")


class VideoView(_ResponseModel):
    url: str | None = None
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")
    name: str | None = None


class ProductDetailsView(_ResponseModel):
    materials: list[str] = Field(default_factory=list)
    fit: list[str] = Field(default_factory=list)
    dimensions: str | None = None
    patterns: list[str] = Field(default_factory=list)


class IdentifiersView(_ResponseModel):
    product_id: str | None = Field(default=None, alias="productId")
    gtin: str | None = None
    product_group_id: str | None = Field(default=None, alias="productGroupId")


class MerchantVariantView(_ResponseModel):
    sku: str | None = None
    product_url: str | None = Field(default=None, alias="productUrl")
    color: ColorView | None = None
    size: str | None = None
    in_stock: bool | None = Field(default=None, alias="inStock")
    image_url: str | None = Field(default=None, alias="imageUrl")


class CanonicalBrandEnrichment(_ResponseModel):
    facet_origin_country: str | None = None
    facet_price_tier: str | None = None
    facet_target_audience: str | None = None
    facet_style_identity: list[str] | None = None
    facet_sustainability: list[str] | None = None
    facet_brand_ethics: list[str] | None = None
    facet_brand_inclusivity: list[str] | None = None
    facet_brand_cultural_anchors: list[str] | None = None
    facet_key_people_names: list[str] | None = None
    facet_key_people_nationalities: list[str] | None = None
    facet_brand_hype_cycle_stage: list[str] | None = None
    brand_quality_score: float | None = None
    domain: str | None = None
    founded_year: int | None = None
    directory_subheading: str | None = None
    brand_description: str | None = None
    brand_positioning: str | None = None
    occasion_fit: str | None = None
    brand_craft_production: str | None = None
    brand_accessibility_index: str | None = None
    brand_community_perception: str | None = None
    brand_popularity_level: str | None = None
    brand_popularity_trend_direction: str | None = None
    brand_quality_justification: str | None = None


class CanonicalBrand(_ResponseModel):
    brand_uuid: str
    brand_name: str
    brand_slug: str | None = None
    brand_synonyms: list[str] | None = None
    brand_enrichment: CanonicalBrandEnrichment | None = None


class ProductEnrichment(_ResponseModel):
    product_type: str | None = Field(default=None, alias="type")
    type_synonyms: list[str] | None = None
    tags: list[str] | None = None
    styles: list[str] | None = None
    image_with_single_product: bool | None = None
    gender: Gender | str | None = None
    is_activewear: bool | None = None
    age_groups: list[AgeGroup | str] | None = None
    color: list[str] | None = None
    color_family: list[ColorFamily | str] | None = None
    category_path: list[str] | None = None
    attributes: dict[str, list[str]] | None = None
    attribute_handles: dict[str, list[str]] | None = None
    structured_attributes: list[Attribute] | None = None
    brand_id: str | None = None
    canonical_brand: CanonicalBrand | None = None
    summary: str | None = None


class MerchantCatalogSummary(_ResponseModel):
    catalog: str
    display_name: str = Field(alias="displayName")
    source_base_url: str | None = Field(default=None, alias="sourceBaseUrl")
    product_count: int = Field(alias="productCount")
    last_indexed_at: datetime | None = Field(default=None, alias="lastIndexedAt")


class MerchantProductListItem(_ResponseModel):
    uuid: str
    product_url: str = Field(alias="productUrl")
    title: str | None = None
    brand: BrandView | None = None
    current_price: float | None = Field(default=None, alias="currentPrice")
    original_price: float | None = Field(default=None, alias="originalPrice")
    image_url: str | None = Field(default=None, alias="imageUrl")
    images: list[str] = Field(default_factory=list)
    rating: RatingView | None = None
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class MerchantProductListPage(_ResponseModel):
    items: list[MerchantProductListItem] = Field(default_factory=list)
    next_cursor: str | None = Field(default=None, alias="nextCursor")


class MerchantProductView(MerchantProductListItem):
    description: str | None = None
    in_stock: bool | None = Field(default=None, alias="inStock")
    categories: list[CategoryView] = Field(default_factory=list)
    sizes: list[str] = Field(default_factory=list)
    colors: list[ColorView] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    variants: list[MerchantVariantView] = Field(default_factory=list)
    details: ProductDetailsView = Field(default_factory=ProductDetailsView)
    audience: AudienceView | None = None
    identifiers: IdentifiersView = Field(default_factory=IdentifiersView)
    breadcrumbs: list[BreadcrumbView] = Field(default_factory=list)
    promotions: list[PromotionView] = Field(default_factory=list)
    reviews: list[ReviewView] = Field(default_factory=list)
    videos: list[VideoView] = Field(default_factory=list)
    enrichment: ProductEnrichment | None = None


class MerchantProductUrlLookupResponse(_ResponseModel):
    catalog_key: str = Field(alias="catalogKey")
    catalog_display_name: str = Field(alias="catalogDisplayName")
    source_base_url: str | None = Field(default=None, alias="sourceBaseUrl")
    product: MerchantProductView


class ValidationErrorModel(_ResponseModel):
    loc: list[str | int]
    msg: str
    type: str


class HTTPValidationError(_ResponseModel):
    detail: list[ValidationErrorModel] | None = None
