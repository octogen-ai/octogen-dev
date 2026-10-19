"""Pydantic models for the Octogen merchant programmatic API.

Response models for the newer operations are **re-exported from**
:mod:`octogen_ai_sdk.generated.models`, which ``npm run codegen`` emits from the
published OpenAPI document: a field the server adds shows up as a reviewable
diff rather than as a runtime surprise. Request models with a rule the contract
cannot express — "exactly one of ``url`` or ``uuid``", say — stay hand-written
here so a bad call fails locally instead of as a server ``422``.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from octogen_ai_sdk.generated import models as _contract

# ── Contract mirror ─────────────────────────────────────────────────────────
#
# **Response** models come straight from the generated mirror of the published
# OpenAPI document, so a field the server adds arrives as a reviewable
# `npm run codegen` diff instead of being silently dropped. They are re-bound
# here, under the contract's own names, because `octogen_ai_sdk.models` is the
# public home for every model this SDK returns.
#
# **Request** models stay hand-written below. Two reasons: rules the contract
# cannot express (`extra="forbid"` catches a bad key, but not "exactly one of
# `url` or `uuid`"), and constructor ergonomics — the generator turns a
# `minLength`/`maxLength` string into a constrained root-model alias, so a
# generated request body would not accept a plain `str`.
DomainCatalogCoverage = _contract.DomainCatalogCoverage
DomainCoverageResponse = _contract.DomainCoverageResponse
DomainField = _contract.DomainField
DomainFieldValue = _contract.DomainFieldValue
MeKey = _contract.MeKey
MeOrganization = _contract.MeOrganization
MeQuotas = _contract.MeQuotas
MeRateLimit = _contract.MeRateLimit
MeResponse = _contract.MeResponse
PriceBucket = _contract.PriceBucket
PriceDistribution = _contract.PriceDistribution
ProgrammaticProductSearchEffectiveFacet = (
    _contract.ProgrammaticProductSearchEffectiveFacet
)
ProgrammaticProductSearchEffectiveQuery = (
    _contract.ProgrammaticProductSearchEffectiveQuery
)
ProgrammaticProductSearchRelaxation = _contract.ProgrammaticProductSearchRelaxation
ProgrammaticAttributeCounts = _contract.ProgrammaticAttributeCounts
ProgrammaticCategoryCount = _contract.ProgrammaticCategoryCount
ProgrammaticFacetCountsResponse = _contract.ProgrammaticFacetCountsResponse
ProgrammaticFacetValueCount = _contract.ProgrammaticFacetValueCount
ProgrammaticFacetValueCounts = _contract.ProgrammaticFacetValueCounts
TaxonomyAttribute = _contract.TaxonomyAttribute
TaxonomyAttributePage = _contract.TaxonomyAttributePage
TaxonomyAttributeValue = _contract.TaxonomyAttributeValue
TaxonomyAttributeValuePage = _contract.TaxonomyAttributeValuePage
TaxonomyCategory = _contract.TaxonomyCategory
TaxonomyCategoryPage = _contract.TaxonomyCategoryPage


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


class ProductLookupMatchMode(StrEnum):
    """Index match strictness for ``POST /v1/products/lookup``.

    ``LOOSE`` is the server default: it also resolves URLs differing from the
    indexed product only by path case, a non-indexed query parameter, or a
    Shopify collection-scoped path.
    """

    STRICT = "strict"
    LOOSE = "loose"


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


def _validate_catalog_keys(catalogs: list[str] | None) -> list[str] | None:
    # Length bounds live on the field; this rejects the blank key the contract
    # would accept and then match nothing with. Keys are otherwise sent as given.
    if catalogs is not None and any(not key.strip() for key in catalogs):
        raise ValueError("catalogs must contain only non-empty catalog keys")
    return catalogs


def _validate_brand_names(brands: list[str] | None) -> list[str] | None:
    if brands is not None and any(not brand.strip() for brand in brands):
        raise ValueError("similar_to_brands must contain only non-empty brand names")
    return brands


def _validate_fallback_category(path: list[str] | None) -> list[str] | None:
    if path is not None and any(not part.strip() for part in path):
        raise ValueError("fallback_category must contain only non-empty category names")
    return path


def _facet_names(facets: list[Facet] | None, field: str) -> set[str]:
    """Reject a repeated facet name; return the names for cross-field checks."""
    names: set[str] = set()
    for facet in facets or ():
        if facet.name in names:
            raise ValueError(
                f"{field} lists facet {facet.name!r} more than once; "
                "put every value in one entry"
            )
        names.add(facet.name)
    return names


class ProgrammaticProductSearchRequest(_RequestModel):
    """Body for ``POST /v1/products/search``: free text, filters, or both.

    Each field controls one thing. The combinations the server refuses with a
    ``422`` and that are cheap to mirror — ``relax`` without an understood
    ``q``, a facet name sent twice, ``price_min`` above ``price_max`` — fail
    here instead. The server stays the source of truth for everything else.
    """

    q: str | None = None
    understand: bool | None = None
    facets: list[Facet] | None = Field(default=None, max_length=50)
    exclude_facets: list[Facet] | None = Field(default=None, max_length=50)
    omit_generated_facets: list[str] | None = Field(default=None, max_length=50)
    price_min: float | None = Field(default=None, ge=0)
    price_max: float | None = Field(default=None, ge=0)
    brand_quality_min: float | None = Field(default=None, ge=1, le=6)
    brand_quality_max: float | None = Field(default=None, ge=1, le=6)
    similar_to_brands: list[str] | None = Field(
        default=None, min_length=1, max_length=10
    )
    #: Category path, root first (1-4 names as the ``category_path.depth_N``
    #: facets accept them), searched when understanding finds no category.
    fallback_category: list[str] | None = Field(
        default=None, min_length=1, max_length=4
    )
    # An empty list is refused rather than sent: omitting the field already
    # means every catalog.
    catalogs: list[str] | None = Field(default=None, min_length=1, max_length=500)
    limit: int = Field(default=50, ge=1, le=100)
    cursor: str | None = None
    relax: bool | None = None
    diversity: bool | None = None
    debug: bool | None = None

    _check_catalog_keys = field_validator("catalogs")(_validate_catalog_keys)
    _check_brand_names = field_validator("similar_to_brands")(_validate_brand_names)
    _check_fallback_category = field_validator("fallback_category")(
        _validate_fallback_category
    )

    @model_validator(mode="after")
    def reject_contradictions(self) -> ProgrammaticProductSearchRequest:
        # The server treats a blank `q` as omitted.
        has_query = self.q is not None and bool(self.q.strip())
        understood = self.understand is not False
        if not understood and not has_query:
            raise ValueError("understand=False requires q")
        if self.relax and not (has_query and understood):
            raise ValueError(
                "relax requires an understood q (q set, understand not False)"
            )
        if self.omit_generated_facets and not (has_query and understood):
            raise ValueError(
                "omit_generated_facets requires an understood q "
                "(q set, understand not False)"
            )
        if self.fallback_category is not None and not (has_query and understood):
            raise ValueError(
                "fallback_category requires an understood q "
                "(q set, understand not False)"
            )

        facet_names = _facet_names(self.facets, "facets")
        _facet_names(self.exclude_facets, "exclude_facets")
        for name in self.omit_generated_facets or ():
            if name in facet_names:
                raise ValueError(
                    f"facet {name!r} is in both facets and omit_generated_facets; "
                    "a facet you send already replaces the understood one"
                )

        for field in ("price", "brand_quality"):
            low = getattr(self, f"{field}_min")
            high = getattr(self, f"{field}_max")
            if low is not None and high is not None and low > high:
                raise ValueError(f"{field}_min must not exceed {field}_max")
        return self


FacetCountName = Literal["color_family", "category_path.depth_0"]


class ProgrammaticFacetCountCategory(_RequestModel):
    """One category to count, named by the facets that select it.

    A :class:`TaxonomyCategory`'s ``facets`` go here unchanged.
    """

    key: str = Field(min_length=1, max_length=200)
    facets: list[Facet] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def reject_repeated_facets(self) -> ProgrammaticFacetCountCategory:
        _facet_names(self.facets, f"category {self.key!r}")
        return self


class ProgrammaticFacetCountsRequest(_RequestModel):
    """Body for ``POST /v1/products/facet-counts``.

    The filter fields mean what they mean on
    :class:`ProgrammaticProductSearchRequest`; ``q`` is always understood, and
    only its understood filters narrow the counts. ``categories``,
    ``attributes`` and ``facet_names`` say what to count. The contradictions
    the server refuses with a ``422`` and that are cheap to mirror fail here.
    """

    q: str | None = None
    facets: list[Facet] | None = Field(default=None, max_length=50)
    exclude_facets: list[Facet] | None = Field(default=None, max_length=50)
    omit_generated_facets: list[str] | None = Field(default=None, max_length=50)
    fallback_category: list[str] | None = Field(
        default=None, min_length=1, max_length=4
    )
    price_min: float | None = Field(default=None, ge=0)
    price_max: float | None = Field(default=None, ge=0)
    brand_quality_min: float | None = Field(default=None, ge=1, le=6)
    brand_quality_max: float | None = Field(default=None, ge=1, le=6)
    catalogs: list[str] | None = Field(default=None, min_length=1, max_length=500)
    categories: list[ProgrammaticFacetCountCategory] | None = Field(
        default=None, max_length=100
    )
    attributes: list[str] | None = Field(default=None, max_length=50)
    #: ``None`` sends nothing, and the server counts ``color_family``.
    facet_names: list[FacetCountName] | None = Field(default=None, max_length=2)
    value_limit: int | None = Field(default=None, ge=1, le=1000)

    _check_catalog_keys = field_validator("catalogs")(_validate_catalog_keys)
    _check_fallback_category = field_validator("fallback_category")(
        _validate_fallback_category
    )

    @model_validator(mode="after")
    def reject_contradictions(self) -> ProgrammaticFacetCountsRequest:
        has_query = self.q is not None and bool(self.q.strip())
        if self.omit_generated_facets and not has_query:
            raise ValueError("omit_generated_facets requires q")
        if self.fallback_category is not None and not has_query:
            raise ValueError("fallback_category requires q")

        facet_names = _facet_names(self.facets, "facets")
        _facet_names(self.exclude_facets, "exclude_facets")
        for name in self.omit_generated_facets or ():
            if name in facet_names:
                raise ValueError(
                    f"facet {name!r} is in both facets and omit_generated_facets; "
                    "a facet you send already replaces the understood one"
                )
        for field in ("price", "brand_quality"):
            low = getattr(self, f"{field}_min")
            high = getattr(self, f"{field}_max")
            if low is not None and high is not None and low > high:
                raise ValueError(f"{field}_min must not exceed {field}_max")

        keys = [category.key for category in self.categories or ()]
        if len(set(keys)) != len(keys):
            raise ValueError("categories keys must be unique")
        for field in ("attributes", "facet_names"):
            values = getattr(self, field) or []
            if len(set(values)) != len(values):
                raise ValueError(f"{field} lists a value more than once")
        if self.facet_names == [] and not (self.categories or self.attributes):
            raise ValueError(
                "nothing to count: send categories, attributes or facet_names"
            )
        return self


class ProgrammaticProductLookupRequest(_RequestModel):
    """Product lookup request."""

    url: str = Field(min_length=1)
    match_mode: ProductLookupMatchMode | None = Field(
        default=None,
        alias="matchMode",
    )
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


class ProgrammaticResolveFromHtmlRequest(_RequestModel):
    """Body for ``POST /v1/products/resolve-from-html``."""

    html: str = Field(min_length=1, max_length=5_242_880)
    url: str | None = Field(default=None, min_length=1)


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
    """More Like This request, optionally restricted to a catalog allowlist.

    ``catalogs`` restricts the *results*; the source product may live outside it.
    ``facets``, ``exclude_facets`` and the price and brand-quality bounds mean
    what they mean on search, and the same cheap ``422`` rules fail here: a
    facet name sent twice, a minimum above its maximum. ``include_facets`` is
    gone; ``facets`` replaces it and the server refuses the old name.

    ``relax`` is left out unless set, so the server default (``True``) applies:
    a short page 1 is retried with Platform's generated facets dropped, never
    the ones you sent.
    """

    source: ProgrammaticMoreLikeThisSource
    catalogs: list[str] | None = Field(default=None, min_length=1, max_length=100)
    cursor: str | None = None
    limit: int = Field(default=12, ge=1, le=100)
    facets: list[Facet] | None = Field(default=None, max_length=50)
    exclude_facets: list[Facet] | None = Field(default=None, max_length=50)
    price_min: float | None = Field(default=None, ge=0)
    price_max: float | None = Field(default=None, ge=0)
    brand_quality_min: float | None = Field(default=None, ge=1, le=6)
    brand_quality_max: float | None = Field(default=None, ge=1, le=6)
    price_preference: PricePreference = PricePreference.ANY
    relax: bool | None = None
    debug: bool = False

    _check_catalog_keys = field_validator("catalogs")(_validate_catalog_keys)

    @model_validator(mode="after")
    def reject_contradictions(self) -> ProgrammaticMoreLikeThisRequest:
        _facet_names(self.facets, "facets")
        _facet_names(self.exclude_facets, "exclude_facets")
        for field in ("price", "brand_quality"):
            low = getattr(self, f"{field}_min")
            high = getattr(self, f"{field}_max")
            if low is not None and high is not None and low > high:
                raise ValueError(f"{field}_min must not exceed {field}_max")
        return self


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
    brand_quality_min: float | None = Field(default=None, alias="brandQualityMin")
    brand_quality_max: float | None = Field(default=None, alias="brandQualityMax")
    #: What relaxation did, in search's shape (``rounds`` is 0 when page 1
    #: needed none). ``None`` with ``relax=False``.
    relaxation: ProgrammaticProductSearchRelaxation | None = None
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


class MerchantProductImageMetadataView(_ResponseModel):
    """One product image: source URL, Octogen-hosted copy, and display metadata.

    ``url`` is the merchant source; ``cdn_url`` is the hosted copy — prefer it
    and fall back to ``url``.
    """

    url: str
    cdn_url: str | None = Field(default=None, alias="cdnUrl")
    width: int | None = None
    height: int | None = None
    size_bytes: int | None = Field(default=None, alias="sizeBytes")
    mime_type: str | None = Field(default=None, alias="mimeType")


class MerchantProductListItem(_ResponseModel):
    uuid: str
    catalog_key: str | None = Field(default=None, alias="catalogKey")
    product_url: str = Field(alias="productUrl")
    title: str | None = None
    brand: BrandView | None = None
    current_price: float | None = Field(default=None, alias="currentPrice")
    original_price: float | None = Field(default=None, alias="originalPrice")
    #: Deprecated: primary image CDN URL, kept populated during migration.
    #: Read ``primary_image`` instead.
    image_url: str | None = Field(default=None, alias="imageUrl")
    primary_image: MerchantProductImageMetadataView | None = Field(
        default=None, alias="primaryImage"
    )
    images: list[MerchantProductImageMetadataView] = Field(default_factory=list)
    rating: RatingView | None = None
    is_active: bool = Field(default=True, alias="isActive")
    raw_score: float | None = Field(default=None, alias="rawScore")
    display_match_score: int | None = Field(default=None, alias="displayMatchScore")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")
    # Card fields on search and more-like-this results; ``None`` when the
    # product does not carry them or the server predates them.
    #: ISO 4217 currency of the prices; ``None`` when unknown or mixed.
    currency: str | None = None
    #: Product-family availability, not a particular color's or size's stock.
    in_stock: bool | None = Field(default=None, alias="inStock")
    #: Product-family color labels; the linked variant may differ.
    colors: list[str] | None = None
    sizes: list[str] | None = None
    #: ``"male"``, ``"female"`` or ``"unisex"``; ``None`` when unknown or
    #: when several are listed. Typed open so a new value never fails parsing.
    gender: str | None = None
    #: Taxonomy category path, root first, in the names the
    #: ``category_path.depth_N`` facets accept.
    category_path: list[str] | None = Field(default=None, alias="categoryPath")
    catalog_display_name: str | None = Field(default=None, alias="catalogDisplayName")


class MerchantProductListPage(_ResponseModel):
    items: list[MerchantProductListItem] = Field(default_factory=list)
    next_cursor: str | None = Field(default=None, alias="nextCursor")


class ProgrammaticProductSearchPage(MerchantProductListPage):
    """One page of ``search_products`` results."""

    request_id: str | None = Field(default=None, alias="requestId")
    #: The search that actually ran. Present on every response; servers that
    #: predate it send it only with ``debug=True``.
    effective_query: ProgrammaticProductSearchEffectiveQuery | None = Field(
        default=None,
        alias="effectiveQuery",
    )


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


# Response enums are open — `Literal[...] | str` — so a value the server adds
# after this SDK was released parses instead of failing the whole response.
class ProductResolutionMetadata(_ResponseModel):
    completeness: Literal["complete", "partial"] | str
    method: (
        Literal[
            "json_ld", "open_graph", "html_meta", "resolved_url", "catalog_extractor"
        ]
        | str
    )
    rendered: bool | None = None
    missing_fields: list[str] | None = Field(
        default_factory=list, alias="missingFields"
    )


class MerchantProductUrlLookupResponse(_ResponseModel):
    request_id: str | None = Field(default=None, alias="requestId")
    source: Literal["indexed", "on_demand", "client_html"] | str
    catalog_key: str | None = Field(default=None, alias="catalogKey")
    catalog_display_name: str | None = Field(default=None, alias="catalogDisplayName")
    source_base_url: str | None = Field(default=None, alias="sourceBaseUrl")
    product: MerchantProductView
    requested_url: str | None = Field(default=None, alias="requestedUrl")
    resolved_url: str | None = Field(default=None, alias="resolvedUrl")
    normalized_url: str | None = Field(default=None, alias="normalizedUrl")
    canonical_url: str | None = Field(default=None, alias="canonicalUrl")
    resolution: ProductResolutionMetadata | None = None
    cache_status: Literal["hit", "miss", "refresh"] | str | None = Field(
        default=None,
        alias="cacheStatus",
    )
    #: Which index probe resolved the URL (``exact``, ``loose``,
    #: ``learned_alias:<rule_id>``, …). Informational; values may be extended.
    #: ``None`` for on-demand results.
    matched_via: str | None = Field(default=None, alias="matchedVia")
    warnings: list[str] | None = Field(default_factory=list)


class ProductMarkdownLookupResult(_ResponseModel):
    """A product rendered as Markdown, with the identity headers that name it.

    Returned by :meth:`OctogenClient.lookup_product_markdown`. Each header
    field is ``None`` when the response omits it.
    """

    markdown: str
    #: ``x-request-id``
    request_id: str | None = None
    #: ``x-octogen-product-uuid``
    product_uuid: str | None = None
    #: ``x-octogen-catalog``: the catalog key the product came from.
    catalog: str | None = None
    #: ``x-octogen-matched-via``: as ``MerchantProductUrlLookupResponse.matched_via``.
    matched_via: str | None = None
    #: ``x-octogen-normalized-url``
    normalized_url: str | None = None


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
    status: Literal["provisioning", "active", "delete_pending"] | str
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
