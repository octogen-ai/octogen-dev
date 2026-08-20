"""Generated from the published Octogen ``/v1`` contract. Do not edit.

Regenerate with ``npm run codegen`` (or ``uv run --project sdks/python --frozen
python tools/codegen/generate.py``). The snapshot lives in
``tests/fixtures/openapi/platform-v1.json``.

Only types are generated. The method layer in :mod:`octogen_ai_sdk.client` is
hand-written; these models are what it validates against.
"""

from __future__ import annotations
from typing import Any, Literal
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel
from datetime import date


class AttributeValue(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    handle: str = Field(..., title="Handle")
    name: str = Field(..., title="Name")


class AudienceView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    age_groups: list[str] | None = Field([], alias="ageGroups", title="Agegroups")
    genders: list[str] | None = Field([], title="Genders")


class BrandView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    description: str | None = Field(None, title="Description")
    name: str = Field(..., title="Name")
    slug: str | None = Field(None, title="Slug")
    url: str | None = Field(None, title="Url")


class BreadcrumbView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    name: str = Field(..., title="Name")
    url: str | None = Field(None, title="Url")


class CanonicalBrandEnrichment(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    brand_accessibility_index: str | None = Field(
        None, title="Brand Accessibility Index"
    )
    brand_community_perception: str | None = Field(
        None, title="Brand Community Perception"
    )
    brand_craft_production: str | None = Field(None, title="Brand Craft Production")
    brand_description: str | None = Field(None, title="Brand Description")
    brand_popularity_level: str | None = Field(None, title="Brand Popularity Level")
    brand_popularity_trend_direction: str | None = Field(
        None, title="Brand Popularity Trend Direction"
    )
    brand_positioning: str | None = Field(None, title="Brand Positioning")
    brand_quality_justification: str | None = Field(
        None, title="Brand Quality Justification"
    )
    brand_quality_score: float | None = Field(None, title="Brand Quality Score")
    directory_subheading: str | None = Field(None, title="Directory Subheading")
    domain: str | None = Field(None, title="Domain")
    facet_brand_cultural_anchors: list[str] | None = Field(
        None, title="Facet Brand Cultural Anchors"
    )
    facet_brand_ethics: list[str] | None = Field(None, title="Facet Brand Ethics")
    facet_brand_hype_cycle_stage: list[str] | None = Field(
        None, title="Facet Brand Hype Cycle Stage"
    )
    facet_brand_inclusivity: list[str] | None = Field(
        None, title="Facet Brand Inclusivity"
    )
    facet_key_people_names: list[str] | None = Field(
        None, title="Facet Key People Names"
    )
    facet_key_people_nationalities: list[str] | None = Field(
        None, title="Facet Key People Nationalities"
    )
    facet_origin_country: str | None = Field(None, title="Facet Origin Country")
    facet_price_tier: str | None = Field(None, title="Facet Price Tier")
    facet_style_identity: list[str] | None = Field(None, title="Facet Style Identity")
    facet_sustainability: list[str] | None = Field(None, title="Facet Sustainability")
    facet_target_audience: str | None = Field(None, title="Facet Target Audience")
    founded_year: int | None = Field(None, title="Founded Year")
    occasion_fit: str | None = Field(None, title="Occasion Fit")


class CategoryView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    name: str = Field(..., title="Name")
    url: str | None = Field(None, title="Url")


class ColorView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    hex_code: str | None = Field(None, alias="hexCode", title="Hexcode")
    label: str = Field(..., title="Label")
    swatch_url: str | None = Field(None, alias="swatchUrl", title="Swatchurl")


class CoverageAcceptedUrl(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    normalized_url: str = Field(..., alias="normalizedUrl", title="Normalizedurl")
    url: str = Field(..., title="Url")


class CoverageContainsResult(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    added_at: AwareDatetime | None = Field(..., alias="addedAt", title="Addedat")
    normalized_url: str = Field(..., alias="normalizedUrl", title="Normalizedurl")
    present: bool = Field(..., title="Present")
    url: str = Field(..., title="Url")


class CoverageRejectedUrl(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    code: Literal["invalid_url"] = Field(..., title="Code")
    message: str = Field(..., title="Message")
    url: str = Field(..., title="Url")


class CoverageUrlListBigQuery(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    exchange_id: str = Field(..., alias="exchangeId", title="Exchangeid")
    last_exported_at: AwareDatetime | None = Field(
        ..., alias="lastExportedAt", title="Lastexportedat"
    )
    last_row_count: int | None = Field(..., alias="lastRowCount", title="Lastrowcount")
    listing_id: str = Field(..., alias="listingId", title="Listingid")
    reader_count: int = Field(..., alias="readerCount", title="Readercount")
    shared_dataset_id: str = Field(
        ..., alias="sharedDatasetId", title="Shareddatasetid"
    )
    view_id: str = Field(..., alias="viewId", title="Viewid")


class CoverageUrlListCreateRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    name: str = Field(
        ...,
        description="List name, unique among your live (provisioning/active) lists. Surrounding whitespace is trimmed. The name is released when a list is deleted.",
        title="Name",
    )


class CoverageUrlListUrl(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    added_at: AwareDatetime = Field(..., alias="addedAt", title="Addedat")
    normalized_url: str = Field(..., alias="normalizedUrl", title="Normalizedurl")
    url: str = Field(..., title="Url")


class CoverageUrlListUrlsResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    items: list[CoverageUrlListUrl] = Field(..., title="Items")
    next_cursor: str | None = Field(..., alias="nextCursor", title="Nextcursor")


class CoverageUrlMutationResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    accepted: list[CoverageAcceptedUrl] = Field(..., title="Accepted")
    rejected: list[CoverageRejectedUrl] = Field(..., title="Rejected")
    request_id: str = Field(..., alias="requestId", title="Requestid")
    url_count: int = Field(..., alias="urlCount", title="Urlcount")


class CoverageUrlsRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    urls: list[str] = Field(
        ...,
        description="Product URLs, each at most 2,048 characters. Each entry must be an http(s) URL with a dotted hostname; invalid entries are rejected per-URL, not as a request error.",
        title="Urls",
    )


class DomainEntry(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    catalog: str = Field(
        ..., description="Catalog key covering the host.", title="Catalog"
    )
    catalog_display_name: str = Field(
        ...,
        alias="catalogDisplayName",
        description="Human-readable display name for the catalog.",
        title="Catalogdisplayname",
    )
    host: str = Field(
        ...,
        description="Normalized host covered by a catalog (e.g. `allbirds.com`, `www.allbirds.com`). Match a page's host against this set before calling `/products/lookup`.",
        title="Host",
    )


class IdentifiersView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    gtin: str | None = Field(None, title="Gtin")
    product_group_id: str | None = Field(
        None, alias="productGroupId", title="Productgroupid"
    )
    product_id: str | None = Field(None, alias="productId", title="Productid")


class ListDomainsResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    domains: list[DomainEntry] = Field(
        ...,
        description="Every covered host, one entry per `(host, catalog)` pair.",
        title="Domains",
    )


class MeKey(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: str = Field(
        ..., description="Key id (the middle segment of the API key).", title="Id"
    )
    prefix: str | None = Field(
        None,
        description="Non-secret display prefix, e.g. `octo_live_3f9c1a2b4d`. Safe to print and log: the secret segment of the key is never included. `null` only when the key's metadata row cannot be read.",
        title="Prefix",
    )
    source: str | None = Field(
        None,
        description="How the key was created (`ui`, `coding_agent`, or `id_jag`). **Omitted entirely** — not `null` — while the backing column does not exist yet (agent-onboarding plan Phase 2). Treat an absent field as *unknown*, never as *no source*.",
        title="Source",
    )


class MeOrganization(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    id: str = Field(..., description="Octogen organization id (a UUID).", title="Id")
    name: str = Field(
        ..., description="Human-readable organization name.", title="Name"
    )
    slug: str = Field(..., description="URL-safe organization slug.", title="Slug")
    type: Literal["merchant", "catalog_partner"] = Field(
        ...,
        description="Organization type. `catalog_partner` (labelled *Developer* in the Platform UI) is the only type allowed on `/v1`; a `merchant` key is refused everywhere on `/v1`, including this endpoint, so this field explains a `403` rather than being a way around it.",
        title="Type",
    )


class MeRateLimit(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    limit: int = Field(
        ..., description="Requests allowed per window for this caller.", title="Limit"
    )
    remaining: int = Field(
        ..., description="Tokens left in the bucket right now.", title="Remaining"
    )
    reset_at: AwareDatetime = Field(
        ...,
        alias="resetAt",
        description="When the bucket is fully refilled (UTC, RFC 3339).",
        title="Resetat",
    )


class MerchantProductImageMetadataView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    cdn_url: str | None = Field(
        None,
        alias="cdnUrl",
        description="Octogen-hosted CDN copy of this image, or null when no hosted copy exists yet. Prefer it and fall back to url.",
        title="Cdnurl",
    )
    height: int | None = Field(
        None, description="Pixel height of the hosted image.", title="Height"
    )
    mime_type: str | None = Field(
        None,
        alias="mimeType",
        description="Image format of the hosted copy (predominantly image/webp).",
        title="Mimetype",
    )
    size_bytes: int | None = Field(
        None,
        alias="sizeBytes",
        description="File size of the hosted image in bytes.",
        title="Sizebytes",
    )
    url: str = Field(
        ...,
        description="Original image URL on the merchant storefront. Always present.",
        title="Url",
    )
    width: int | None = Field(
        None, description="Pixel width of the hosted image.", title="Width"
    )


class MerchantVariantView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    color: ColorView | None = None
    image_url: str | None = Field(None, alias="imageUrl", title="Imageurl")
    in_stock: bool | None = Field(None, alias="inStock", title="Instock")
    product_url: str | None = Field(None, alias="productUrl", title="Producturl")
    size: str | None = Field(None, title="Size")
    sku: str | None = Field(None, title="Sku")


class ProductDetailsView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    dimensions: str | None = Field(None, title="Dimensions")
    fit: list[str] | None = Field([], title="Fit")
    materials: list[str] | None = Field([], title="Materials")
    patterns: list[str] | None = Field([], title="Patterns")


class ProductResolutionMetadata(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    completeness: Literal["complete", "partial"] = Field(..., title="Completeness")
    method: Literal["json_ld", "open_graph", "html_meta", "resolved_url"] = Field(
        ..., title="Method"
    )
    missing_fields: list[str] | None = Field(
        None, alias="missingFields", title="Missingfields"
    )
    rendered: bool | None = Field(False, title="Rendered")


class ProgrammaticMoreLikeThisEffectiveFacet(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    name: str = Field(..., title="Name")
    values: list[str] = Field(..., title="Values")


class ProgrammaticMoreLikeThisImageSource(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    b64: str | None = Field(
        None,
        description="Base64-encoded image bytes (decoded size capped at 8 MB).",
        title="B64",
    )
    url: str | None = Field(
        None,
        description="HTTP(S) image URL, fetched server-side. Only hosts on the deployment allowlist are permitted.",
        title="Url",
    )


class ProgrammaticMoreLikeThisMatchedProduct(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    catalog_key: str | None = Field(None, alias="catalogKey", title="Catalogkey")
    uuid: str | None = Field(None, title="Uuid")


class ProgrammaticMoreLikeThisSource(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    image: ProgrammaticMoreLikeThisImageSource | None = Field(
        None,
        description="Source image to derive the query from (OCT-3654). Slower than url/uuid sources: the image runs through query generation (~5-8s typical).",
    )
    url: str | None = Field(
        None,
        description="Canonical product URL to use as the source product.",
        title="Url",
    )
    uuid: str | None = Field(
        None,
        description="Indexed product UUID to use as the source product.",
        title="Uuid",
    )


class ProgrammaticMoreLikeThisSourceImageResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    hash: str = Field(
        ..., description="Content hash of the submitted image bytes.", title="Hash"
    )


class ProgrammaticMoreLikeThisSourceResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    catalog_key: str = Field(..., alias="catalogKey", title="Catalogkey")
    product_url: str = Field(..., alias="productUrl", title="Producturl")
    title: str | None = Field(None, title="Title")
    uuid: str = Field(..., title="Uuid")


class ProgrammaticProductLookupRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    match_mode: Literal["strict", "loose"] | None = Field(
        "loose",
        alias="matchMode",
        description="Index match strictness. strict matches only exact/canonical URLs. loose (default) adds a lowest-priority fallback that ignores path case and query params, so a URL differing from an indexed product only by case (e.g. /Women/ vs /women/) or a non-indexed query param (e.g. Zara's ?v1=) still resolves. It also recognizes structural aliases: Shopify collection-scoped URLs (/collections/<x>/products/<handle>) resolve to the canonical /products/<handle> product. A strict/canonical hit always wins over a loose or alias one.",
        title="Matchmode",
    )
    on_demand_cache_policy: Literal["prefer_cache", "refresh"] | None = Field(
        "prefer_cache",
        alias="onDemandCachePolicy",
        description="Cache behavior when the request enters the on-demand path.",
        title="ProductResolverCachePolicyV1",
    )
    resolution_mode: Literal["auto", "index_only", "on_demand_only"] | None = Field(
        "auto",
        alias="resolutionMode",
        description="Source selection policy. auto checks the index before resolving on demand; index_only never performs outbound work; on_demand_only skips the index.",
        title="Resolutionmode",
    )
    url: str | None = Field(
        None,
        description="Product URL to look up in the organization's granted catalogs and, when enabled and requested, resolve on demand.",
        title="Url",
    )


class ProgrammaticProductRefreshAcceptedTarget(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    catalog: str = Field(..., title="Catalog")
    url: str = Field(..., title="Url")


class ProgrammaticProductRefreshTarget(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    catalog: str | None = Field(
        None,
        description="Optional catalog key to scope or disambiguate URL refresh targets.",
        title="Catalog",
    )
    url: str | None = Field(None, description="Product URL to refresh.", title="Url")
    uuid: str | None = Field(
        None, description="Indexed product UUID to refresh.", title="Uuid"
    )


class ProgrammaticResolveFromHtmlRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    html: str = Field(
        ...,
        description="Product page HTML to resolve. Capped at 5 MiB — the same bound the live on-demand fetch path enforces, so any page that path could retrieve is submittable here.",
        title="Html",
    )
    url: str | None = Field(
        None,
        description="Optional, but strongly recommended: the page's source URL, ideally location.href read at the same instant the DOM was serialized. It anchors relative image URLs and JSON-LD candidate selection exactly like the live path's final fetched URL, and it is echoed back as requestedUrl — on storefronts that record an in-page variant selection only in the URL's query parameters, this is the only variant-qualified identity the response retains. When absent the page itself must declare its canonical URL (JSON-LD url, og:url, or link rel=canonical) or resolution fails with product_not_found.",
        title="Url",
    )


class PromotionView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    code: str | None = Field(None, title="Code")
    description: str | None = Field(None, title="Description")
    promotion_id: str | None = Field(None, alias="promotionId", title="Promotionid")


class RatingView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    average: float | None = Field(None, title="Average")
    count: int | None = Field(None, title="Count")


class ReviewView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    author: str | None = Field(None, title="Author")
    body: str | None = Field(None, title="Body")
    published_at: AwareDatetime | None = Field(
        None, alias="publishedAt", title="Publishedat"
    )
    rating: float | None = Field(None, title="Rating")


class ValidationError(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    ctx: dict[str, Any] | None = Field(None, title="Context")
    input: Any | None = Field(None, title="Input")
    loc: list[str | int] = Field(..., title="Location")
    msg: str = Field(..., title="Message")
    type: str = Field(..., title="Error Type")


class VideoView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    name: str | None = Field(None, title="Name")
    thumbnail_url: str | None = Field(None, alias="thumbnailUrl", title="Thumbnailurl")
    url: str | None = Field(None, title="Url")


class VoyageError(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    code: str = Field(..., title="Code")
    message: str = Field(..., title="Message")


class VoyageQuotaConcurrent(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    limit: int | None = Field(None, title="Limit")
    used: int | None = Field(None, title="Used")


class VoyageQuotaMonthly(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    limit: int | None = Field(None, title="Limit")
    period_start: date | None = Field(None, alias="periodStart", title="Periodstart")
    resets_at: AwareDatetime | None = Field(None, alias="resetsAt", title="Resetsat")
    used: int | None = Field(None, title="Used")


class VoyageQuotas(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    concurrent: VoyageQuotaConcurrent
    monthly: VoyageQuotaMonthly


class VoyageResultEndpoints(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    lookup: str | None = Field("/v1/products/lookup", title="Lookup")
    search: str | None = Field("/v1/products/search", title="Search")


class VoyageStartRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    domain: str = Field(
        ...,
        description="Registrable domain or full URL. The server normalizes it (lowercase; scheme, path, port, and leading `www.` stripped) and echoes the normalized form back as `domain`.",
        title="Domain",
    )


class Attribute(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    handle: str = Field(..., title="Handle")
    name: str = Field(..., title="Name")
    values: list[AttributeValue] | None = Field(None, title="Values")


class CanonicalBrand(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    brand_enrichment: CanonicalBrandEnrichment | None = Field(
        None, description="Canonical brand enrichment data for filtering and display."
    )
    brand_name: str = Field(..., title="Brand Name")
    brand_slug: str | None = Field(
        None, description="Canonical slug for the brand.", title="Brand Slug"
    )
    brand_synonyms: list[str] | None = Field(
        None, description="Alternate names for the brand.", title="Brand Synonyms"
    )
    brand_uuid: str = Field(..., title="Brand Uuid")


class CoverageContainsResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    results: list[CoverageContainsResult] = Field(..., title="Results")


class CoverageUrlList(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    big_query: CoverageUrlListBigQuery | None = Field(..., alias="bigQuery")
    created_at: AwareDatetime = Field(..., alias="createdAt", title="Createdat")
    name: str = Field(..., title="Name")
    status: Literal["provisioning", "active", "delete_pending"] = Field(
        ..., title="Status"
    )
    updated_at: AwareDatetime = Field(..., alias="updatedAt", title="Updatedat")
    url_count: int = Field(..., alias="urlCount", title="Urlcount")
    url_list_id: str = Field(..., alias="urlListId", title="Urllistid")


class CoverageUrlListListResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    items: list[CoverageUrlList] = Field(..., title="Items")
    next_cursor: str | None = Field(..., alias="nextCursor", title="Nextcursor")


class Facet(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    name: (
        str
        | Literal[
            "brand_name",
            "brand_slug",
            "raw_brand_name",
            "product_type",
            "gender",
            "age_groups",
            "color",
            "color_family",
            "is_activewear",
            "category_path.depth_0",
            "category_path.depth_1",
            "category_path.depth_2",
            "category_path.depth_3",
            "category_path.depth_4",
            "category_path.depth_5",
            "category_path.depth_6",
        ]
    ) = Field(
        ...,
        description="Facet key. Accepts base facets (FacetName) or attribute keys. Attribute facets may be provided as '<key>' (e.g., 'fit') or fully qualified 'attribute_facets.<key>'.",
        title="Name",
    )
    values: list[str] = Field(
        ...,
        description="List of values to filter by. They should all be lowercase. Facet values can be phrases, so make sure to include the spaces.",
        title="Values",
    )


class HTTPValidationError(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    detail: list[ValidationError] | None = Field(None, title="Detail")


class MeQuotas(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    voyage: VoyageQuotas | None = Field(
        None,
        description="Voyage quota usage — the same block `GET /v1/voyage` returns. `null` for callers with no organization quota.",
    )


class MeResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    key: MeKey | None = Field(
        None, description="The calling API key; `null` for a super admin."
    )
    organization: MeOrganization | None = Field(
        None, description="The credential's organization; `null` for a super admin."
    )
    principal: Literal["api_key", "super_admin"] = Field(
        ...,
        description="Which credential kind authenticated this request.",
        title="Principal",
    )
    quotas: MeQuotas | None = Field(
        None,
        description="Resource quotas for the organization; `null` for a super admin.",
    )
    rate_limit: MeRateLimit | None = Field(
        None,
        alias="rateLimit",
        description="Current rate-limit posture; `null` when the limiter is off.",
    )


class MerchantProductListItem(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    brand: BrandView | None = None
    catalog_key: str | None = Field(
        None,
        alias="catalogKey",
        description="Catalog that supplied this product. Present for search/list results so cross-catalog searches can link back to the correct catalog.",
        title="Catalogkey",
    )
    current_price: float | None = Field(
        None, alias="currentPrice", title="Currentprice"
    )
    display_match_score: int | None = Field(
        None,
        alias="displayMatchScore",
        description="User-facing match score normalized for the current result set. This is intended for display only and is not comparable across queries.",
        title="Displaymatchscore",
    )
    image_url: str | None = Field(
        None,
        alias="imageUrl",
        description="Deprecated: primary image CDN URL, kept populated during migration. Read primaryImage instead.",
        title="Imageurl",
    )
    images: list[MerchantProductImageMetadataView] | None = Field([], title="Images")
    is_active: bool | None = Field(True, alias="isActive", title="Isactive")
    original_price: float | None = Field(
        None, alias="originalPrice", title="Originalprice"
    )
    primary_image: MerchantProductImageMetadataView | None = Field(
        None,
        alias="primaryImage",
        description="The product's display image with full metadata. Its url is the merchant source URL; cdnUrl carries the hosted copy when one exists.",
    )
    product_url: str = Field(..., alias="productUrl", title="Producturl")
    rating: RatingView | None = None
    raw_score: float | None = Field(
        None,
        alias="rawScore",
        description="Raw Elasticsearch score for the source hit. Useful for debugging; not normalized across queries or strategies.",
        title="Rawscore",
    )
    title: str | None = Field(None, title="Title")
    updated_at: AwareDatetime | None = Field(None, alias="updatedAt", title="Updatedat")
    uuid: str = Field(..., title="Uuid")


class ProductEnrichment(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    age_groups: list[Literal["infant", "toddler", "kids", "adult"]] | None = Field(
        ..., description="Target age groups for the product.", title="Age Groups"
    )
    attribute_handles: dict[str, list[str]] | None = Field(
        None,
        description="Taxonomy attributes keyed by Attribute.handle with values as AttributeValue.handle lists.",
        title="Attribute Handles",
    )
    attributes: dict[str, list[str]] | None = Field(
        None,
        description="Shopify taxonomy attributes mapped to their values.",
        title="Attributes",
    )
    brand_id: str | None = Field(
        None,
        description="Unique brand identifier in the product_brands table.",
        title="Brand Id",
    )
    canonical_brand: CanonicalBrand | None = Field(
        None, description="Canonical brand identifier in the product_brands table."
    )
    category_path: list[str] | None = Field(
        None,
        description="Shopify taxonomy category path (excluding 'Apparel & Accessories' root).",
        title="Category Path",
    )
    classification: dict[str, list[str]] | None = Field(
        None,
        description="Classification-axis values keyed by axis handle (e.g. {'gender': ['female'], 'age_group': ['adult']}). Only axes the product's taxonomy section declares are present.",
        title="Classification",
    )
    color: (
        list[
            Literal[
                "aliceblue",
                "antiquewhite",
                "aqua",
                "aquamarine",
                "azure",
                "beige",
                "bisque",
                "black",
                "blanchedalmond",
                "blue",
                "blueviolet",
                "bronze",
                "brown",
                "burlywood",
                "cadetblue",
                "chartreuse",
                "chocolate",
                "coral",
                "cornflowerblue",
                "cornsilk",
                "crimson",
                "cyan",
                "darkblue",
                "darkcyan",
                "darkgoldenrod",
                "darkgray",
                "darkgreen",
                "darkgrey",
                "darkkhaki",
                "darkmagenta",
                "darkolivegreen",
                "darkorange",
                "darkorchid",
                "darkred",
                "darksalmon",
                "darkseagreen",
                "darkslateblue",
                "darkslategray",
                "darkslategrey",
                "darkturquoise",
                "darkviolet",
                "deeppink",
                "deepskyblue",
                "dimgray",
                "dimgrey",
                "dodgerblue",
                "firebrick",
                "floralwhite",
                "forestgreen",
                "fuchsia",
                "gainsboro",
                "ghostwhite",
                "gold",
                "goldenrod",
                "gray",
                "green",
                "greenyellow",
                "grey",
                "honeydew",
                "hotpink",
                "indianred",
                "indigo",
                "ivory",
                "khaki",
                "lavender",
                "lavenderblush",
                "lawngreen",
                "lemonchiffon",
                "lightblue",
                "lightcoral",
                "lightcyan",
                "lightgoldenrodyellow",
                "lightgray",
                "lightgreen",
                "lightgrey",
                "lightpink",
                "lightsalmon",
                "lightseagreen",
                "lightskyblue",
                "lightslategray",
                "lightslategrey",
                "lightsteelblue",
                "lightyellow",
                "lime",
                "limegreen",
                "linen",
                "magenta",
                "maroon",
                "mediumaquamarine",
                "mediumblue",
                "mediumorchid",
                "mediumpurple",
                "mediumseagreen",
                "mediumslateblue",
                "mediumspringgreen",
                "mediumturquoise",
                "mediumvioletred",
                "midnightblue",
                "mintcream",
                "mistyrose",
                "multi",
                "moccasin",
                "navajowhite",
                "navy",
                "oldlace",
                "olive",
                "olivedrab",
                "orange",
                "orangered",
                "orchid",
                "palegoldenrod",
                "palegreen",
                "paleturquoise",
                "palevioletred",
                "papayawhip",
                "peachpuff",
                "peru",
                "pink",
                "plum",
                "powderblue",
                "purple",
                "rebeccapurple",
                "red",
                "rosybrown",
                "royalblue",
                "saddlebrown",
                "salmon",
                "sandybrown",
                "seagreen",
                "seashell",
                "sienna",
                "silver",
                "skyblue",
                "slateblue",
                "slategray",
                "slategrey",
                "snow",
                "springgreen",
                "steelblue",
                "tan",
                "teal",
                "thistle",
                "tomato",
                "turquoise",
                "violet",
                "wheat",
                "white",
                "whitesmoke",
                "yellow",
                "yellowgreen",
            ]
        ]
        | None
    ) = Field(
        None,
        description="List of specific colors of the product matched from existing color fields (e.g., ['Crimson', 'Navy Blue']).",
        title="Color",
    )
    color_family: (
        list[
            Literal[
                "Pink",
                "Red",
                "Orange",
                "Brown",
                "Yellow",
                "Green",
                "Blue",
                "Purple",
                "White",
                "Gray",
                "Black",
                "Multicolor",
            ]
        ]
        | None
    ) = Field(
        None,
        description="List of color families corresponding to each color by index (e.g., ['Red', 'Blue']).",
        title="Color Family",
    )
    color_indices: list[int] | None = Field(
        None,
        description="Indices of the resolved colors in the palette.",
        title="Color Indices",
    )
    fully_qualified_name: str | None = Field(
        None,
        description="Fully qualified taxonomy path for the resolved category.",
        title="Fully Qualified Name",
    )
    gender: Literal["male", "female", "unisex"] | None = Field(
        ..., description="The target gender of the product."
    )
    image_with_single_product: bool | None = Field(
        None,
        description="Whether the image only contains a single product.",
        title="Image With Single Product",
    )
    is_activewear: bool | None = Field(
        None,
        description="Whether the product is activewear/athleisure (e.g., sports bras, running shorts).",
        title="Is Activewear",
    )
    structured_attributes: list[Attribute] | None = Field(
        None,
        description="Taxonomy attributes with full metadata and typed values.",
        title="Structured Attributes",
    )
    styles: list[str] | None = Field(
        None, description="Styles for the product.", title="Styles"
    )
    summary: str | None = Field(
        None, description="Summary of the product.", title="Summary"
    )
    tags: list[str] | None = Field(
        None, description="Tags for the product.", title="Tags"
    )
    taxonomy_uuid: str | None = Field(
        None, description="UUID of the resolved taxonomy node.", title="Taxonomy Uuid"
    )
    type: str | None = Field(None, description="Type of the product.", title="Type")
    type_synonyms: list[str] | None = Field(
        None, description="Synonyms for the type of the product.", title="Type Synonyms"
    )


class ProgrammaticMoreLikeThisEffectiveQuery(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    catalogs: list[str] | None = Field(None, title="Catalogs")
    degraded_to_text_fallback: bool | None = Field(
        None, alias="degradedToTextFallback", title="Degradedtotextfallback"
    )
    exclusion_facets: list[ProgrammaticMoreLikeThisEffectiveFacet] | None = Field(
        None, alias="exclusionFacets", title="Exclusionfacets"
    )
    facets: list[ProgrammaticMoreLikeThisEffectiveFacet] | None = Field(
        None, title="Facets"
    )
    generation_stages: dict[str, float] | None = Field(
        None, alias="generationStages", title="Generationstages"
    )
    image_hash_matched: bool | None = Field(
        None, alias="imageHashMatched", title="Imagehashmatched"
    )
    limit: int = Field(..., title="Limit")
    matched_product: ProgrammaticMoreLikeThisMatchedProduct | None = Field(
        None, alias="matchedProduct"
    )
    price_max: float | None = Field(None, alias="priceMax", title="Pricemax")
    price_min: float | None = Field(None, alias="priceMin", title="Pricemin")
    ranking_embedding_columns: list[str] | None = Field(
        None, alias="rankingEmbeddingColumns", title="Rankingembeddingcolumns"
    )
    reconciled_facets: list[str] | None = Field(
        None, alias="reconciledFacets", title="Reconciledfacets"
    )
    relaxation_declined_rounds: int | None = Field(
        None, alias="relaxationDeclinedRounds", title="Relaxationdeclinedrounds"
    )
    relaxation_dropped_facets: list[ProgrammaticMoreLikeThisEffectiveFacet] | None = (
        Field(None, alias="relaxationDroppedFacets", title="Relaxationdroppedfacets")
    )
    relaxation_rounds: int | None = Field(
        None, alias="relaxationRounds", title="Relaxationrounds"
    )
    retrieval_embedding_columns: list[str] | None = Field(
        None, alias="retrievalEmbeddingColumns", title="Retrievalembeddingcolumns"
    )
    text: str = Field(..., title="Text")


class ProgrammaticMoreLikeThisRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    catalogs: list[str] | None = Field(
        None,
        description="Optional catalog allowlist for the similar-products retrieval (breaking replacement for the former single-valued `catalog`). Restricts RESULTS to these catalogs only; source resolution is deliberately unrestricted so the source product may live outside the allowlist. Keys are not validated against the caller's grants — a key outside the caller's resolved scope simply matches nothing. When omitted, retrieval spans every catalog the caller's scope permits.",
        title="Catalogs",
    )
    cursor: str | None = Field(
        None, description="Opaque pagination cursor", title="Cursor"
    )
    debug: bool | None = Field(
        False,
        description="If true, include the curated effective query in the response.",
        title="Debug",
    )
    exclude_facets: list[Facet] | None = Field(
        None,
        description="Exclusion facets to apply to the similar-products search.",
        title="Exclude Facets",
    )
    include_facets: list[Facet] | None = Field(
        None,
        description="Additional include facets to append after generated facets.",
        title="Include Facets",
    )
    limit: int | None = Field(12, title="Limit")
    omit_generated_facets: list[str] | None = Field(
        None,
        description="Names of SERVER-GENERATED facets to omit before search and relaxation — the correction knob for a generated filter the caller can see is wrong in effectiveQuery (include_facets only appends). Unknown names are ignored; caller include_facets and exclude_facets are never affected.",
        title="Omit Generated Facets",
    )
    price_preference: Literal["lower", "any", "higher"] | None = Field(
        "any",
        description="Relative price preference compared with the source product.",
        title="Price Preference",
    )
    ranking_embedding_columns: (
        list[
            Literal[
                "embedding", "style_embedding", "tags_embedding", "attributes_embedding"
            ]
        ]
        | None
    ) = Field(
        None,
        description="Embedding columns used to rescore and rank retrieved candidates. When omitted, ranking uses the base embedding.",
        title="Ranking Embedding Columns",
    )
    retrieval_embedding_columns: (
        list[
            Literal[
                "embedding", "style_embedding", "tags_embedding", "attributes_embedding"
            ]
        ]
        | None
    ) = Field(
        None,
        description="Embedding columns used to retrieve candidate products. Overrides the server-selected default (style/tags embeddings when the source product has styles or tags, otherwise the base embedding).",
        title="Retrieval Embedding Columns",
    )
    source: ProgrammaticMoreLikeThisSource


class ProgrammaticMoreLikeThisResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    effective_query: ProgrammaticMoreLikeThisEffectiveQuery | None = Field(
        None, alias="effectiveQuery"
    )
    items: list[MerchantProductListItem] = Field(..., title="Items")
    next_cursor: str | None = Field(None, alias="nextCursor", title="Nextcursor")
    resolution: str | None = Field(
        None,
        description="How the source was resolved. Product sources omit this; image sources report the resolution-ladder rung: 'image_query_generation' (pipeline ran) or 'cached_image_query' (served from the image-content-hash cache).",
        title="Resolution",
    )
    source: ProgrammaticMoreLikeThisSourceResponse | None = None
    source_image: ProgrammaticMoreLikeThisSourceImageResponse | None = Field(
        None, alias="sourceImage"
    )


class ProgrammaticProductRefreshRejectedTarget(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    code: str = Field(..., title="Code")
    message: str = Field(..., title="Message")
    target: ProgrammaticProductRefreshTarget


class ProgrammaticProductRefreshRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    targets: list[ProgrammaticProductRefreshTarget] = Field(
        ..., description="Products to schedule for refresh.", title="Targets"
    )


class ProgrammaticProductRefreshResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    accepted: list[ProgrammaticProductRefreshAcceptedTarget] = Field(
        ..., title="Accepted"
    )
    rejected: list[ProgrammaticProductRefreshRejectedTarget] = Field(
        ..., title="Rejected"
    )
    request_id: str = Field(..., alias="requestId", title="Requestid")
    submitted: int = Field(..., title="Submitted")
    workflow_attempts: int | None = Field(
        0, alias="workflowAttempts", title="Workflowattempts"
    )
    workflow_error: str | None = Field(
        None, alias="workflowError", title="Workflowerror"
    )
    workflow_id: str | None = Field(None, alias="workflowId", title="Workflowid")
    workflow_status: (
        Literal["pending", "launching", "launched", "retry_pending"] | None
    ) = Field(None, alias="workflowStatus", title="Workflowstatus")


class ProgrammaticProductSearchPage(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    effective_query: ProgrammaticMoreLikeThisEffectiveQuery | None = Field(
        None, alias="effectiveQuery"
    )
    items: list[MerchantProductListItem] | None = Field([], title="Items")
    next_cursor: str | None = Field(None, alias="nextCursor", title="Nextcursor")


class TextSearchQuery(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    brand_quality_max: float | None = Field(
        None,
        description="Inclusive upper bound for brand_quality_score (1=VERY_POOR, 6=EXCEPTIONAL).",
        title="Maximum brand quality",
    )
    brand_quality_min: float | None = Field(
        None,
        description="Inclusive lower bound for brand_quality_score (1=VERY_POOR, 6=EXCEPTIONAL).",
        title="Minimum brand quality",
    )
    brand_similarity_weight: float | None = Field(
        0.7,
        description="Weight for brand similarity in the combined retrieval score (0.0 to 1.0). Higher values give more importance to brand style similarity. Default is 0.7.",
        title="Brand similarity weight",
    )
    browse_menu_uuid: str | None = Field(
        None,
        description="UUID of the browse menu item that matches this query's facets (gender, age_group, category_path).",
        title="Browse menu UUID",
    )
    compact_mode: Literal["card", "compact", "medium", "enriched"] | None = Field(
        None,
        description="Optional response shape for product search results. Use 'card' for catalog grids that only need display fields; omit for full products.",
        title="Search output mode",
    )
    exclusion_facets: list[Facet] | None = Field(
        None,
        description="Facets that will be excluded from the search results.",
        title="Exclusion facets filter",
    )
    facets: list[Facet] | None = Field(
        None,
        description="The search results will be filtered by the specified facets.",
        title="Facets filter",
    )
    limit: int | None = Field(
        10,
        description="The maximum number of results to return from the search. The default is 10.",
        title="Search results limit",
    )
    price_max: float | None = Field(
        None,
        description="The products will be filtered to have a price less than or equal to the specified value.",
        title="Maximum price",
    )
    price_min: float | None = Field(
        None,
        description="The products will be filtered to have a price greater than or equal to the specified value.",
        title="Minimum price",
    )
    ranking_embedding_columns: (
        list[
            Literal[
                "embedding", "style_embedding", "tags_embedding", "attributes_embedding"
            ]
        ]
        | None
    ) = Field(
        None,
        description="The columns to use for the ranking embeddings. If not specified, defaults to ['embedding']. Pick the column that best corresponds to the `ranking_text` parameter.",
        title="Ranking embedding columns",
    )
    ranking_text: str | None = Field(
        None,
        description="The text is converted to a vector embedding and used to rank the search results. It will be matched against the embeddings from ranking_embedding_columns during ranking.",
        title="Ranking text",
    )
    retrieval_embedding_columns: (
        list[
            Literal[
                "embedding", "style_embedding", "tags_embedding", "attributes_embedding"
            ]
        ]
        | None
    ) = Field(
        None,
        description="The columns to use for the retrieval embeddings. If not specified, defaults to ['embedding']. Pick the column that best corresponds to the `text` parameter.",
        title="Retrieval embedding columns",
    )
    search_after: list[Any] | None = Field(
        None,
        description="Cursor for pagination. Pass the 'next_cursor' value from the previous response to fetch the next page of results. This enables efficient 'load more' functionality.",
        title="Search after cursor",
    )
    search_id: str | None = Field(
        None,
        description="Unique identifier (UUID) for this search query. Used to link agent recommendations back to specific search results.",
        title="Search identifier",
    )
    similar_to_brands: list[str] | None = Field(
        None,
        description="List of brand names to find products similar to. When provided, embeddings for the specified brands are fetched, averaged, and used to boost products with similar style characteristics. This enables finding products that match the aesthetic of certain brands.",
        title="Similar to brands",
    )
    text: str = Field(
        ...,
        description="The text is converted to a vector embedding and used to search for products in the e-commerce catalog with pre-computed product embeddings. It will be matched against the embeddings from retrieval_embedding_columns during retrieval.",
        title="Product search query text",
    )
    text_similarity_weight: float | None = Field(
        0.3,
        description="Weight for text query similarity in the combined retrieval score (0.0 to 1.0). Higher values give more importance to text query matching. Default is 0.3.",
        title="Text similarity weight",
    )


class VoyageResult(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    catalog: str = Field(..., title="Catalog")
    endpoints: VoyageResultEndpoints | None = None
    product_count: int | None = Field(None, alias="productCount", title="Productcount")


class VoyageTask(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    completed_at: AwareDatetime | None = Field(
        None, alias="completedAt", title="Completedat"
    )
    created_at: AwareDatetime | None = Field(None, alias="createdAt", title="Createdat")
    domain: str = Field(..., title="Domain")
    error: VoyageError | None = None
    phase: Literal[
        "discovering_site",
        "sampling_products",
        "building_extraction",
        "in_review",
        "publishing_catalog",
        "complete",
        "failed",
    ] = Field(..., title="Phase")
    phase_label: str = Field(..., alias="phaseLabel", title="Phaselabel")
    progress_percent: int = Field(..., alias="progressPercent", title="Progresspercent")
    result: VoyageResult | None = None
    status: Literal[
        "queued", "running", "in_review", "completed", "failed", "cancelled"
    ] = Field(..., title="Status")
    task_id: str = Field(..., alias="taskId", title="Taskid")
    updated_at: AwareDatetime | None = Field(None, alias="updatedAt", title="Updatedat")


class MerchantProductView(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    audience: AudienceView | None = None
    brand: BrandView | None = None
    breadcrumbs: list[BreadcrumbView] | None = Field([], title="Breadcrumbs")
    catalog_key: str | None = Field(
        None,
        alias="catalogKey",
        description="Catalog that supplied this product. Present for search/list results so cross-catalog searches can link back to the correct catalog.",
        title="Catalogkey",
    )
    categories: list[CategoryView] | None = Field([], title="Categories")
    colors: list[ColorView] | None = Field([], title="Colors")
    currency: str | None = Field(None, title="Currency")
    current_price: float | None = Field(
        None, alias="currentPrice", title="Currentprice"
    )
    description: str | None = Field(None, title="Description")
    details: ProductDetailsView | None = Field(
        default_factory=lambda: ProductDetailsView.model_validate(
            {"fit": [], "materials": [], "patterns": []}
        )
    )
    display_match_score: int | None = Field(
        None,
        alias="displayMatchScore",
        description="User-facing match score normalized for the current result set. This is intended for display only and is not comparable across queries.",
        title="Displaymatchscore",
    )
    enrichment: ProductEnrichment | None = None
    identifiers: IdentifiersView | None = {}
    image_url: str | None = Field(
        None,
        alias="imageUrl",
        description="Deprecated: primary image CDN URL, kept populated during migration. Read primaryImage instead.",
        title="Imageurl",
    )
    images: list[MerchantProductImageMetadataView] | None = Field([], title="Images")
    in_stock: bool | None = Field(None, alias="inStock", title="Instock")
    is_active: bool | None = Field(None, alias="isActive", title="Isactive")
    original_price: float | None = Field(
        None, alias="originalPrice", title="Originalprice"
    )
    primary_image: MerchantProductImageMetadataView | None = Field(
        None,
        alias="primaryImage",
        description="The product's display image with full metadata. Its url is the merchant source URL; cdnUrl carries the hosted copy when one exists.",
    )
    product_url: str = Field(..., alias="productUrl", title="Producturl")
    promotions: list[PromotionView] | None = Field([], title="Promotions")
    rating: RatingView | None = None
    raw_score: float | None = Field(
        None,
        alias="rawScore",
        description="Raw Elasticsearch score for the source hit. Useful for debugging; not normalized across queries or strategies.",
        title="Rawscore",
    )
    reviews: list[ReviewView] | None = Field([], title="Reviews")
    sizes: list[str] | None = Field([], title="Sizes")
    tags: list[str] | None = Field([], title="Tags")
    title: str | None = Field(None, title="Title")
    updated_at: AwareDatetime | None = Field(None, alias="updatedAt", title="Updatedat")
    uuid: str | None = Field(..., title="Uuid")
    variants: list[MerchantVariantView] | None = Field([], title="Variants")
    videos: list[VideoView] | None = Field([], title="Videos")


class ProgrammaticProductSearchRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
    )
    catalog: str | None = Field(
        None,
        description="Optional catalog to narrow the search to. When omitted, search runs across the entire indexed corpus (all active catalogs), not just catalogs granted to the API key organization. Mutually exclusive with `catalogs`.",
        title="Catalog",
    )
    catalogs: list[str] | None = Field(
        None,
        description="Optional catalog allowlist to narrow the search — same contract as the more-like-this `catalogs` field. Restricts results to these catalogs only. Keys are not validated against the caller's grants: a key outside the caller's resolved scope simply matches nothing. Mutually exclusive with `catalog`. When omitted or empty, search spans every catalog the caller's scope permits. Bounds stay the inherited max_length=500 with an empty list meaning no allowlist, so request shapes accepted before this field was honored keep working.",
        title="Catalogs",
    )
    cursor: str | None = Field(
        None, description="Opaque pagination cursor", title="Cursor"
    )
    debug: bool | None = Field(
        False,
        description="Include the effective query in the response, mirroring more-like-this: the EXECUTED text/facets/price bounds/embedding columns — after query understanding AND after caller facets (which win over same-name generated facets) and price bounds are merged. Browse-all requests report the raw browse query. Makes search usable as a controlled comparison against more-like-this.",
        title="Debug",
    )
    diversity: bool | None = Field(
        False,
        description="Enable result diversification (parity with Shop Agent / conversational search). Defaults off to preserve stable merchant-browse ordering across pages.",
        title="Diversity",
    )
    embedding_dims: Literal[768, 1024, 3072] | None = Field(
        None,
        alias="embeddingDims",
        description="Evaluation knob: dimensionality of the query embedding. The 3072-dim embedding is truncated to this prefix and renormalized (gemini-embedding is Matryoshka-trained). Non-default values target profile-suffixed vector fields that only exist on testbed indices, and require the caller to be a super-admin or an allowlisted evaluation org. Omitted means the live default (3072).",
        title="Embeddingdims",
    )
    facets: list[Facet] | None = Field(
        None,
        description="Structured facet filters to apply to the product list.",
        title="Facets",
    )
    limit: int | None = Field(50, title="Limit")
    price_max: float | None = Field(
        None, description="Maximum price filter", title="Price Max"
    )
    price_min: float | None = Field(
        None, description="Minimum price filter", title="Price Min"
    )
    q: str | None = Field(None, description="Keyword search query", title="Q")
    quantize_embedding: bool | None = Field(
        None,
        alias="quantizeEmbedding",
        description="Evaluation knob: whether the query vector is int8-quantized (the live default, matching element_type: byte document fields) or sent as float32 (matching float/BBQ testbed fields). false targets profile-suffixed vector fields that only exist on testbed indices, and requires the caller to be a super-admin or an allowlisted evaluation org.",
        title="Quantizeembedding",
    )
    text_search_query: TextSearchQuery | None = Field(
        None,
        description="Pre-generated semantic search query. When provided, the service uses this query directly instead of re-running query understanding.",
    )


class VoyageListResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    items: list[VoyageTask] = Field(..., title="Items")
    next_cursor: str | None = Field(None, alias="nextCursor", title="Nextcursor")
    quotas: VoyageQuotas | None = None


class MerchantProductUrlLookupResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )
    cache_status: Literal["hit", "miss", "refresh"] | None = Field(
        None, alias="cacheStatus", title="Cachestatus"
    )
    canonical_url: str | None = Field(
        None,
        alias="canonicalUrl",
        description="For on-demand and client_html results: the canonical URL the product page declares (JSON-LD url, og:url, or link rel=canonical); when the page declares none the resolver falls back to the final fetched URL (on-demand) or the caller-supplied url (client_html), so a non-null value is not proof of a declaration. Null for indexed results — we do not yet store the page-declared canonical for indexed products. For follow-up lookups use normalizedUrl (indexed results) or resolvedUrl (on-demand results), not this field.",
        title="Canonicalurl",
    )
    catalog_display_name: str | None = Field(
        None, alias="catalogDisplayName", title="Catalogdisplayname"
    )
    catalog_key: str | None = Field(None, alias="catalogKey", title="Catalogkey")
    matched_via: str | None = Field(
        None,
        alias="matchedVia",
        description="Debug: which probe arm of the URL lookup ladder resolved the product — normalized_alias | exact | normalized_exact | loose | structural_alias | learned_alias:<rule_id>. Absent for on-demand results and legacy paths. Informational only; values may be extended.",
        title="Matchedvia",
    )
    normalized_url: str | None = Field(
        None,
        alias="normalizedUrl",
        description="Stable URL for this product that callers should reuse on follow-up lookups: the matched product's stored normalized URL (Octogen's deterministic normalization — scheme forced to https, leading www. stripped, fragments and known tracking params removed, remaining query params sorted), falling back to its exact indexed URL for legacy rows. Populated for indexed results; for on-demand results reuse resolvedUrl instead.",
        title="Normalizedurl",
    )
    product: MerchantProductView
    request_id: str | None = Field(None, alias="requestId", title="Requestid")
    requested_url: str | None = Field(
        None,
        alias="requestedUrl",
        description="The URL the caller submitted, echoed verbatim. For client_html results this is the variant-qualified identity: storefronts commonly record a shopper's variant selection only in URL query parameters, and canonicalUrl conventionally drops them — key on this field when variants must stay distinct.",
        title="Requestedurl",
    )
    resolution: ProductResolutionMetadata | None = None
    resolved_url: str | None = Field(
        None,
        alias="resolvedUrl",
        description="Final URL after following redirects. Populated for on-demand results only.",
        title="Resolvedurl",
    )
    source: Literal["indexed", "on_demand", "client_html"] = Field(..., title="Source")
    source_base_url: str | None = Field(
        None, alias="sourceBaseUrl", title="Sourcebaseurl"
    )
    warnings: list[str] | None = Field(None, title="Warnings")
