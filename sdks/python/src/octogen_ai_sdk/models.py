"""Pydantic models for the Octogen merchant programmatic API."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class ProductRefreshWorkflowStatus(StrEnum):
    PENDING = "pending"
    LAUNCHING = "launching"
    LAUNCHED = "launched"
    RETRY_PENDING = "retry_pending"


class VoyageStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    IN_REVIEW = "in_review"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class VoyagePhase(StrEnum):
    DISCOVERING_SITE = "discovering_site"
    SAMPLING_PRODUCTS = "sampling_products"
    BUILDING_EXTRACTION = "building_extraction"
    IN_REVIEW = "in_review"
    PUBLISHING_CATALOG = "publishing_catalog"
    COMPLETE = "complete"
    FAILED = "failed"


class PricePreference(StrEnum):
    LOWER = "lower"
    ANY = "any"
    HIGHER = "higher"


class ProductLookupResolutionMode(StrEnum):
    AUTO = "auto"
    INDEX_ONLY = "index_only"
    ON_DEMAND_ONLY = "on_demand_only"


class ProductLookupCachePolicy(StrEnum):
    PREFER_CACHE = "prefer_cache"
    REFRESH = "refresh"


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
    """Product search request targeting one or all active crawled catalogs."""

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
    resolution_mode: ProductLookupResolutionMode = Field(
        default=ProductLookupResolutionMode.AUTO,
        alias="resolutionMode",
    )
    on_demand_cache_policy: ProductLookupCachePolicy = Field(
        default=ProductLookupCachePolicy.PREFER_CACHE,
        alias="onDemandCachePolicy",
    )

    @model_validator(mode="after")
    def validate_cache_policy(self) -> ProgrammaticProductLookupRequest:
        if (
            self.resolution_mode == ProductLookupResolutionMode.INDEX_ONLY
            and self.on_demand_cache_policy != ProductLookupCachePolicy.PREFER_CACHE
        ):
            raise ValueError("onDemandCachePolicy does not apply to index_only")
        return self


class ProgrammaticProductRefreshTarget(_RequestModel):
    """One product identifier to schedule for refresh."""

    url: str | None = Field(default=None, min_length=1)
    uuid: str | None = Field(default=None, min_length=1)
    catalog: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def require_exactly_one_identifier(self) -> ProgrammaticProductRefreshTarget:
        identifiers = [self.url is not None, self.uuid is not None]
        if sum(identifiers) != 1:
            raise ValueError("Exactly one of url or uuid is required")
        return self


class ProgrammaticProductRefreshRequest(_RequestModel):
    """Product refresh request."""

    targets: list[ProgrammaticProductRefreshTarget] = Field(
        min_length=1,
        max_length=500,
    )


class ProgrammaticResolveFromHtmlRequest(_RequestModel):
    """Resolve a product from caller-supplied HTML."""

    html: str = Field(min_length=1, max_length=5_242_880)
    url: str | None = Field(default=None, min_length=1)


class VoyageStartRequest(_RequestModel):
    """Body for ``POST /v1/voyage``: a registrable domain or a full URL."""

    domain: str = Field(min_length=1, max_length=2048)


class ProgrammaticMoreLikeThisSource(_RequestModel):
    """Source product identifier for a More Like This request."""

    url: str | None = Field(default=None, min_length=1)
    uuid: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def require_exactly_one_identifier(self) -> ProgrammaticMoreLikeThisSource:
        identifiers = [self.url is not None, self.uuid is not None]
        if sum(identifiers) != 1:
            raise ValueError("Exactly one of url or uuid is required")
        return self


class ProgrammaticMoreLikeThisRequest(_RequestModel):
    """More Like This request targeting one or all active crawled catalogs."""

    source: ProgrammaticMoreLikeThisSource
    catalog: str | None = Field(default=None, min_length=1)
    cursor: str | None = None
    limit: int = Field(default=12, ge=1, le=100)
    include_facets: list[Facet] | None = None
    exclude_facets: list[Facet] | None = None
    price_preference: PricePreference = PricePreference.ANY
    debug: bool = False


class ProgrammaticMoreLikeThisSourceResponse(_ResponseModel):
    """Source product identity returned by More Like This."""

    catalog_key: str = Field(alias="catalogKey")
    uuid: str
    product_url: str = Field(alias="productUrl")
    title: str | None = None


class ProgrammaticMoreLikeThisEffectiveFacet(_ResponseModel):
    name: str
    values: list[str]


class ProgrammaticMoreLikeThisEffectiveQuery(_ResponseModel):
    text: str
    retrieval_embedding_columns: list[str] | None = Field(
        default=None,
        alias="retrievalEmbeddingColumns",
    )
    ranking_embedding_columns: list[str] | None = Field(
        default=None,
        alias="rankingEmbeddingColumns",
    )
    facets: list[ProgrammaticMoreLikeThisEffectiveFacet] | None = None
    exclusion_facets: list[ProgrammaticMoreLikeThisEffectiveFacet] | None = Field(
        default=None,
        alias="exclusionFacets",
    )
    price_min: float | None = Field(default=None, alias="priceMin")
    price_max: float | None = Field(default=None, alias="priceMax")
    limit: int


class ProgrammaticMoreLikeThisResponse(_ResponseModel):
    source: ProgrammaticMoreLikeThisSourceResponse
    items: list[MerchantProductListItem] = Field(default_factory=list)
    next_cursor: str | None = Field(default=None, alias="nextCursor")
    effective_query: ProgrammaticMoreLikeThisEffectiveQuery | None = Field(
        default=None,
        alias="effectiveQuery",
    )


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


class MerchantProductListItem(_ResponseModel):
    uuid: str
    catalog_key: str | None = Field(default=None, alias="catalogKey")
    product_url: str = Field(alias="productUrl")
    title: str | None = None
    brand: BrandView | None = None
    current_price: float | None = Field(default=None, alias="currentPrice")
    original_price: float | None = Field(default=None, alias="originalPrice")
    image_url: str | None = Field(default=None, alias="imageUrl")
    images: list[str] = Field(default_factory=list)
    rating: RatingView | None = None
    is_active: bool = Field(default=True, alias="isActive")
    raw_score: float | None = Field(default=None, alias="rawScore")
    display_match_score: int | None = Field(default=None, alias="displayMatchScore")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class MerchantProductListPage(_ResponseModel):
    items: list[MerchantProductListItem] = Field(default_factory=list)
    next_cursor: str | None = Field(default=None, alias="nextCursor")


class MerchantProductView(MerchantProductListItem):
    uuid: str | None
    is_active: bool | None = Field(default=None, alias="isActive")
    currency: str | None = None
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


class ProductResolutionMetadata(_ResponseModel):
    completeness: Literal["complete", "partial"]
    method: Literal["json_ld", "open_graph", "html_meta", "resolved_url"]
    rendered: bool = False
    missing_fields: list[str] = Field(default_factory=list, alias="missingFields")


class MerchantProductUrlLookupResponse(_ResponseModel):
    request_id: str | None = Field(default=None, alias="requestId")
    #: How the product was resolved. ``client_html`` is what
    #: :meth:`~octogen_ai_sdk.OctogenClient.resolve_product_from_html` always
    #: returns; ``lookup_product`` returns ``indexed`` or ``on_demand``.
    source: Literal["indexed", "on_demand", "client_html"]
    catalog_key: str | None = Field(default=None, alias="catalogKey")
    catalog_display_name: str | None = Field(default=None, alias="catalogDisplayName")
    source_base_url: str | None = Field(default=None, alias="sourceBaseUrl")
    product: MerchantProductView
    requested_url: str | None = Field(default=None, alias="requestedUrl")
    resolved_url: str | None = Field(default=None, alias="resolvedUrl")
    normalized_url: str | None = Field(default=None, alias="normalizedUrl")
    canonical_url: str | None = Field(default=None, alias="canonicalUrl")
    resolution: ProductResolutionMetadata | None = None
    cache_status: Literal["hit", "miss", "refresh"] | None = Field(
        default=None,
        alias="cacheStatus",
    )
    warnings: list[str] = Field(default_factory=list)


class ProgrammaticProductRefreshAcceptedTarget(_ResponseModel):
    catalog: str
    url: str


class ProgrammaticProductRefreshRejectedTarget(_ResponseModel):
    target: ProgrammaticProductRefreshTarget
    code: str
    message: str


class ProgrammaticProductRefreshResponse(_ResponseModel):
    request_id: str = Field(alias="requestId")
    submitted: int
    accepted: list[ProgrammaticProductRefreshAcceptedTarget] = Field(
        default_factory=list,
    )
    rejected: list[ProgrammaticProductRefreshRejectedTarget] = Field(
        default_factory=list,
    )
    workflow_id: str | None = Field(default=None, alias="workflowId")
    workflow_status: ProductRefreshWorkflowStatus | None = Field(
        default=None,
        alias="workflowStatus",
    )
    workflow_attempts: int = Field(default=0, alias="workflowAttempts")
    workflow_error: str | None = Field(default=None, alias="workflowError")


class DomainEntry(_ResponseModel):
    """One covered host and the catalog that claims it."""

    catalog: str
    catalog_display_name: str = Field(alias="catalogDisplayName")
    host: str


class ListDomainsResponse(_ResponseModel):
    """The full covered-domain set."""

    domains: list[DomainEntry] = Field(default_factory=list)


class ListDomainsResult(_ResponseModel):
    """``list_domains`` with its cache metadata.

    ``domains`` is ``None`` exactly when ``not_modified`` is true — the server
    answered ``304`` to an ``If-None-Match`` and the caller should reuse the set
    it already cached.
    """

    domains: list[DomainEntry] | None = None
    etag: str | None = None
    not_modified: bool = False


class VoyageError(_ResponseModel):
    """Redacted failure info: a stable snake_case code plus safe text."""

    code: str
    message: str


class VoyageResultEndpoints(_ResponseModel):
    lookup: str = "/v1/products/lookup"
    search: str = "/v1/products/search"


class VoyageResult(_ResponseModel):
    """Populated once the voyage completes and the catalog is live."""

    catalog: str
    endpoints: VoyageResultEndpoints | None = None
    product_count: int | None = Field(default=None, alias="productCount")


class VoyageTask(_ResponseModel):
    """The shared, org-anonymous public view of a voyage."""

    task_id: str = Field(alias="taskId")
    domain: str
    status: VoyageStatus
    phase: VoyagePhase
    phase_label: str = Field(alias="phaseLabel")
    progress_percent: int = Field(alias="progressPercent")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")
    error: VoyageError | None = None
    result: VoyageResult | None = None


class StartVoyageResult(_ResponseModel):
    """``start_voyage`` plus whether it joined an existing voyage.

    ``joined`` is true when the API answered ``200`` — a voyage for this domain
    was already running, or the domain already has a live catalog — and no
    quota was consumed. It is false when the API answered ``202`` and
    dispatched a fresh voyage, which does consume quota.
    """

    task: VoyageTask
    joined: bool


class VoyageQuotaConcurrent(_ResponseModel):
    """Concurrent-slot usage: clears when voyages finish, no fixed reset."""

    limit: int | None = None
    used: int | None = None


class VoyageQuotaMonthly(_ResponseModel):
    limit: int | None = None
    used: int | None = None
    period_start: date | None = Field(default=None, alias="periodStart")
    resets_at: datetime | None = Field(default=None, alias="resetsAt")


class VoyageQuotas(_ResponseModel):
    concurrent: VoyageQuotaConcurrent
    monthly: VoyageQuotaMonthly


class VoyageListResponse(_ResponseModel):
    """``GET /v1/voyage`` page. ``quotas`` is null for super-admin callers."""

    items: list[VoyageTask] = Field(default_factory=list)
    next_cursor: str | None = Field(default=None, alias="nextCursor")
    quotas: VoyageQuotas | None = None


class ValidationErrorModel(_ResponseModel):
    loc: list[str | int]
    msg: str
    type: str


class HTTPValidationError(_ResponseModel):
    detail: list[ValidationErrorModel] | None = None


# ── Coverage URL Lists (/v1/coverage/url-lists) ──────────────────────────────


class CoverageUrlListCreateRequest(_RequestModel):
    """Body for ``POST /v1/coverage/url-lists``."""

    name: str = Field(min_length=1, max_length=80)


class CoverageUrlsRequest(_RequestModel):
    """Shared body for the URL mutations and the membership check."""

    urls: list[str] = Field(min_length=1, max_length=1000)


class CoverageUrlListBigQuery(_ResponseModel):
    """BigQuery resources of an active URL list; ``last_exported_at`` /
    ``last_row_count`` stay ``None`` until the first daily export lands."""

    exchange_id: str = Field(alias="exchangeId")
    listing_id: str = Field(alias="listingId")
    shared_dataset_id: str = Field(alias="sharedDatasetId")
    view_id: str = Field(alias="viewId")
    last_exported_at: datetime | None = Field(default=None, alias="lastExportedAt")
    last_row_count: int | None = Field(default=None, alias="lastRowCount")
    reader_count: int = Field(alias="readerCount")


class CoverageUrlList(_ResponseModel):
    """The URL List object. ``big_query`` is ``None`` while the list is
    provisioning."""

    url_list_id: str = Field(alias="urlListId")
    name: str
    status: Literal["provisioning", "active", "delete_pending"]
    url_count: int = Field(alias="urlCount")
    big_query: CoverageUrlListBigQuery | None = Field(default=None, alias="bigQuery")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class CoverageUrlListPage(_ResponseModel):
    items: list[CoverageUrlList]
    next_cursor: str | None = Field(default=None, alias="nextCursor")


class CoverageAcceptedUrl(_ResponseModel):
    url: str
    normalized_url: str = Field(alias="normalizedUrl")


class CoverageRejectedUrl(_ResponseModel):
    url: str
    code: str
    message: str


class CoverageUrlMutationResponse(_ResponseModel):
    """Per-URL outcomes of an add/remove call. ``url_count`` is the list's
    total size after the mutation, not the size of the request."""

    accepted: list[CoverageAcceptedUrl]
    rejected: list[CoverageRejectedUrl]
    url_count: int = Field(alias="urlCount")
    request_id: str = Field(alias="requestId")


class CoverageContainsResult(_ResponseModel):
    url: str
    normalized_url: str = Field(alias="normalizedUrl")
    present: bool
    added_at: datetime | None = Field(default=None, alias="addedAt")


class CoverageContainsResponse(_ResponseModel):
    results: list[CoverageContainsResult]


class CoverageUrlListUrl(_ResponseModel):
    url: str
    normalized_url: str = Field(alias="normalizedUrl")
    added_at: datetime = Field(alias="addedAt")


class CoverageUrlListUrlsPage(_ResponseModel):
    items: list[CoverageUrlListUrl]
    next_cursor: str | None = Field(default=None, alias="nextCursor")
