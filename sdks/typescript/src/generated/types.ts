/**
 * Generated from the published Octogen `/v1` OpenAPI contract. Do not edit.
 *
 * Regenerate with `npm run codegen` (the snapshot lives in
 * `tests/fixtures/openapi/platform-v1.json`). Only types are generated; the
 * method layer in `../client.ts` is hand-written.
 */
export interface paths {
    "/brands/{brand}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a brand's details and coverage
         * @description Resolve a corpus-wide brand by slug or case-insensitive name.
         *
         *     Returns display metadata plus a coverage snapshot of the brand's products,
         *     shaped like a ``GET /v1/stores/{domain}`` catalog: product count, populated
         *     facets with top values, and a price histogram. ``catalogs`` lists the
         *     catalogs carrying the brand by product count; pass a host to
         *     ``GET /v1/stores/{domain}`` for a store's own coverage. The domain is the brand website,
         *     not a promise that a store or seller is indexed. Unbilled; snapshots are
         *     cached per brand for about a day.
         */
        get: operations["getBrandDetails"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/brands/{brand}/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Browse products for a brand
         * @description Paginated active products for a brand, within the caller's scope.
         */
        get: operations["browseBrandProducts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/brands/{brand}/top-categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Top categories for a brand by product count
         * @description A brand's top categories by active-product count.
         *
         *     Resolves ``{brand}`` as slug or case-insensitive name and returns
         *     precomputed, corpus-wide category names. These are not scoped inventory
         *     counts and do not promise products within your catalog scope.
         */
        get: operations["getBrandTopCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/brands/prefix": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Find canonical brand names by prefix
         * @description Find corpus-wide canonical brand names by raw or punctuation-free prefix.
         *
         *     Brand matches do not promise products within your catalog scope.
         */
        get: operations["searchBrandPrefix"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/brands/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Find brands from a natural-language query
         * @description Discover brands from text and optional reference brands.
         *
         *     Searches corpus-wide brand identities, not stores or sellers. Brand matches
         *     do not promise products in your catalog scope. Returns 400 for an unusable
         *     generated query or reference brands without embeddings.
         */
        post: operations["searchBrandsFromText"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/brands/similar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Find brands similar to a set of brands
         * @description Find corpus-wide brands by averaged source-brand embedding similarity.
         *
         *     Brand matches do not promise products within your catalog scope.
         */
        post: operations["searchSimilarBrands"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/coverage/url-lists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List your organization's URL lists
         * @description List the calling organization's URL lists, newest first.
         */
        get: operations["listUrlLists"];
        put?: never;
        /**
         * Create a URL list
         * @description Create a URL list.
         *
         *     Returns `201` with the list in `provisioning`: the list exists
         *     synchronously — a stable `urlListId` you can immediately `GET` and add
         *     URLs to — while its BigQuery resources are provisioned asynchronously
         *     (`status` flips to `active` when they exist).
         */
        post: operations["createUrlList"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/coverage/url-lists/{urlListId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a URL list
         * @description Get one URL list by id.
         */
        get: operations["getUrlList"];
        put?: never;
        post?: never;
        /**
         * Delete a URL list
         * @description Delete a URL list.
         *
         *     Returns `202` with the list in `delete_pending`: access revocation and
         *     resource teardown are asynchronous. There is no grace window and no
         *     restore — the name is released immediately. Idempotent.
         */
        delete: operations["deleteUrlList"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/coverage/url-lists/{urlListId}/urls": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Enumerate a list's URLs
         * @description Enumerate the list's URLs in stable insertion order.
         */
        get: operations["listUrlListUrls"];
        put?: never;
        /**
         * Add URLs to a list
         * @description Add URLs to the list — an idempotent set-add.
         *
         *     Each URL is normalized server-side; the normalized form is the
         *     membership key. Invalid URLs come back per-URL in `rejected[]` on a
         *     `200`. Adding a URL already present is an accepted no-op, so blind
         *     re-syncs are safe. Capacity is batch-atomic: a batch that would cross
         *     the 100,000-URL cap fails whole with `409`.
         */
        post: operations["addUrlListUrls"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/coverage/url-lists/{urlListId}/urls/contains": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Check whether URLs are in a list
         * @description Batched membership check.
         *
         *     Each input is normalized server-side before checking. A miss is
         *     `present: false` — membership of your own list is not an error.
         */
        post: operations["checkUrlListUrls"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/coverage/url-lists/{urlListId}/urls/remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Remove URLs from a list
         * @description Remove URLs from the list — an idempotent set-remove.
         *
         *     Removing a URL that is not present is an accepted no-op.
         */
        post: operations["removeUrlListUrls"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get the calling credential's identity and limits
         * @description Return the caller's own organization, key, quotas, and rate limit.
         *
         *     Read-only and side-effect free: safe to call on startup, in CI, and in a
         *     health loop (subject to the ``/v1`` rate limit it reports). Never includes
         *     key material — only the key id and its non-secret display prefix.
         */
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/products/facet-counts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Count products by category and filter value
         * @description Count the products `POST /products/search` would filter to.
         *
         *     Counts span every catalog your key can access unless `catalogs` narrows
         *     them, and apply the same filters, bounds and understood facets as a
         *     search with the same fields.
         */
        post: operations["countProductFacets"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/products/lookup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Lookup product by URL
         * @description Resolve a product by URL: index first, then configured-catalog JIT or shallow resolution. One 45-second deadline bounds all tiers; no background indexing is dispatched. `POST /products/parse` is an exact alias. The response defaults to the structured JSON envelope; set `format` to `md` or `markdown` for the Python-rendered Markdown representation used by Cosimo.
         */
        post: operations["lookupProduct"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/products/more-like-this": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Find products similar to a source product
         * @description Find products similar to a source product with a Catalog partner API key.
         *
         *     Full corpus by default: a ``catalogs`` allowlist in the request restricts
         *     the RETRIEVAL to those catalogs, while source resolution always spans
         *     every catalog the caller's resolved scope permits (the source may live
         *     outside the allowlist). Every branch carries the scope, so a
         *     ``catalog_partner`` caller stays bounded to ``catalog_type = 'CRAWLED'``.
         */
        post: operations["moreLikeThisProducts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/products/parse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Alias for product lookup by URL
         * @description Alias for `POST /products/lookup`. It accepts the identical request body, runs the identical lookup and optional on-demand resolution flow, and returns the identical response. Use `format: "md"` or `format: "markdown"` on either path for the Python-rendered Markdown representation; `format: "json"` is the default.
         */
        post: operations["parseProductAlias"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/products/resolve-from-html": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Resolve product from supplied HTML
         * @description Resolve a product from caller-supplied page HTML — no index or fetch.
         *
         *     Same shallow deterministic extraction as lookup's on-demand path
         *     (JSON-LD → Open Graph → HTML meta), run over the submitted document
         *     instead of a fetched one. Nothing is written to the product index or
         *     resolver cache. A uniformly sampled subset of authenticated submissions,
         *     including the supplied HTML and URL, may be retained for bounded internal
         *     analysis.
         */
        post: operations["resolveProductFromHtml"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/products/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Search products
         * @description Search indexed products by free text, filters, or both.
         *
         *     Results span every catalog your key can access unless `catalogs` narrows
         *     them. Page 1 is ranked by relevance; later pages continue in quality-score
         *     order from page 1's last result, so a product can repeat across pages —
         *     de-duplicate by `uuid`.
         */
        post: operations["searchProducts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stores/{domain}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a store's coverage and assortment profiles
         * @description Inspect every catalog serving a covered store domain.
         *
         *     ``domain`` is a bare host (not a URL), lowercased with a leading ``www.``
         *     removed. Unbilled; coverage snapshots are cached per catalog for about a day.
         *     Profiles are read from published artifacts and checked against live catalog
         *     eligibility. Missing, revoked, expired, or unavailable profiles are null.
         *     Empty profiles retain their zero-product evidence. Observation timestamps
         *     belong to the profile generation, independently of the coverage snapshot.
         *     Profile counts describe observed assortment, not live product-query matches.
         */
        get: operations["getStore"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stores/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Discover stores by observed assortment
         * @description Rank unique stores using semantic profiles and exact store name/domain.
         *
         *     Unbilled, authenticated and rate-limited. Searches an explicitly configured
         *     pilot cohort, not every store. Counts are observed profile populations;
         *     use products/search to establish product-level requirements or conjunctions.
         *     Missing, ineligible, empty, expired or unindexed current generations are
         *     omitted, so results may underfill. No total or pagination is promised.
         */
        post: operations["searchStores"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stores/similar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Find stores similar to one or more stores
         * @description Rank profiled stores by similarity to the given stores' whole assortment.
         *
         *     Unbilled, authenticated and rate-limited, like stores/search, and over the
         *     same pilot cohort. Compares overall store profiles, averaged across the
         *     given stores, which never appear in their own results. Results may
         *     underfill; no total or pagination is promised.
         */
        post: operations["searchSimilarStores"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/taxonomy/attributes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List a category's attributes
         * @description The attribute definitions a category carries, such as `neckline` for dresses. Read an attribute's values from `GET /taxonomy/attributes/{handle}/values`.
         */
        get: operations["listTaxonomyAttributes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/taxonomy/attributes/{handle}/values": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List an attribute's values
         * @description Canonical values of one attribute. Filter search with `{"name": attribute.facetName, "values": [value.handle]}`.
         */
        get: operations["listTaxonomyAttributeValues"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/taxonomy/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List taxonomy categories
         * @description Without `parent`, the root categories; with it, that category's direct children. Each category carries the search `facets` that select it. Definitions only: a category listed here may hold no products.
         */
        get: operations["listTaxonomyCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * AgeGroup
         * @enum {string}
         */
        AgeGroup: "infant" | "toddler" | "kids" | "adult";
        /**
         * Attribute
         * @description Represents an attribute with its metadata and values.
         */
        Attribute: {
            /** Handle */
            handle: string;
            /** Name */
            name: string;
            /** Values */
            values?: components["schemas"]["AttributeValue"][];
        };
        /**
         * AttributeValue
         * @description Represents a single value for a taxonomy attribute.
         */
        AttributeValue: {
            /** Handle */
            handle: string;
            /** Name */
            name: string;
        };
        /** AudienceView */
        AudienceView: {
            /**
             * Agegroups
             * @default []
             */
            ageGroups: string[];
            /**
             * Genders
             * @default []
             */
            genders: string[];
        };
        /**
         * BrandCatalog
         * @description One catalog carrying the brand.
         */
        BrandCatalog: {
            /**
             * Catalog
             * @description Catalog key.
             */
            catalog: string;
            /**
             * Catalogdisplayname
             * @description Human-readable display name for the catalog.
             */
            catalogDisplayName: string;
            /**
             * Hosts
             * @description Normalized hosts the catalog serves, each usable with `GET /v1/stores/{domain}`.
             */
            hosts: string[];
            /**
             * Productcount
             * @description Indexed product groups of this brand in the catalog.
             */
            productCount: number;
        };
        /**
         * BrandCoverageResponse
         * @description Brand metadata plus coverage of the brand's products across catalogs.
         *
         *     Counts are approximate (Elasticsearch aggregations) and refreshed about
         *     daily. The same product sold by several stores is counted once per catalog.
         */
        BrandCoverageResponse: {
            /**
             * Branddescription
             * @description Short description of the brand.
             */
            brandDescription?: string | null;
            /**
             * Brandname
             * @description Canonical name of the brand.
             */
            brandName: string;
            /**
             * Brandslug
             * @description Canonical slug for the brand.
             */
            brandSlug?: string | null;
            /**
             * Branduuid
             * @description Unique identifier for the brand.
             */
            brandUuid: string;
            /**
             * Catalogs
             * @description Catalogs carrying the brand, most products first. Empty when no indexed product carries the brand.
             */
            catalogs: components["schemas"]["BrandCatalog"][];
            /**
             * Catalogstruncated
             * @description Whether the brand is carried by more catalogs than listed.
             */
            catalogsTruncated: boolean;
            /**
             * Computedat
             * @description When the coverage was computed (UTC ISO 8601).
             */
            computedAt: string;
            /**
             * Directorysubheading
             * @description Brand subheading for directory display.
             */
            directorySubheading?: string | null;
            /**
             * Domain
             * @description Primary website domain for the brand.
             */
            domain?: string | null;
            /**
             * Fields
             * @description Populated public facets of the brand's products, ordered by `source` then coverage.
             */
            fields: components["schemas"]["DomainField"][];
            /**
             * Foundedyear
             * @description Year the brand was founded.
             */
            foundedYear?: number | null;
            /**
             * Origincountry
             * @description Country of origin for the brand.
             */
            originCountry?: string | null;
            /** @description Current-price histogram; null when nothing is priced. */
            price?: components["schemas"]["PriceDistribution"] | null;
            /**
             * Pricetier
             * @description Price positioning for the brand.
             */
            priceTier?: string | null;
            /**
             * Productcount
             * @description Indexed product groups of the brand across catalogs.
             */
            productCount: number;
        };
        /**
         * BrandFacet
         * @description Brand-focused facet filter.
         *
         *     Accepts either a BrandFacetName or a string. Strings may be:
         *     - A bare attribute key present in BRAND_ATTRIBUTE_FACET_FIELDS (will be
         *       interpreted as facet_attributes.<key> later in the request builder)
         *     - A fully qualified attribute key: "facet_attributes.<key>"
         *     - Backwards-compatible forms from product search:
         *         - "attribute_facets.<key>"
         *         - "gender", "product_type", "age_groups"
         *         - "category_path.depth_i" for i in 0..6
         *         - "color", "color_family", "is_activewear" (recognized by this shared
         *           compatibility model, but rejected by public brand request validation)
         *
         *     Public brand requests also reject "brand_quality_score". Each public facet
         *     needs 1..100 nonblank values, each at most 256 characters.
         */
        BrandFacet: {
            /**
             * Name
             * @description Facet key. Accepts brand base facets (BrandFacetName), attribute keys (bare or prefixed), and select backwards-compatible product facet names.
             */
            name: components["schemas"]["BrandFacetName"] | string;
            /**
             * Values
             * @description List of values to filter by. They should be lowercase; phrases allowed.
             */
            values: string[];
        };
        /**
         * BrandFacetName
         * @description Facet keys supported by the brand index.
         *
         *     These correspond to fields in BRAND_ES_MAPPING_PROPERTIES and convenience
         *     aliases for depth-based category paths.
         * @enum {string}
         */
        BrandFacetName: "brand_name" | "facet_types" | "facet_tags" | "facet_styles" | "facet_style_identity" | "facet_genders" | "facet_age_groups" | "facet_categories" | "facet_origin_country" | "facet_price_tier" | "facet_target_audience" | "facet_sustainability" | "facet_brand_ethics" | "facet_brand_inclusivity" | "facet_brand_cultural_anchors" | "facet_key_people_names" | "facet_key_people_nationalities" | "facet_brand_hype_cycle_stage" | "facet_category_path.depth_0" | "facet_category_path.depth_1" | "facet_category_path.depth_2" | "facet_category_path.depth_3" | "facet_category_path.depth_4" | "facet_category_path.depth_5" | "facet_category_path.depth_6";
        /**
         * BrandProductsPage
         * @description One page of a brand's active indexed products.
         */
        BrandProductsPage: {
            /**
             * Brandname
             * @description Canonical brand name used for the query.
             */
            brandName: string;
            /**
             * Brandslug
             * @description Canonical brand slug used for the query.
             */
            brandSlug?: string | null;
            /**
             * Hasmore
             * @description Whether another fetchable page exists. False once pagination reaches the offset ceiling (10000), even if `total` is larger.
             */
            hasMore: boolean;
            /**
             * Limit
             * @description Maximum number of products per page.
             */
            limit: number;
            /**
             * Offset
             * @description Number of products skipped.
             */
            offset: number;
            /**
             * Products
             * @description Products on this page, shaped like `/v1/products/search` items. Rows without a usable product URL are dropped, so a page may contain fewer than `limit` items even when more rows exist.
             */
            products: components["schemas"]["MerchantProductListItem"][];
            /**
             * Total
             * @description Total active products for the brand within the caller's catalog scope, counted before any per-row projection drops.
             */
            total: number;
        };
        /**
         * BrandTextSearchRequest
         * @description Generate and execute a brand search from text and optional references.
         */
        BrandTextSearchRequest: {
            /**
             * Facets
             * @description Up to 20 explicit filters that override generated facets by name. Each needs 1..100 nonblank values of at most 256 characters. Product-only color, color_family, is_activewear and internal brand_quality_score are rejected.
             */
            facets?: components["schemas"]["BrandFacet"][] | null;
            /**
             * Limit
             * @description Maximum number of matching brands.
             * @default 24
             */
            limit: number;
            /**
             * Referencebrands
             * @description Canonical source brands whose averaged embeddings guide the search.
             */
            referenceBrands?: string[] | null;
            /**
             * Text
             * @description Natural-language brand discovery query.
             */
            text: string;
        };
        /**
         * BrandTopCategoriesPage
         * @description A brand's top categories by product count.
         */
        BrandTopCategoriesPage: {
            /**
             * Brandname
             * @description Canonical brand name used for the query.
             */
            brandName: string;
            /**
             * Topcategories
             * @description Top categories sorted by product count, descending.
             */
            topCategories: components["schemas"]["BrandTopCategoryView"][];
        };
        /**
         * BrandTopCategoryView
         * @description A top category for a brand based on product count.
         */
        BrandTopCategoryView: {
            /**
             * Categorylevel
             * @description Depth level of the category in the taxonomy.
             */
            categoryLevel: number;
            /**
             * Categoryname
             * @description Name of the category.
             */
            categoryName: string;
        };
        /** BrandView */
        BrandView: {
            /** Description */
            description?: string | null;
            /** Name */
            name: string;
            /** Slug */
            slug?: string | null;
            /** Url */
            url?: string | null;
        };
        /** BreadcrumbView */
        BreadcrumbView: {
            /** Name */
            name: string;
            /** Url */
            url?: string | null;
        };
        /** CanonicalBrand */
        CanonicalBrand: {
            /** @description Canonical brand enrichment data for filtering and display. */
            brand_enrichment?: components["schemas"]["CanonicalBrandEnrichment"] | null;
            /** Brand Name */
            brand_name: string;
            /**
             * Brand Slug
             * @description Canonical slug for the brand.
             */
            brand_slug?: string | null;
            /**
             * Brand Synonyms
             * @description Alternate names for the brand.
             */
            brand_synonyms?: string[] | null;
            /** Brand Uuid */
            brand_uuid: string;
        };
        /**
         * CanonicalBrandEnrichment
         * @description Enrichment data attached to canonical brand metadata, used for filtering and display.
         */
        CanonicalBrandEnrichment: {
            /** Brand Accessibility Index */
            brand_accessibility_index?: string | null;
            /** Brand Community Perception */
            brand_community_perception?: string | null;
            /** Brand Craft Production */
            brand_craft_production?: string | null;
            /** Brand Description */
            brand_description?: string | null;
            /** Brand Popularity Level */
            brand_popularity_level?: string | null;
            /** Brand Popularity Trend Direction */
            brand_popularity_trend_direction?: string | null;
            /** Brand Positioning */
            brand_positioning?: string | null;
            /** Brand Quality Justification */
            brand_quality_justification?: string | null;
            /** Brand Quality Score */
            brand_quality_score?: number | null;
            /** Directory Subheading */
            directory_subheading?: string | null;
            /** Domain */
            domain?: string | null;
            /** Facet Brand Cultural Anchors */
            facet_brand_cultural_anchors?: string[] | null;
            /** Facet Brand Ethics */
            facet_brand_ethics?: string[] | null;
            /** Facet Brand Hype Cycle Stage */
            facet_brand_hype_cycle_stage?: string[] | null;
            /** Facet Brand Inclusivity */
            facet_brand_inclusivity?: string[] | null;
            /** Facet Key People Names */
            facet_key_people_names?: string[] | null;
            /** Facet Key People Nationalities */
            facet_key_people_nationalities?: string[] | null;
            /** Facet Origin Country */
            facet_origin_country?: string | null;
            /** Facet Price Tier */
            facet_price_tier?: string | null;
            /** Facet Style Identity */
            facet_style_identity?: string[] | null;
            /** Facet Sustainability */
            facet_sustainability?: string[] | null;
            /** Facet Target Audience */
            facet_target_audience?: string | null;
            /** Founded Year */
            founded_year?: number | null;
            /** Occasion Fit */
            occasion_fit?: string | null;
        };
        /** CategoryView */
        CategoryView: {
            /** Name */
            name: string;
            /** Url */
            url?: string | null;
        };
        /**
         * ColorFamily
         * @enum {string}
         */
        ColorFamily: "Pink" | "Red" | "Orange" | "Brown" | "Yellow" | "Green" | "Blue" | "Purple" | "White" | "Gray" | "Black" | "Multicolor";
        /**
         * ColorName
         * @enum {string}
         */
        ColorName: "aliceblue" | "antiquewhite" | "aqua" | "aquamarine" | "azure" | "beige" | "bisque" | "black" | "blanchedalmond" | "blue" | "blueviolet" | "bronze" | "brown" | "burlywood" | "cadetblue" | "chartreuse" | "chocolate" | "coral" | "cornflowerblue" | "cornsilk" | "crimson" | "cyan" | "darkblue" | "darkcyan" | "darkgoldenrod" | "darkgray" | "darkgreen" | "darkgrey" | "darkkhaki" | "darkmagenta" | "darkolivegreen" | "darkorange" | "darkorchid" | "darkred" | "darksalmon" | "darkseagreen" | "darkslateblue" | "darkslategray" | "darkslategrey" | "darkturquoise" | "darkviolet" | "deeppink" | "deepskyblue" | "dimgray" | "dimgrey" | "dodgerblue" | "firebrick" | "floralwhite" | "forestgreen" | "fuchsia" | "gainsboro" | "ghostwhite" | "gold" | "goldenrod" | "gray" | "green" | "greenyellow" | "grey" | "honeydew" | "hotpink" | "indianred" | "indigo" | "ivory" | "khaki" | "lavender" | "lavenderblush" | "lawngreen" | "lemonchiffon" | "lightblue" | "lightcoral" | "lightcyan" | "lightgoldenrodyellow" | "lightgray" | "lightgreen" | "lightgrey" | "lightpink" | "lightsalmon" | "lightseagreen" | "lightskyblue" | "lightslategray" | "lightslategrey" | "lightsteelblue" | "lightyellow" | "lime" | "limegreen" | "linen" | "magenta" | "maroon" | "mediumaquamarine" | "mediumblue" | "mediumorchid" | "mediumpurple" | "mediumseagreen" | "mediumslateblue" | "mediumspringgreen" | "mediumturquoise" | "mediumvioletred" | "midnightblue" | "mintcream" | "mistyrose" | "multi" | "moccasin" | "navajowhite" | "navy" | "oldlace" | "olive" | "olivedrab" | "orange" | "orangered" | "orchid" | "palegoldenrod" | "palegreen" | "paleturquoise" | "palevioletred" | "papayawhip" | "peachpuff" | "peru" | "pink" | "plum" | "powderblue" | "purple" | "rebeccapurple" | "red" | "rosybrown" | "royalblue" | "saddlebrown" | "salmon" | "sandybrown" | "seagreen" | "seashell" | "sienna" | "silver" | "skyblue" | "slateblue" | "slategray" | "slategrey" | "snow" | "springgreen" | "steelblue" | "tan" | "teal" | "thistle" | "tomato" | "turquoise" | "violet" | "wheat" | "white" | "whitesmoke" | "yellow" | "yellowgreen";
        /** ColorView */
        ColorView: {
            /** Hexcode */
            hexCode?: string | null;
            /** Label */
            label: string;
            /** Swatchurl */
            swatchUrl?: string | null;
        };
        /**
         * CoverageAcceptedUrl
         * @description Per-URL success outcome (design §1.2).
         */
        CoverageAcceptedUrl: {
            /** Normalizedurl */
            normalizedUrl: string;
            /** Url */
            url: string;
        };
        /**
         * CoverageContainsResponse
         * @description Response for ``checkUrlListUrls`` (design §1.3).
         */
        CoverageContainsResponse: {
            /** Results */
            results: components["schemas"]["CoverageContainsResult"][];
        };
        /**
         * CoverageContainsResult
         * @description Per-URL membership outcome (design §1.3). A miss is ``present:
         *     false``, never an error.
         */
        CoverageContainsResult: {
            /** Addedat */
            addedAt: string | null;
            /** Normalizedurl */
            normalizedUrl: string;
            /** Present */
            present: boolean;
            /** Url */
            url: string;
        };
        /**
         * CoverageRejectedUrl
         * @description Per-URL refusal (design §1.2).
         */
        CoverageRejectedUrl: {
            /**
             * Code
             * @constant
             */
            code: "invalid_url";
            /** Message */
            message: string;
            /** Url */
            url: string;
        };
        /**
         * CoverageUrlList
         * @description The URL List object (design §1.1).
         */
        CoverageUrlList: {
            bigQuery: components["schemas"]["CoverageUrlListBigQuery"] | null;
            /**
             * Createdat
             * Format: date-time
             */
            createdAt: string;
            /** Name */
            name: string;
            /**
             * Status
             * @enum {string}
             */
            status: "provisioning" | "active" | "delete_pending";
            /**
             * Updatedat
             * Format: date-time
             */
            updatedAt: string;
            /** Urlcount */
            urlCount: number;
            /** Urllistid */
            urlListId: string;
        };
        /**
         * CoverageUrlListBigQuery
         * @description The ``bigQuery`` block of the URL List object (design §1.1). ``null``
         *     on the parent while the list is provisioning; ``lastExportedAt`` /
         *     ``lastRowCount`` stay null until the first daily export lands.
         */
        CoverageUrlListBigQuery: {
            /** Exchangeid */
            exchangeId: string;
            /** Lastexportedat */
            lastExportedAt: string | null;
            /** Lastrowcount */
            lastRowCount: number | null;
            /** Listingid */
            listingId: string;
            /** Readercount */
            readerCount: number;
            /** Shareddatasetid */
            sharedDatasetId: string;
            /** Viewid */
            viewId: string;
        };
        /**
         * CoverageUrlListCreateRequest
         * @description Body for ``POST /v1/coverage/url-lists`` (design §1.1).
         */
        CoverageUrlListCreateRequest: {
            /**
             * Name
             * @description List name, unique among your live (provisioning/active) lists. Surrounding whitespace is trimmed. The name is released when a list is deleted.
             */
            name: string;
        };
        /**
         * CoverageUrlListListResponse
         * @description Response for ``GET /v1/coverage/url-lists`` (design §1.3).
         */
        CoverageUrlListListResponse: {
            /** Items */
            items: components["schemas"]["CoverageUrlList"][];
            /** Nextcursor */
            nextCursor: string | null;
        };
        /**
         * CoverageUrlListUrl
         * @description One enumerated list entry (design §1.3).
         */
        CoverageUrlListUrl: {
            /**
             * Addedat
             * Format: date-time
             */
            addedAt: string;
            /** Normalizedurl */
            normalizedUrl: string;
            /** Url */
            url: string;
        };
        /**
         * CoverageUrlListUrlsResponse
         * @description Response for ``listUrlListUrls`` (design §1.3).
         */
        CoverageUrlListUrlsResponse: {
            /** Items */
            items: components["schemas"]["CoverageUrlListUrl"][];
            /** Nextcursor */
            nextCursor: string | null;
        };
        /**
         * CoverageUrlMutationResponse
         * @description Response for ``addUrlListUrls`` / ``removeUrlListUrls`` (design §1.2).
         *
         *     ``urlCount`` is the list's total size after the mutation — not the size
         *     of this request; idempotent no-ops contribute nothing to it.
         */
        CoverageUrlMutationResponse: {
            /** Accepted */
            accepted: components["schemas"]["CoverageAcceptedUrl"][];
            /** Rejected */
            rejected: components["schemas"]["CoverageRejectedUrl"][];
            /** Requestid */
            requestId: string;
            /** Urlcount */
            urlCount: number;
        };
        /**
         * CoverageUrlsRequest
         * @description Shared body for the URL mutations and the membership check
         *     (design §1.2, §1.3).
         */
        CoverageUrlsRequest: {
            /**
             * Urls
             * @description Product URLs, each at most 2,048 characters. Each entry must be an http(s) URL with a dotted hostname; invalid entries are rejected per-URL, not as a request error.
             */
            urls: string[];
        };
        /**
         * DomainField
         * @description A public search facet populated for at least one product.
         */
        DomainField: {
            /**
             * Coverage
             * @description `populated / productCount`, rounded to 3 decimals.
             */
            coverage: number;
            /**
             * Displayname
             * @description Human-readable facet name.
             */
            displayName: string;
            /**
             * Distinct
             * @description Approximate number of distinct values.
             */
            distinct: number;
            /**
             * Name
             * @description Public search facet name.
             */
            name: string;
            /**
             * Populated
             * @description Products with at least one value.
             */
            populated: number;
            /**
             * Source
             * @description `product` for merchant data, `enrichment` for Octogen classification and attributes, `brands` for brand facts.
             * @enum {string}
             */
            source: "product" | "enrichment" | "brands";
            /**
             * Topvalues
             * @description Up to 10 most common values, most common first.
             */
            topValues: components["schemas"]["DomainFieldValue"][];
            /**
             * Truncated
             * @description Whether values beyond `topValues` exist.
             */
            truncated: boolean;
        };
        /**
         * DomainFieldValue
         * @description One of a field's most common values among the catalog's products.
         */
        DomainFieldValue: {
            /**
             * Count
             * @description Approximate number of products with the value.
             */
            count: number;
            /**
             * Label
             * @description Human-readable value label.
             */
            label: string;
            /**
             * Value
             * @description Canonical search value: pass it with the field `name` as a `/v1/products/search` facet.
             */
            value: string;
        };
        /**
         * EmbeddingColumn
         * @enum {string}
         */
        EmbeddingColumn: "embedding" | "style_embedding" | "tags_embedding" | "attributes_embedding";
        /** Facet */
        Facet: {
            /**
             * Name
             * @description Canonical facet name: gender, age_groups, product_type, brand_name, brand_slug, raw_brand_name, color, color_family, is_activewear, category_path.depth_0 through category_path.depth_6, a brand profile facet such as brand_origin_country, or a taxonomy attribute handle such as fit. The attribute named color is attribute_facets.color. Unknown names are rejected.
             */
            name: string;
            /**
             * Values
             * @description Values to match; a product matches when it has ANY of them. Values are canonical lowercase handles and may contain spaces. Taxonomy attribute values may omit the attribute prefix: temple_color=gold means temple_color__gold.
             */
            values: string[];
        };
        /**
         * Gender
         * @enum {string}
         */
        Gender: "male" | "female" | "unisex";
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** IdentifiersView */
        IdentifiersView: {
            /** Gtin */
            gtin?: string | null;
            /** Productgroupid */
            productGroupId?: string | null;
            /** Productid */
            productId?: string | null;
        };
        /**
         * MeKey
         * @description The calling API key — identity and provenance, never the secret.
         */
        MeKey: {
            /**
             * Id
             * @description Key id (the middle segment of the API key).
             */
            id: string;
            /**
             * Prefix
             * @description Non-secret display prefix, e.g. `octo_live_3f9c1a2b4d`. Safe to print and log: the secret segment of the key is never included. `null` only when the key's metadata row cannot be read.
             */
            prefix?: string | null;
            /**
             * Source
             * @description How the key was created (`ui`, `coding_agent`, or `id_jag`). **Omitted entirely** — not `null` — while the backing column does not exist yet (agent-onboarding plan Phase 2). Treat an absent field as *unknown*, never as *no source*.
             */
            source?: string | null;
        };
        /**
         * MeOrganization
         * @description The organization the presented credential belongs to.
         */
        MeOrganization: {
            /**
             * Id
             * @description Octogen organization id (a UUID).
             */
            id: string;
            /**
             * Name
             * @description Human-readable organization name.
             */
            name: string;
            /**
             * Slug
             * @description URL-safe organization slug.
             */
            slug: string;
            /**
             * Type
             * @description Organization type. `catalog_partner` (labelled *Developer* in the Platform UI) is the only type allowed on `/v1`; a `merchant` key is refused everywhere on `/v1`, including this endpoint, so this field explains a `403` rather than being a way around it.
             * @enum {string}
             */
            type: "merchant" | "catalog_partner";
        };
        /**
         * MeQuotas
         * @description Self-serve resource quotas for the calling organization.
         */
        MeQuotas: Record<string, unknown>;
        /**
         * MeRateLimit
         * @description The rate-limit bucket this very request was charged against.
         *
         *     Mirrors the ``X-RateLimit-*`` headers on the same response; it is in the
         *     body so a client that only parses JSON still sees its allowance. ``null``
         *     on the parent object when the limiter is disabled.
         */
        MeRateLimit: {
            /**
             * Limit
             * @description Requests allowed per window for this caller.
             */
            limit: number;
            /**
             * Remaining
             * @description Tokens left in the bucket right now.
             */
            remaining: number;
            /**
             * Resetat
             * Format: date-time
             * @description When the bucket is fully refilled (UTC, RFC 3339).
             */
            resetAt: string;
        };
        /**
         * MerchantProductImageMetadataView
         * @description One product image: source URL, Octogen-hosted copy, and display metadata.
         */
        MerchantProductImageMetadataView: {
            /**
             * Cdnurl
             * @description Octogen-hosted CDN copy of this image, or null when no hosted copy exists yet. Prefer it and fall back to url.
             */
            cdnUrl?: string | null;
            /**
             * Height
             * @description Pixel height of the hosted image.
             */
            height?: number | null;
            /**
             * Mimetype
             * @description Image format of the hosted copy (predominantly image/webp).
             */
            mimeType?: string | null;
            /**
             * Sizebytes
             * @description File size of the hosted image in bytes.
             */
            sizeBytes?: number | null;
            /**
             * Url
             * @description Original image URL on the merchant storefront. Always present.
             */
            url: string;
            /**
             * Width
             * @description Pixel width of the hosted image.
             */
            width?: number | null;
        };
        /**
         * MerchantProductListItem
         * @description Compact product representation for list, grid, or search results.
         */
        MerchantProductListItem: {
            brand?: components["schemas"]["BrandView"] | null;
            /**
             * Catalogdisplayname
             * @description Display name of the catalog that supplied it.
             */
            catalogDisplayName?: string | null;
            /**
             * Catalogkey
             * @description Catalog that supplied this product. Present for search/list results so cross-catalog searches can link back to the correct catalog.
             */
            catalogKey?: string | null;
            /**
             * Categorypath
             * @description Taxonomy category path, root first, in the names the `category_path.depth_N` facets accept.
             */
            categoryPath?: string[] | null;
            /**
             * Colors
             * @description Product-family color labels; the linked variant may differ.
             */
            colors?: string[] | null;
            /**
             * Currency
             * @description ISO 4217 currency of the prices; null when unknown or mixed.
             */
            currency?: string | null;
            /** Currentprice */
            currentPrice?: number | null;
            /**
             * Displaymatchscore
             * @description User-facing match score normalized for the current result set. This is intended for display only and is not comparable across queries.
             */
            displayMatchScore?: number | null;
            /** @description Target gender; null when unknown or when several are listed. */
            gender?: components["schemas"]["Gender"] | null;
            /**
             * Images
             * @default []
             */
            images: components["schemas"]["MerchantProductImageMetadataView"][];
            /**
             * Imageurl
             * @description Deprecated: primary image CDN URL, kept populated during migration. Read primaryImage instead.
             */
            imageUrl?: string | null;
            /**
             * Instock
             * @description Product-family availability; null when unknown. Does not establish stock for a specific color or size.
             */
            inStock?: boolean | null;
            /**
             * Isactive
             * @default true
             */
            isActive: boolean;
            /** Originalprice */
            originalPrice?: number | null;
            /** @description The product's display image with full metadata. Its url is the merchant source URL; cdnUrl carries the hosted copy when one exists. */
            primaryImage?: components["schemas"]["MerchantProductImageMetadataView"] | null;
            /** Producturl */
            productUrl: string;
            rating?: components["schemas"]["RatingView"] | null;
            /**
             * Rawscore
             * @description Raw Elasticsearch score for the source hit. Useful for debugging; not normalized across queries or strategies.
             */
            rawScore?: number | null;
            /**
             * Sizes
             * @description Product-family size labels.
             */
            sizes?: string[] | null;
            /** Title */
            title?: string | null;
            /** Updatedat */
            updatedAt?: string | null;
            /** Uuid */
            uuid: string;
        };
        /**
         * MerchantProductUrlLookupResponse
         * @description Source-aware product URL lookup result.
         *
         *     Indexed results retain catalog ownership and a complete indexed product view.
         *     On-demand and client-HTML results use the same product DTO without
         *     fabricating indexed identity or lifecycle state: ``client_html`` results
         *     come from ``POST /products/resolve-from-html``, where the caller supplied
         *     the page bytes and nothing was fetched or cached.
         */
        MerchantProductUrlLookupResponse: {
            /** Cachestatus */
            cacheStatus?: ("hit" | "miss" | "refresh") | null;
            /**
             * Canonicalurl
             * @description For catalog_extractor results this is null unless page-declared evidence is available. For shallow on-demand and client_html results: the canonical URL the product page declares (JSON-LD Product/variant url, link rel=canonical, selected Offer.url, or og:url); when the page declares none the resolver falls back to the final fetched URL (on-demand) or the caller-supplied url (client_html), so a non-null value is not proof of a declaration. Null for indexed results — we do not yet store the page-declared canonical for indexed products. For follow-up lookups use normalizedUrl (indexed, catalog_extractor, and client_html results) or resolvedUrl (shallow on-demand results), not this field.
             */
            canonicalUrl?: string | null;
            /** Catalogdisplayname */
            catalogDisplayName?: string | null;
            /** Catalogkey */
            catalogKey?: string | null;
            /**
             * Matchedvia
             * @description Debug: which probe arm of the URL lookup ladder resolved the product — normalized_alias | exact | normalized_exact | loose | structural_alias | learned_alias:<rule_id>. Absent for on-demand results and legacy paths. Informational only; values may be extended.
             */
            matchedVia?: string | null;
            /**
             * Normalizedurl
             * @description Stable URL for this product that callers should reuse on follow-up lookups. For indexed results this is the matched product's stored normalized URL, falling back to its exact indexed URL for legacy rows. For client_html results it is Octogen's deterministic normalization of requestedUrl, falling back to canonicalUrl when the caller supplied no URL. That normalization forces https, strips leading www., fragments and known tracking params, and sorts remaining query params. For catalog extraction it uses shared normalization; for shallow on-demand results reuse resolvedUrl instead.
             */
            normalizedUrl?: string | null;
            product: components["schemas"]["MerchantProductView"];
            /**
             * Requestedurl
             * @description The URL the caller submitted, echoed verbatim. For client_html results this is the variant-qualified identity: storefronts commonly record a shopper's variant selection only in URL query parameters, and canonicalUrl conventionally drops them — key on this field when variants must stay distinct.
             */
            requestedUrl?: string | null;
            /** Requestid */
            requestId?: string | null;
            resolution?: components["schemas"]["ProductResolutionMetadata"] | null;
            /**
             * Resolvedurl
             * @description Final fetched URL for shallow resolution; crawler-accepted URL for catalog extraction. Populated for on-demand results only.
             */
            resolvedUrl?: string | null;
            /**
             * Source
             * @enum {string}
             */
            source: "indexed" | "on_demand" | "client_html";
            /** Sourcebaseurl */
            sourceBaseUrl?: string | null;
            /**
             * Warnings
             * @description Stable, deduplicated warning codes for on-demand and
             *     client-HTML results. Renames or removals are breaking changes; clients should
             *     tolerate unknown additions. Current successful-response vocabulary:
             *
             *     | Code | Overview |
             *     | --- | --- |
             *     | `source_url_missing` | The client-HTML request omitted `url`. |
             *     | `multiple_product_nodes` | Multiple JSON-LD product candidates were found; the strongest was selected. |
             *     | `variant_url_no_match` | The selected candidate URL did not match the submitted URL; this can be a sibling product or the same product with query parameters dropped. |
             *     | `malformed_json_ld` | At least one malformed JSON-LD block was skipped. |
             *     | `canonical_invalid` | The page declared a canonical URL with an unusable hostname—often because two URLs were accidentally concatenated. Octogen discarded it and tried another URL source. |
             *     | `canonical_cross_origin` | The canonical URL's hostname is neither the submitted hostname nor its parent or subdomain. This may indicate cross-site or incorrect product metadata. |
             *     | `canonical_listing_page` | The canonical URL looks like a parent listing or category page. |
             *     | `price_currency_missing` | A price was extracted without a currency. |
             *     | `product_fields_clamped` | One or more extracted fields were adjusted to fit API limits—for example, long text was truncated, extra or invalid image URLs were removed, or a negative price was omitted. |
             *
             *     For shallow and client-HTML resolution, a missing canonical URL produces
             *     `404 product_not_found`, not a warning in a successful response. Catalog
             *     extraction can succeed with a null canonicalUrl. See the integration guide for selection rules, edge cases,
             *     and recommended handling.
             */
            warnings?: string[];
        };
        /**
         * MerchantProductView
         * @description Full product detail view returned by product lookup/detail endpoints.
         *
         *     ``uuid`` and ``isActive`` are nullable because an on-demand result is
         *     intentionally ephemeral and has no indexed identity or lifecycle state.
         *     Indexed projections continue to populate both fields.
         */
        MerchantProductView: {
            audience?: components["schemas"]["AudienceView"] | null;
            brand?: components["schemas"]["BrandView"] | null;
            /**
             * Breadcrumbs
             * @default []
             */
            breadcrumbs: components["schemas"]["BreadcrumbView"][];
            /**
             * Catalogkey
             * @description Catalog that supplied this product. Present for search/list results so cross-catalog searches can link back to the correct catalog.
             */
            catalogKey?: string | null;
            /**
             * Categories
             * @default []
             */
            categories: components["schemas"]["CategoryView"][];
            /**
             * Colors
             * @default []
             */
            colors: components["schemas"]["ColorView"][];
            /** Currency */
            currency?: string | null;
            /** Currentprice */
            currentPrice?: number | null;
            /** Description */
            description?: string | null;
            /**
             * @default {
             *       "fit": [],
             *       "materials": [],
             *       "patterns": []
             *     }
             */
            details: components["schemas"]["ProductDetailsView"];
            /**
             * Displaymatchscore
             * @description User-facing match score normalized for the current result set. This is intended for display only and is not comparable across queries.
             */
            displayMatchScore?: number | null;
            enrichment?: components["schemas"]["ProductEnrichment"] | null;
            /** @default {} */
            identifiers: components["schemas"]["IdentifiersView"];
            /**
             * Images
             * @default []
             */
            images: components["schemas"]["MerchantProductImageMetadataView"][];
            /**
             * Imageurl
             * @description Deprecated: primary image CDN URL, kept populated during migration. Read primaryImage instead.
             */
            imageUrl?: string | null;
            /** Instock */
            inStock?: boolean | null;
            /** Isactive */
            isActive?: boolean | null;
            /** Originalprice */
            originalPrice?: number | null;
            /** @description The product's display image with full metadata. Its url is the merchant source URL; cdnUrl carries the hosted copy when one exists. */
            primaryImage?: components["schemas"]["MerchantProductImageMetadataView"] | null;
            /** Producturl */
            productUrl: string;
            /**
             * Promotions
             * @default []
             */
            promotions: components["schemas"]["PromotionView"][];
            rating?: components["schemas"]["RatingView"] | null;
            /**
             * Rawscore
             * @description Raw Elasticsearch score for the source hit. Useful for debugging; not normalized across queries or strategies.
             */
            rawScore?: number | null;
            /**
             * Reviews
             * @default []
             */
            reviews: components["schemas"]["ReviewView"][];
            /**
             * Sizes
             * @default []
             */
            sizes: string[];
            /**
             * Tags
             * @default []
             */
            tags: string[];
            /** Title */
            title?: string | null;
            /** Updatedat */
            updatedAt?: string | null;
            /** Uuid */
            uuid: string | null;
            /**
             * Variants
             * @default []
             */
            variants: components["schemas"]["MerchantVariantView"][];
            /**
             * Videos
             * @default []
             */
            videos: components["schemas"]["VideoView"][];
        };
        /**
         * MerchantVariantView
         * @description A single variant of a product (size/color/sku combo).
         */
        MerchantVariantView: {
            color?: components["schemas"]["ColorView"] | null;
            /** Imageurl */
            imageUrl?: string | null;
            /** Instock */
            inStock?: boolean | null;
            /** Producturl */
            productUrl?: string | null;
            /** Size */
            size?: string | null;
            /** Sku */
            sku?: string | null;
        };
        /**
         * MeResponse
         * @description ``GET /v1/me`` — the caller's own identity and limits.
         *
         *     ``organization``, ``key`` and ``quotas`` are ``null`` for a super-admin
         *     operator bearer, which is org-less and key-less by construction.
         *     ``principal`` says which case a client is looking at without making it
         *     infer from nulls.
         */
        MeResponse: {
            /** @description The calling API key; `null` for a super admin. */
            key?: components["schemas"]["MeKey"] | null;
            /** @description The credential's organization; `null` for a super admin. */
            organization?: components["schemas"]["MeOrganization"] | null;
            /**
             * Principal
             * @description Which credential kind authenticated this request.
             * @enum {string}
             */
            principal: "api_key" | "super_admin";
            /** @description Resource quotas for the organization; `null` for a super admin. */
            quotas?: components["schemas"]["MeQuotas"] | null;
            /** @description Current rate-limit posture; `null` when the limiter is off. */
            rateLimit?: components["schemas"]["MeRateLimit"] | null;
        };
        /**
         * PriceBucket
         * @description One histogram bar: products whose current price is in ``[min, max)``.
         */
        PriceBucket: {
            /**
             * Count
             * @description Products priced in this range.
             */
            count: number;
            /**
             * Max
             * @description Exclusive upper edge.
             */
            max: number;
            /**
             * Min
             * @description Inclusive lower edge.
             */
            min: number;
        };
        /**
         * PriceDistribution
         * @description Current-price histogram of a catalog's priced products.
         *
         *     Prices are in the catalog's listing currency (usually USD). Buckets span
         *     roughly the 1st to 95th percentile so a long tail cannot flatten the
         *     chart; products outside that span are counted in ``below``/``above``.
         */
        PriceDistribution: {
            /**
             * Above
             * @description Priced products at or above the last bucket.
             */
            above: number;
            /**
             * Below
             * @description Priced products below the first bucket.
             */
            below: number;
            /**
             * Buckets
             * @description Equal-width, contiguous buckets, lowest first.
             */
            buckets: components["schemas"]["PriceBucket"][];
            /**
             * Median
             * @description Approximate median current price.
             */
            median: number;
            /**
             * Populated
             * @description Products with a current price above zero.
             */
            populated: number;
        };
        /** ProductDetailsView */
        ProductDetailsView: {
            /** Dimensions */
            dimensions?: string | null;
            /**
             * Fit
             * @default []
             */
            fit: string[];
            /**
             * Materials
             * @default []
             */
            materials: string[];
            /**
             * Patterns
             * @default []
             */
            patterns: string[];
        };
        /** ProductEnrichment */
        ProductEnrichment: {
            /**
             * Age Groups
             * @description Target age groups for the product.
             */
            readonly age_groups: components["schemas"]["AgeGroup"][] | null;
            /**
             * Attribute Handles
             * @description Taxonomy attributes keyed by Attribute.handle with values as AttributeValue.handle lists.
             */
            attribute_handles?: {
                [key: string]: string[];
            } | null;
            /**
             * Attributes
             * @description Shopify taxonomy attributes mapped to their values.
             */
            attributes?: {
                [key: string]: string[];
            } | null;
            /**
             * Brand Id
             * @description Unique brand identifier in the product_brands table.
             */
            brand_id?: string | null;
            /** @description Canonical brand identifier in the product_brands table. */
            canonical_brand?: components["schemas"]["CanonicalBrand"] | null;
            /**
             * Category Path
             * @description Shopify taxonomy category path (excluding 'Apparel & Accessories' root).
             */
            category_path?: string[] | null;
            /**
             * Classification
             * @description Classification-axis values keyed by axis handle (e.g. {'gender': ['female'], 'age_group': ['adult']}). Only axes the product's taxonomy section declares are present.
             */
            classification?: {
                [key: string]: string[];
            };
            /**
             * Color
             * @description List of specific colors of the product matched from existing color fields (e.g., ['Crimson', 'Navy Blue']).
             */
            color?: components["schemas"]["ColorName"][] | null;
            /**
             * Color Family
             * @description List of color families corresponding to each color by index (e.g., ['Red', 'Blue']).
             */
            color_family?: components["schemas"]["ColorFamily"][] | null;
            /**
             * Color Indices
             * @description Indices of the resolved colors in the palette.
             */
            color_indices?: number[] | null;
            /**
             * Fully Qualified Name
             * @description Fully qualified taxonomy path for the resolved category.
             */
            fully_qualified_name?: string | null;
            /** @description The target gender of the product. */
            readonly gender: components["schemas"]["Gender"] | null;
            /**
             * Image With Single Product
             * @description Whether the image only contains a single product.
             */
            image_with_single_product?: boolean | null;
            /**
             * Is Activewear
             * @description Whether the product is activewear/athleisure (e.g., sports bras, running shorts).
             */
            is_activewear?: boolean | null;
            /**
             * Structured Attributes
             * @description Taxonomy attributes with full metadata and typed values.
             */
            structured_attributes?: components["schemas"]["Attribute"][] | null;
            /**
             * Styles
             * @description Styles for the product.
             */
            styles?: string[] | null;
            /**
             * Summary
             * @description Summary of the product.
             */
            summary?: string | null;
            /**
             * Tags
             * @description Tags for the product.
             */
            tags?: string[] | null;
            /**
             * Taxonomy Uuid
             * @description UUID of the resolved taxonomy node.
             */
            taxonomy_uuid?: string | null;
            /**
             * Type
             * @description Type of the product.
             */
            type?: string | null;
            /**
             * Type Synonyms
             * @description Synonyms for the type of the product.
             */
            type_synonyms?: string[] | null;
        };
        /**
         * ProductResolutionMetadata
         * @description Public, provider-neutral metadata for an on-demand resolution.
         */
        ProductResolutionMetadata: {
            /**
             * Completeness
             * @enum {string}
             */
            completeness: "complete" | "partial";
            /**
             * Method
             * @enum {string}
             */
            method: "json_ld" | "open_graph" | "html_meta" | "resolved_url" | "catalog_extractor";
            /** Missingfields */
            missingFields?: string[];
            /** Rendered */
            rendered?: boolean | null;
        };
        /**
         * ProductResolverCachePolicyV1
         * @enum {string}
         */
        ProductResolverCachePolicyV1: "prefer_cache" | "refresh";
        /** ProgrammaticAttributeCounts */
        ProgrammaticAttributeCounts: {
            /**
             * Facetname
             * @description The search facet name for its values.
             */
            facetName: string;
            /**
             * Handle
             * @description The attribute handle you sent.
             */
            handle: string;
            /**
             * Values
             * @description Values with at least one product, most products first.
             */
            values: components["schemas"]["ProgrammaticFacetValueCount"][];
        };
        /** ProgrammaticCategoryCount */
        ProgrammaticCategoryCount: {
            /** Count */
            count: number;
            /**
             * Key
             * @description The `key` you sent for the category.
             */
            key: string;
        };
        /**
         * ProgrammaticFacetCountCategory
         * @description One category to count, named by the facets that select it.
         */
        ProgrammaticFacetCountCategory: {
            /**
             * Facets
             * @description Facets selecting this category, such as a `GET /taxonomy/categories` entry's `facets`. Each name at most once.
             */
            facets: components["schemas"]["Facet"][];
            /**
             * Key
             * @description Your identifier for this category; its count carries it back.
             */
            key: string;
        };
        /**
         * ProgrammaticFacetCountsRequest
         * @description Count the products a search would filter to, by category and value.
         *
         *     The filter fields mean exactly what they mean on `POST /products/search`.
         *     The rest say what to count.
         */
        ProgrammaticFacetCountsRequest: {
            /**
             * Attributes
             * @description Attribute handles, such as `neckline`, whose values to count. Find a category's handles with `GET /taxonomy/attributes`. A value's count ignores your own facet on that attribute, so every value shows what selecting it would return.
             */
            attributes?: string[];
            /** Brand Quality Max */
            brand_quality_max?: number | null;
            /** Brand Quality Min */
            brand_quality_min?: number | null;
            /**
             * Catalogs
             * @description Catalog keys to count in. Omit to count every catalog your key can access. Keys your key cannot access count nothing.
             */
            catalogs?: string[] | null;
            /**
             * Categories
             * @description Categories to count. Each count is the products matching the filters above and the category's own facets.
             */
            categories?: components["schemas"]["ProgrammaticFacetCountCategory"][];
            /**
             * Exclude Facets
             * @description Filters a product must not match, as on search.
             */
            exclude_facets?: components["schemas"]["Facet"][] | null;
            /**
             * Facet Names
             * @description Facets whose values to count, ignoring your own facet of that name like `attributes`. `category_path.depth_0` counts top-level categories.
             */
            facet_names?: ("color_family" | "category_path.depth_0")[];
            /**
             * Facets
             * @description Filters a product must match, as on search. A facet you send replaces any understood facet of the same name. Each name at most once.
             */
            facets?: components["schemas"]["Facet"][] | null;
            /**
             * Fallback Category
             * @description Category path to filter to when understanding finds no category in `q`, as on search. Requires `q`.
             */
            fallback_category?: string[] | null;
            /**
             * Omit Generated Facets
             * @description Understood facets to drop, as on search. Requires `q`.
             */
            omit_generated_facets?: string[] | null;
            /** Price Max */
            price_max?: number | null;
            /** Price Min */
            price_min?: number | null;
            /**
             * Q
             * @description Free-text query, understood as search understands it. The category, gender, colour, brand, price and attribute filters understood from it apply to the counts; the text itself does not narrow them. Blank is the same as omitted.
             */
            q?: string | null;
            /**
             * Value Limit
             * @description Most values returned per attribute and per facet, by count.
             * @default 100
             */
            value_limit: number;
        };
        /**
         * ProgrammaticFacetCountsResponse
         * @description Product counts under one set of search filters.
         */
        ProgrammaticFacetCountsResponse: {
            /**
             * Attributes
             * @description One entry per requested attribute, in request order.
             */
            attributes: components["schemas"]["ProgrammaticAttributeCounts"][];
            /**
             * Categories
             * @description One count per requested category, in request order.
             */
            categories: components["schemas"]["ProgrammaticCategoryCount"][];
            /** @description The filters and bounds the counts applied, with each facet's origin, as search reports them. */
            effectiveQuery: components["schemas"]["ProgrammaticProductSearchEffectiveQuery"];
            /**
             * Facets
             * @description One entry per requested facet name, in request order.
             */
            facets: components["schemas"]["ProgrammaticFacetValueCounts"][];
        };
        /** ProgrammaticFacetValueCount */
        ProgrammaticFacetValueCount: {
            /** Count */
            count: number;
            /**
             * Value
             * @description A value to send back in that facet's `values`.
             */
            value: string;
        };
        /** ProgrammaticFacetValueCounts */
        ProgrammaticFacetValueCounts: {
            /**
             * Name
             * @description The facet name you sent.
             */
            name: string;
            /**
             * Values
             * @description Values with at least one product, most products first.
             */
            values: components["schemas"]["ProgrammaticFacetValueCount"][];
        };
        /** ProgrammaticMoreLikeThisEffectiveFacet */
        ProgrammaticMoreLikeThisEffectiveFacet: {
            /** Name */
            name: string;
            /** Source */
            source?: string | null;
            /** Values */
            values: string[];
        };
        /** ProgrammaticMoreLikeThisEffectiveQuery */
        ProgrammaticMoreLikeThisEffectiveQuery: {
            /** Brandqualitymax */
            brandQualityMax?: number | null;
            /** Brandqualitymin */
            brandQualityMin?: number | null;
            /** Catalogs */
            catalogs?: string[] | null;
            /** Degradedtotextfallback */
            degradedToTextFallback?: boolean | null;
            /** Exclusionfacets */
            exclusionFacets?: components["schemas"]["ProgrammaticMoreLikeThisEffectiveFacet"][] | null;
            /** Facets */
            facets?: components["schemas"]["ProgrammaticMoreLikeThisEffectiveFacet"][] | null;
            /** Generationstages */
            generationStages?: {
                [key: string]: number;
            } | null;
            /** Imagehashmatched */
            imageHashMatched?: boolean | null;
            /** Limit */
            limit: number;
            matchedProduct?: components["schemas"]["ProgrammaticMoreLikeThisMatchedProduct"] | null;
            /** Pricemax */
            priceMax?: number | null;
            /** Pricemin */
            priceMin?: number | null;
            /** Rankingembeddingcolumns */
            rankingEmbeddingColumns?: string[] | null;
            /** Reconciledfacets */
            reconciledFacets?: string[] | null;
            relaxation?: components["schemas"]["ProgrammaticProductSearchRelaxation"] | null;
            /** Retrievalembeddingcolumns */
            retrievalEmbeddingColumns?: string[] | null;
            /** Text */
            text: string;
        };
        /**
         * ProgrammaticMoreLikeThisImageSource
         * @description Source image for a More Like This request (OCT-3654 phase 1).
         *
         *     The image resolves through the generation pipeline (~5-8s typical) —
         *     see the MLT image-input proposal for the phased resolution ladder.
         */
        ProgrammaticMoreLikeThisImageSource: {
            /**
             * B64
             * @description Base64-encoded image bytes (decoded size capped at 8 MB).
             */
            b64?: string | null;
            /**
             * Url
             * @description HTTP(S) image URL, fetched server-side. Only hosts on the deployment allowlist are permitted.
             */
            url?: string | null;
        };
        /**
         * ProgrammaticMoreLikeThisMatchedProduct
         * @description The indexed product a submitted image byte-matched (debug only).
         */
        ProgrammaticMoreLikeThisMatchedProduct: {
            /** Catalogkey */
            catalogKey?: string | null;
            /** Uuid */
            uuid?: string | null;
        };
        /**
         * ProgrammaticMoreLikeThisRequest
         * @description Programmatic More Like This request.
         */
        ProgrammaticMoreLikeThisRequest: {
            /**
             * Brand Quality Max
             * @description Inclusive maximum brand quality score, 1 to 6.
             */
            brand_quality_max?: number | null;
            /**
             * Brand Quality Min
             * @description Inclusive minimum brand quality score, 1 (very poor) to 6 (exceptional).
             */
            brand_quality_min?: number | null;
            /**
             * Catalogs
             * @description Optional catalog allowlist for the similar-products retrieval (breaking replacement for the former single-valued `catalog`). Restricts RESULTS to these catalogs only; source resolution is deliberately unrestricted so the source product may live outside the allowlist. Keys are not validated against the caller's grants — a key outside the caller's resolved scope simply matches nothing. When omitted, retrieval spans every catalog the caller's scope permits.
             */
            catalogs?: string[] | null;
            /**
             * Cursor
             * @description Opaque pagination cursor
             */
            cursor?: string | null;
            /**
             * Debug
             * @description If true, include the curated effective query in the response.
             * @default false
             */
            debug: boolean;
            /**
             * Exclude Facets
             * @description Filters a product must not match: products with any listed value of any listed facet are removed. Each name at most once.
             */
            exclude_facets?: components["schemas"]["Facet"][] | null;
            /**
             * Facets
             * @description Filters a product must match: every facet, and any value within a facet. A facet you send replaces every generated facet of the same name (a `color` or `color_family` facet replaces generated facets on both colour axes); values are never unioned, and the other generated facets stay. Never relaxed. Each name at most once. Replaces `include_facets`, which is rejected.
             */
            facets?: components["schemas"]["Facet"][] | null;
            /**
             * Limit
             * @default 12
             */
            limit: number;
            /**
             * Omit Generated Facets
             * @description Names of SERVER-GENERATED facets to omit before search and relaxation — the correction knob for a generated filter the caller can see is wrong in effectiveQuery and has no value of their own to put in its place (a same-name `facets` entry replaces it instead). Unknown names are ignored; caller `facets` and `exclude_facets` are never affected.
             */
            omit_generated_facets?: string[] | null;
            /**
             * Price Max
             * @description Inclusive maximum price. Combined with the `price_preference` bound by keeping the lower one.
             */
            price_max?: number | null;
            /**
             * Price Min
             * @description Inclusive minimum price. Combined with the `price_preference` bound by keeping the higher one.
             */
            price_min?: number | null;
            /**
             * Price Preference
             * @description Relative price preference compared with the source product.
             * @default any
             * @enum {string}
             */
            price_preference: "lower" | "any" | "higher";
            /**
             * Ranking Embedding Columns
             * @description Embedding columns used to rescore and rank retrieved candidates. When omitted, ranking uses the base embedding.
             */
            ranking_embedding_columns?: components["schemas"]["EmbeddingColumn"][] | null;
            /**
             * Relax
             * @description Retry with generated facets dropped in stages, least trusted first, when page 1 comes back short, and return the first stage that fills it. For a `uuid` or `url` source, and for `sources`, page 1 is short when it has fewer than `min(5, limit)` results and no `nextCursor`; a stage is adopted only if it reaches that floor, or any result for an empty page. For an `image` source, only an empty page 1 is relaxed. Facets and bounds you send are never dropped. The rule is the same as search's: what you send is never silently dropped, but the server may drop its own inferences. Here the generated facets are Platform's inference from the source product, not words you sent, so `relax` defaults to true; search defaults to false because its generated facets come from your `q`. A relaxed page's cursor continues the same relaxed results and is refused with `relax: false`.
             * @default true
             */
            relax: boolean;
            /**
             * Retrieval Embedding Columns
             * @description Embedding columns used to retrieve candidate products. Overrides the server-selected default (style/tags embeddings when the source product has styles or tags, otherwise the base embedding).
             */
            retrieval_embedding_columns?: components["schemas"]["EmbeddingColumn"][] | null;
            /** @description The product or image to find similar products for. Send exactly one of `source` and `sources`. */
            source?: components["schemas"]["ProgrammaticMoreLikeThisSource"] | null;
            /**
             * Sources
             * @description Indexed product UUIDs to find products similar to as a set, for example a collection. Send exactly one of `source` and `sources`; each UUID at most once. Results exclude every source. One UUID behaves exactly like `source: {uuid}`. With several, their style and tag terms are blended into one query, most widely shared first; a facet is generated only when every source has it, with the values of all of them; and `price_preference` compares with the sources' median price.
             */
            sources?: string[] | null;
        };
        /** ProgrammaticMoreLikeThisResponse */
        ProgrammaticMoreLikeThisResponse: {
            effectiveQuery?: components["schemas"]["ProgrammaticMoreLikeThisEffectiveQuery"] | null;
            /** Items */
            items: components["schemas"]["MerchantProductListItem"][];
            /** Nextcursor */
            nextCursor?: string | null;
            /**
             * Requestid
             * @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID.
             */
            requestId: string;
            /**
             * Resolution
             * @description How the source was resolved. Product sources omit this; image sources report the resolution-ladder rung: 'image_query_generation' (pipeline ran) or 'cached_image_query' (served from the image-content-hash cache).
             */
            resolution?: string | null;
            source?: components["schemas"]["ProgrammaticMoreLikeThisSourceResponse"] | null;
            sourceImage?: components["schemas"]["ProgrammaticMoreLikeThisSourceImageResponse"] | null;
            /**
             * Sources
             * @description The resolved `sources`, in request order. Present only when the request sent `sources`.
             */
            sources?: components["schemas"]["ProgrammaticMoreLikeThisSourceResponse"][] | null;
        };
        /**
         * ProgrammaticMoreLikeThisSource
         * @description Source product identifier for a More Like This request.
         */
        ProgrammaticMoreLikeThisSource: {
            /** @description Source image to derive the query from (OCT-3654). Slower than url/uuid sources: the image runs through query generation (~5-8s typical). */
            image?: components["schemas"]["ProgrammaticMoreLikeThisImageSource"] | null;
            /**
             * Url
             * @description Canonical product URL to use as the source product.
             */
            url?: string | null;
            /**
             * Uuid
             * @description Indexed product UUID to use as the source product.
             */
            uuid?: string | null;
        };
        /**
         * ProgrammaticMoreLikeThisSourceImageResponse
         * @description Identity of an image source (no indexed product to reference).
         */
        ProgrammaticMoreLikeThisSourceImageResponse: {
            /**
             * Hash
             * @description Content hash of the submitted image bytes.
             */
            hash: string;
        };
        /**
         * ProgrammaticMoreLikeThisSourceResponse
         * @description Public source product identity returned by More Like This.
         */
        ProgrammaticMoreLikeThisSourceResponse: {
            /** Catalogkey */
            catalogKey: string;
            /** Producturl */
            productUrl: string;
            /** Title */
            title?: string | null;
            /** Uuid */
            uuid: string;
        };
        /**
         * ProgrammaticProductLookupRequest
         * @description Programmatic product lookup request.
         *
         *     V1 supports URL lookup only. Keep the request body object-shaped so future
         *     identifiers such as UUID can be added without overloading product search.
         */
        ProgrammaticProductLookupRequest: {
            /**
             * Format
             * @description Response representation. json (default) returns the structured MerchantProductUrlLookupResponse envelope. md and markdown are equivalent aliases that return the product as LLM-ready Markdown using the same Python renderer as Cosimo.
             * @default json
             * @enum {string}
             */
            format: "json" | "md" | "markdown";
            /**
             * Matchmode
             * @description Index match strictness. strict matches only exact/canonical URLs. loose (default) adds a lowest-priority fallback that ignores path case and query params, so a URL differing from an indexed product only by case (e.g. /Women/ vs /women/) or a non-indexed query param (e.g. Zara's ?v1=) still resolves. It also recognizes structural aliases: Shopify collection-scoped URLs (/collections/<x>/products/<handle>) resolve to the canonical /products/<handle> product. A strict/canonical hit always wins over a loose or alias one.
             * @default loose
             * @enum {string}
             */
            matchMode: "strict" | "loose";
            /**
             * @description Cache behavior when the request enters the on-demand path.
             * @default prefer_cache
             */
            onDemandCachePolicy: components["schemas"]["ProductResolverCachePolicyV1"];
            /**
             * Resolutionmode
             * @description Source selection policy. auto checks the index before resolving on demand; index_only never performs outbound work; on_demand_only skips the index.
             * @default auto
             * @enum {string}
             */
            resolutionMode: "auto" | "index_only" | "on_demand_only";
            /**
             * Url
             * @description Product URL to look up in the organization's granted catalogs and, when enabled and requested, resolve on demand.
             */
            url?: string | null;
        };
        /** ProgrammaticProductLookupResponse */
        ProgrammaticProductLookupResponse: {
            /** Cachestatus */
            cacheStatus?: ("hit" | "miss" | "refresh") | null;
            /**
             * Canonicalurl
             * @description For catalog_extractor results this is null unless page-declared evidence is available. For shallow on-demand and client_html results: the canonical URL the product page declares (JSON-LD Product/variant url, link rel=canonical, selected Offer.url, or og:url); when the page declares none the resolver falls back to the final fetched URL (on-demand) or the caller-supplied url (client_html), so a non-null value is not proof of a declaration. Null for indexed results — we do not yet store the page-declared canonical for indexed products. For follow-up lookups use normalizedUrl (indexed, catalog_extractor, and client_html results) or resolvedUrl (shallow on-demand results), not this field.
             */
            canonicalUrl?: string | null;
            /** Catalogdisplayname */
            catalogDisplayName?: string | null;
            /** Catalogkey */
            catalogKey?: string | null;
            /**
             * Matchedvia
             * @description Debug: which probe arm of the URL lookup ladder resolved the product — normalized_alias | exact | normalized_exact | loose | structural_alias | learned_alias:<rule_id>. Absent for on-demand results and legacy paths. Informational only; values may be extended.
             */
            matchedVia?: string | null;
            /**
             * Normalizedurl
             * @description Stable URL for this product that callers should reuse on follow-up lookups. For indexed results this is the matched product's stored normalized URL, falling back to its exact indexed URL for legacy rows. For client_html results it is Octogen's deterministic normalization of requestedUrl, falling back to canonicalUrl when the caller supplied no URL. That normalization forces https, strips leading www., fragments and known tracking params, and sorts remaining query params. For catalog extraction it uses shared normalization; for shallow on-demand results reuse resolvedUrl instead.
             */
            normalizedUrl?: string | null;
            product: components["schemas"]["MerchantProductView"];
            /**
             * Requestedurl
             * @description The URL the caller submitted, echoed verbatim. For client_html results this is the variant-qualified identity: storefronts commonly record a shopper's variant selection only in URL query parameters, and canonicalUrl conventionally drops them — key on this field when variants must stay distinct.
             */
            requestedUrl?: string | null;
            /**
             * Requestid
             * @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID.
             */
            requestId: string;
            resolution?: components["schemas"]["ProductResolutionMetadata"] | null;
            /**
             * Resolvedurl
             * @description Final fetched URL for shallow resolution; crawler-accepted URL for catalog extraction. Populated for on-demand results only.
             */
            resolvedUrl?: string | null;
            /**
             * Source
             * @enum {string}
             */
            source: "indexed" | "on_demand" | "client_html";
            /** Sourcebaseurl */
            sourceBaseUrl?: string | null;
            /**
             * Warnings
             * @description Stable, deduplicated warning codes for on-demand and
             *     client-HTML results. Renames or removals are breaking changes; clients should
             *     tolerate unknown additions. Current successful-response vocabulary:
             *
             *     | Code | Overview |
             *     | --- | --- |
             *     | `source_url_missing` | The client-HTML request omitted `url`. |
             *     | `multiple_product_nodes` | Multiple JSON-LD product candidates were found; the strongest was selected. |
             *     | `variant_url_no_match` | The selected candidate URL did not match the submitted URL; this can be a sibling product or the same product with query parameters dropped. |
             *     | `malformed_json_ld` | At least one malformed JSON-LD block was skipped. |
             *     | `canonical_invalid` | The page declared a canonical URL with an unusable hostname—often because two URLs were accidentally concatenated. Octogen discarded it and tried another URL source. |
             *     | `canonical_cross_origin` | The canonical URL's hostname is neither the submitted hostname nor its parent or subdomain. This may indicate cross-site or incorrect product metadata. |
             *     | `canonical_listing_page` | The canonical URL looks like a parent listing or category page. |
             *     | `price_currency_missing` | A price was extracted without a currency. |
             *     | `product_fields_clamped` | One or more extracted fields were adjusted to fit API limits—for example, long text was truncated, extra or invalid image URLs were removed, or a negative price was omitted. |
             *
             *     For shallow and client-HTML resolution, a missing canonical URL produces
             *     `404 product_not_found`, not a warning in a successful response. Catalog
             *     extraction can succeed with a null canonicalUrl. See the integration guide for selection rules, edge cases,
             *     and recommended handling.
             */
            warnings?: string[];
        };
        /**
         * ProgrammaticProductSearchEffectiveFacet
         * @description One facet that ran, and where it came from.
         */
        ProgrammaticProductSearchEffectiveFacet: {
            /** Name */
            name: string;
            /**
             * Relaxable
             * @description `true` for a facet you sent marked `relaxable`, which `relax` may drop. Absent otherwise.
             */
            relaxable?: boolean | null;
            /**
             * Source
             * @description `caller` for a facet you sent, `generated` for one understood from `q`. A `generated` name can go in `omit_generated_facets`.
             */
            source?: ("caller" | "generated") | null;
            /** Values */
            values: string[];
        };
        /**
         * ProgrammaticProductSearchEffectiveQuery
         * @description The search that actually ran, in the request's own vocabulary.
         *
         *     It is a report, not a request fragment: understood facets of one name can
         *     AND together, which a request cannot express.
         */
        ProgrammaticProductSearchEffectiveQuery: {
            /** Brandqualitymax */
            brandQualityMax?: number | null;
            /** Brandqualitymin */
            brandQualityMin?: number | null;
            /**
             * Catalogs
             * @description The `catalogs` allowlist as received, normalized and deduped.
             */
            catalogs?: string[] | null;
            /** Excludefacets */
            excludeFacets?: components["schemas"]["ProgrammaticProductSearchEffectiveFacet"][];
            /** Facets */
            facets?: components["schemas"]["ProgrammaticProductSearchEffectiveFacet"][];
            /** Pricemax */
            priceMax?: number | null;
            /** Pricemin */
            priceMin?: number | null;
            relaxation?: components["schemas"]["ProgrammaticProductSearchRelaxation"] | null;
            /** Similartobrands */
            similarToBrands?: string[] | null;
            /**
             * Text
             * @description Text matched against products: the understood rewrite of `q`, `q` itself with `understand: false`, or empty when browsing.
             */
            text: string;
            /**
             * Understood
             * @description Whether query understanding ran.
             */
            understood: boolean;
        };
        /**
         * ProgrammaticProductSearchPage
         * @description One page of search results.
         */
        ProgrammaticProductSearchPage: {
            /** @description The text, filters and bounds that actually ran, with each facet's origin. Present on every response. */
            effectiveQuery: components["schemas"]["ProgrammaticProductSearchEffectiveQuery"];
            /**
             * Items
             * @default []
             */
            items: components["schemas"]["MerchantProductListItem"][];
            /**
             * Nextcursor
             * @description Opaque cursor for the next page; pass it back verbatim as `cursor`. Absent on the last page. On search, consecutive pages can repeat a product: the first page is relevance-ranked while later pages are ordered by quality score from the first page's last item, so de-duplicate by `uuid` when concatenating pages.
             */
            nextCursor?: string | null;
            /**
             * Requestid
             * @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID.
             */
            requestId: string;
        };
        /**
         * ProgrammaticProductSearchRelaxation
         * @description What relaxation did on this request (`relax: true` only).
         */
        ProgrammaticProductSearchRelaxation: {
            /**
             * Declinedrounds
             * @description Stages tried that still returned nothing.
             * @default 0
             */
            declinedRounds: number;
            /**
             * Droppedfacets
             * @description Understood facets dropped to produce this page.
             */
            droppedFacets?: components["schemas"]["ProgrammaticProductSearchEffectiveFacet"][];
            /**
             * Rounds
             * @description Stages applied to produce this page; 0 if none.
             */
            rounds: number;
        };
        /**
         * ProgrammaticProductSearchRequest
         * @description Search indexed products by free text, filters, or both.
         *
         *     Each field controls one thing. ``q`` says what to find; ``facets``,
         *     ``exclude_facets`` and the bounds say what to keep; ``catalogs`` or
         *     ``stores`` says where to look; ``limit`` and ``cursor`` page. Combinations that would
         *     contradict each other are rejected with 422 rather than resolved silently.
         */
        ProgrammaticProductSearchRequest: {
            /**
             * Brand Quality Max
             * @description Inclusive maximum brand quality score, 1 to 6. Combined with any understood bound by keeping the stricter one.
             */
            brand_quality_max?: number | null;
            /**
             * Brand Quality Min
             * @description Inclusive minimum brand quality score, 1 (very poor) to 6 (exceptional). Combined with any understood bound by keeping the stricter one.
             */
            brand_quality_min?: number | null;
            /**
             * Catalogs
             * @description Catalog keys to search. Omit to search every catalog your key can access. Keys your key cannot access match nothing.
             */
            catalogs?: string[] | null;
            /**
             * Cursor
             * @description `nextCursor` from the previous page, passed back verbatim with the same request body. Later pages reuse the understanding of `q` that page 1 ran rather than understanding it again.
             */
            cursor?: string | null;
            /**
             * Debug
             * @description Reserved for diagnostic detail. `effectiveQuery` is returned on every response with or without it.
             * @default false
             */
            debug: boolean;
            /**
             * Diversity
             * @description Spread page 1 across retailers and drop products whose image repeats one already on the page. Page 1 only. No effect when you send `catalogs`, when your key is limited to specific catalogs, or with a `brand_name` facet. A cursor continues only with the `diversity` value it was minted under.
             * @default false
             */
            diversity: boolean;
            /**
             * Exclude Facets
             * @description Filters a product must not match: products with any listed value of any listed facet are removed. Each name at most once.
             */
            exclude_facets?: components["schemas"]["Facet"][] | null;
            /**
             * Facets
             * @description Filters a product must match: every facet, and any value within a facet. A facet you send replaces any understood facet of the same name (a colour facet replaces both understood colour facets) and is never relaxed unless you mark it `relaxable`. Each name at most once.
             */
            facets?: components["schemas"]["SearchFacet"][] | null;
            /**
             * Fallback Category
             * @description Category path, root first, to search when understanding finds no category in `q`, e.g. `["apparel & accessories", "clothing"]`. Each entry is a category name as the `category_path.depth_N` facets accept it, and the path must exist in the taxonomy. Not applied when the understood query has a `category_path.depth_0` facet or `facets` has any `category_path` facet. Applied levels are reported in `effectiveQuery` as `generated`, so `relax` can drop them and `omit_generated_facets` can remove them. Requires `q` with `understand: true`.
             */
            fallback_category?: string[] | null;
            /**
             * Limit
             * @description Maximum results per page.
             * @default 50
             */
            limit: number;
            /**
             * Omit Generated Facets
             * @description Names of understood facets to drop before searching, for a derived filter that is wrong and that you have no value of your own for. To replace a derived filter instead, send a facet of that name. Use the names shown in `effectiveQuery`; colour is omitted per axis (`color` or `color_family`). Requires understood `q`; a name may not also appear in `facets`.
             */
            omit_generated_facets?: string[] | null;
            /**
             * Price Max
             * @description Inclusive maximum price. Combined with any understood maximum by keeping the lower one.
             */
            price_max?: number | null;
            /**
             * Price Min
             * @description Inclusive minimum price. Combined with any understood minimum by keeping the higher one.
             */
            price_min?: number | null;
            /**
             * Q
             * @description Free-text query. Omit to browse by filters alone. By default it is understood: rewritten for retrieval, with category, gender, colour, brand, price and attribute filters derived from it. Blank is the same as omitted.
             */
            q?: string | null;
            /**
             * Relax
             * @description When `q` returns nothing, retry with filters dropped in stages (inferred brand attributes, then attributes, then colour and deep categories) and return the first stage with results. Drops understood filters and facets you marked `relaxable`; any other facet you send is never dropped. Requires `q`, and either `understand: true` or at least one `relaxable` facet. A relaxed page's cursor continues the same relaxed results.
             * @default false
             */
            relax: boolean;
            /**
             * Similar To Brands
             * @description Brand names whose style to favour. Ranks products by similarity to these brands' aesthetic; it does not filter. Replaces any brands understood from `q`.
             */
            similar_to_brands?: string[] | null;
            /**
             * Stores
             * @description Store domains to search, as `GET /stores/{domain}` takes them: bare hosts, matched without case or a leading `www.`. Each searches every catalog serving it; a domain no catalog serves is a 404 `domain_not_covered`. Send `catalogs` or `stores`, not both.
             */
            stores?: string[] | null;
            /**
             * Understand
             * @description Run query understanding on `q`. Set false to match `q` as written and filter only by the facets and bounds you send. Requires `q`.
             * @default true
             */
            understand: boolean;
        };
        /**
         * ProgrammaticResolveFromHtmlRequest
         * @description Resolve a product from caller-supplied HTML.
         *
         *     Stateless by contract: no index read, no outbound fetch, no caching — the
         *     response is derived entirely from the submitted document.
         */
        ProgrammaticResolveFromHtmlRequest: {
            /**
             * Html
             * @description Product page HTML to resolve. Capped at 5 MiB — the same bound the live on-demand fetch path enforces, so any page that path could retrieve is submittable here.
             */
            html: string;
            /**
             * Url
             * @description Optional, but strongly recommended: the page's source URL, ideally location.href read at the same instant the DOM was serialized. It anchors relative image URLs and JSON-LD candidate selection exactly like the live path's final fetched URL, and it is echoed back as requestedUrl — on storefronts that record an in-page variant selection only in the URL's query parameters, this is the only variant-qualified identity the response retains. When absent the page itself must declare its canonical URL (JSON-LD Product/variant url, link rel=canonical, selected Offer.url, or og:url) or resolution fails with product_not_found.
             */
            url?: string | null;
        };
        /** PromotionView */
        PromotionView: {
            /** Code */
            code?: string | null;
            /** Description */
            description?: string | null;
            /** Promotionid */
            promotionId?: string | null;
        };
        /** RatingView */
        RatingView: {
            /** Average */
            average?: number | null;
            /** Count */
            count?: number | null;
        };
        /**
         * RequestContext
         * @description Immutable observational metadata; never auth, query, or cache input.
         */
        RequestContext: {
            /**
             * Application
             * @default null
             */
            application: string | null;
            /**
             * Feature
             * @default null
             */
            feature: string | null;
            /**
             * Page View Id
             * @default null
             */
            page_view_id: string | null;
            /**
             * Session Id
             * @default null
             */
            session_id: string | null;
            /**
             * Trigger
             * @default null
             */
            trigger: ("user_search" | "page_load" | "filter_change" | "pagination" | "autoplay" | "prefetch" | "isr_refresh" | "background") | null;
            /**
             * User Agent
             * @description Reported original-client User-Agent, separate from observed HTTP User-Agent.
             * @default null
             */
            user_agent: string | null;
            /**
             * User Id
             * @default null
             */
            user_id: string | null;
            /** @default null */
            visitor: components["schemas"]["RequestVisitor"] | null;
        };
        /**
         * RequestVisitor
         * @description The caller's assessment; even 'verified_bot' is an untrusted report.
         */
        RequestVisitor: {
            /**
             * Bot Name
             * @default null
             */
            bot_name: string | null;
            /**
             * Classification
             * @default null
             */
            classification: ("likely_human" | "verified_bot" | "suspected_bot" | "unknown") | null;
            /**
             * Provider
             * @default null
             */
            provider: string | null;
        };
        /** ReviewView */
        ReviewView: {
            /** Author */
            author?: string | null;
            /** Body */
            body?: string | null;
            /** Publishedat */
            publishedAt?: string | null;
            /** Rating */
            rating?: number | null;
        };
        /**
         * SearchFacet
         * @description A filter a product must match, with the caller's say on relaxation.
         */
        SearchFacet: {
            /**
             * Name
             * @description Canonical facet name: gender, age_groups, product_type, brand_name, brand_slug, raw_brand_name, color, color_family, is_activewear, category_path.depth_0 through category_path.depth_6, a brand profile facet such as brand_origin_country, or a taxonomy attribute handle such as fit. The attribute named color is attribute_facets.color. Unknown names are rejected.
             */
            name: string;
            /**
             * Relaxable
             * @description Allow `relax` to drop this facet. It still replaces an understood facet of the same name and filters until a relaxation stage drops it; with `relax: false` it is never dropped. Only a name a relaxation stage covers may be marked: brand profile facets, taxonomy attributes, `color`, `color_family`, and `category_path.depth_2` and deeper. Any other name is rejected.
             * @default false
             */
            relaxable: boolean;
            /**
             * Values
             * @description Values to match; a product matches when it has ANY of them. Values are canonical lowercase handles and may contain spaces. Taxonomy attribute values may omit the attribute prefix: temple_color=gold means temple_color__gold.
             */
            values: string[];
        };
        /**
         * SimilarBrandsRequest
         * @description Find brands similar to a set of source brands.
         */
        SimilarBrandsRequest: {
            /**
             * Brands
             * @description Source brand names (case-insensitive) to find similar brands for.
             */
            brands: string[];
            /**
             * Exclusionfacets
             * @description Up to 20 exclusion filters, with the same names and value bounds as facets.
             */
            exclusionFacets?: components["schemas"]["BrandFacet"][] | null;
            /**
             * Facets
             * @description Up to 20 inclusion filters. Each needs 1..100 nonblank values of at most 256 characters. Product-only color, color_family, is_activewear and internal brand_quality_score are rejected.
             */
            facets?: components["schemas"]["BrandFacet"][] | null;
            /**
             * Limit
             * @description Maximum number of similar brands.
             * @default 24
             */
            limit: number;
        };
        /**
         * SimilarBrandsResponse
         * @description Brands ranked by text-query relevance or source-brand similarity.
         */
        SimilarBrandsResponse: {
            /**
             * Results
             * @description Matching brands, highest-ranked first.
             */
            results: components["schemas"]["SimilarBrandView"][];
            /**
             * Totalfound
             * @description Total number of matching brands found.
             */
            totalFound: number;
        };
        /**
         * SimilarBrandView
         * @description One similar brand.
         */
        SimilarBrandView: {
            /**
             * Branddescription
             * @description Short description of the brand.
             */
            brandDescription?: string | null;
            /**
             * Brandname
             * @description Name of the brand.
             */
            brandName?: string | null;
            /**
             * Brandslug
             * @description Canonical slug for the brand.
             */
            brandSlug?: string | null;
            /**
             * Branduuid
             * @description Unique identifier for the brand.
             */
            brandUuid: string;
            /**
             * Directorysubheading
             * @description Brand subheading for directory display.
             */
            directorySubheading?: string | null;
            /**
             * Domain
             * @description Primary website domain for the brand.
             */
            domain?: string | null;
        };
        /**
         * SimilarStoresRequest
         * @description POST /v1/stores/similar: profiled stores like the given ones.
         */
        SimilarStoresRequest: {
            /**
             * Limit
             * @default 24
             */
            limit: number;
            /**
             * Stores
             * @description Store domains to find neighbours for, as `GET /stores/{domain}` takes them. Each needs a published profile; several are averaged.
             */
            stores: string[];
        };
        /** StoreAssortmentProfile */
        StoreAssortmentProfile: {
            /** Distributions */
            distributions: components["schemas"]["StoreProfileDistribution"][];
            /**
             * Productcount
             * @description Observed indexed products in this scope.
             */
            productCount: number;
            /**
             * Summary
             * @description Description derived from this population.
             */
            summary: string;
        };
        /** StoreCatalogCoverage */
        StoreCatalogCoverage: {
            /**
             * Catalog
             * @description Catalog key.
             */
            catalog: string;
            /**
             * Catalogdisplayname
             * @description Human-readable display name for the catalog.
             */
            catalogDisplayName: string;
            /**
             * Computedat
             * @description When the snapshot was computed (UTC ISO 8601).
             */
            computedAt: string;
            /**
             * Fields
             * @description Populated public facets, ordered by `source` then coverage.
             */
            fields: components["schemas"]["DomainField"][];
            /** @description Current-price histogram; null when nothing is priced. */
            price?: components["schemas"]["PriceDistribution"] | null;
            /**
             * Productcount
             * @description Indexed product groups in the catalog.
             */
            productCount: number;
            /** @description Precomputed discovery profile for this catalog, or null when no usable profile is published: missing, revoked, expired, invalid, or temporarily unavailable profiles are null. Current public catalog eligibility and registry identity are rechecked. Coverage is still available when null. Empty profiles retain their zero-product evidence. Profile counts and timestamps belong to its own generation. */
            profile?: components["schemas"]["StoreProfile"] | null;
        };
        /**
         * StoreCoverageResponse
         * @description Coverage and optional profiles for catalogs serving the requested domain.
         */
        StoreCoverageResponse: {
            /**
             * Catalogs
             * @description One entry per catalog serving the domain, sorted by catalog. A shared domain does not imply that catalogs are the same store.
             */
            catalogs: components["schemas"]["StoreCatalogCoverage"][];
            /**
             * Host
             * @description Normalized requested domain; retained for compatibility.
             */
            host: string;
        };
        /** StoreDepartmentProfile */
        StoreDepartmentProfile: {
            /**
             * Categorypath
             * @description Canonical category path, root first.
             */
            categoryPath: string[];
            /** Departmentid */
            departmentId: string;
            /** Distributions */
            distributions: components["schemas"]["StoreProfileDistribution"][];
            /**
             * Productcount
             * @description Observed indexed products in this scope.
             */
            productCount: number;
            /**
             * Summary
             * @description Description derived from this population.
             */
            summary: string;
        };
        /**
         * StoreIdentity
         * @description One catalog is the initial store boundary; domains are aliases.
         */
        StoreIdentity: {
            /**
             * Catalog
             * @description Catalog key to pass in products/search's catalogs filter.
             */
            catalog: string;
            /** Displayname */
            displayName: string;
            /**
             * Domains
             * @description Normalized bare hosts, including primaryDomain.
             */
            domains: string[];
            /**
             * Primarydomain
             * @description Normalized bare primary host.
             */
            primaryDomain: string;
            /**
             * Storeid
             * @description Stable store identifier.
             */
            storeId: string;
        };
        /**
         * StoreProfile
         * @description One published profile generation, including its department evidence.
         */
        StoreProfile: {
            /**
             * Computedat
             * Format: date-time
             * @description Profile computation time, with timezone.
             */
            computedAt: string;
            /** Departments */
            departments: components["schemas"]["StoreDepartmentProfile"][];
            overall: components["schemas"]["StoreAssortmentProfile"];
            /**
             * Profileversion
             * @description Opaque published generation ID.
             */
            profileVersion: string;
            provenance: components["schemas"]["StoreProfileProvenance"];
            /**
             * Schemaversion
             * @constant
             */
            schemaVersion: "1";
            store: components["schemas"]["StoreIdentity"];
        };
        /**
         * StoreProfileDistribution
         * @description A field's distribution within one overall or department population.
         */
        StoreProfileDistribution: {
            /**
             * Approximate
             * @description Whether counts are approximate.
             */
            approximate: boolean;
            /**
             * Name
             * @description Canonical profile field name.
             */
            name: string;
            /**
             * Populatedcount
             * @description Products with a known value; others are unknown, not absent.
             */
            populatedCount: number;
            /**
             * Populationcount
             * @description Denominator for value shares.
             */
            populationCount: number;
            /**
             * Source
             * @description Brand-derived values describe stocked brands, not store policies.
             * @enum {string}
             */
            source: "product" | "enrichment" | "brands";
            /**
             * Truncated
             * @description True when additional values were omitted.
             */
            truncated: boolean;
            /**
             * Values
             * @description Value shares are count / populationCount (undefined for an empty population). Multi-valued field shares can sum to more than 100%.
             */
            values: components["schemas"]["StoreProfileValue"][];
        };
        /** StoreProfileProvenance */
        StoreProfileProvenance: {
            /**
             * Countingunit
             * @description One source product document; not necessarily a distinct style.
             * @constant
             */
            countingUnit: "indexed_product";
            /**
             * Observedat
             * Format: date-time
             * @description Source observation time, with timezone.
             */
            observedAt: string;
            /**
             * Taxonomyversion
             * @description Taxonomy version when known.
             */
            taxonomyVersion?: string | null;
        };
        /** StoreProfileValue */
        StoreProfileValue: {
            /**
             * Count
             * @description Products containing this value, once each.
             */
            count: number;
            /** Label */
            label: string;
            /**
             * Value
             * @description Canonical value identifier.
             */
            value: string;
        };
        /**
         * StoreSearchRequest
         * @description POST /v1/stores/search: profile discovery, without product-facet promises.
         */
        StoreSearchRequest: {
            /**
             * Limit
             * @default 24
             */
            limit: number;
            /**
             * Text
             * @description Describe the kind of store to discover.
             */
            text: string;
        };
        /**
         * StoreSearchResponse
         * @description Ranked unique stores; no exhaustive total or pagination promise.
         */
        StoreSearchResponse: {
            /** Results */
            results: components["schemas"]["StoreSearchResult"][];
        };
        /**
         * StoreSearchResult
         * @description One unique store, with profile evidence rather than live query counts.
         */
        StoreSearchResult: {
            /**
             * Computedat
             * Format: date-time
             */
            computedAt: string;
            /** @description Relevant department evidence, if any. Its counts describe that department's profile population, not matches to the query text. */
            matchedDepartment?: components["schemas"]["StoreDepartmentProfile"] | null;
            /** Profileversion */
            profileVersion: string;
            store: components["schemas"]["StoreIdentity"];
            /**
             * Summary
             * @description Published overall profile summary.
             */
            summary: string;
        };
        /**
         * TaxonomyAttribute
         * @description One taxonomy attribute definition.
         */
        TaxonomyAttribute: {
            /** Description */
            description?: string | null;
            /**
             * Facetname
             * @description The search facet name for this attribute; send its value handles under this name in `facets`. Null when the attribute is not filterable.
             */
            facetName: string | null;
            /**
             * Handle
             * @description Canonical attribute handle, such as `neckline`.
             */
            handle: string;
            /**
             * Matching
             * @description How a facet on this attribute matches; null when not filterable.
             */
            matching: string | null;
            /**
             * Name
             * @description Display name, such as `Neckline`.
             */
            name: string;
            /**
             * Valuecount
             * @description Number of canonical values.
             */
            valueCount: number;
        };
        /**
         * TaxonomyAttributePage
         * @description One page of the attributes a category carries.
         */
        TaxonomyAttributePage: {
            /** Attributes */
            attributes: components["schemas"]["TaxonomyAttribute"][];
            category: components["schemas"]["TaxonomyCategory"];
            /**
             * Nextoffset
             * @description Offset of the next page; repeat the request with it. Null on the last page.
             */
            nextOffset: number | null;
            /**
             * Taxonomyversion
             * @description Canonical taxonomy version name.
             */
            taxonomyVersion: string;
            /**
             * Total
             * @description Number of attributes across all pages.
             */
            total: number;
        };
        /**
         * TaxonomyAttributeValue
         * @description One canonical attribute value.
         */
        TaxonomyAttributeValue: {
            /**
             * Handle
             * @description Canonical value handle, such as `neckline__halter`; send it unchanged in the attribute facet's `values`.
             */
            handle: string;
            /**
             * Name
             * @description Display label, such as `Halter`.
             */
            name: string;
        };
        /**
         * TaxonomyAttributeValuePage
         * @description One page of an attribute's canonical values.
         */
        TaxonomyAttributeValuePage: {
            attribute: components["schemas"]["TaxonomyAttribute"];
            /**
             * Nextoffset
             * @description Offset of the next page; repeat the request with it. Null on the last page.
             */
            nextOffset: number | null;
            /**
             * Taxonomyversion
             * @description Canonical taxonomy version name.
             */
            taxonomyVersion: string;
            /**
             * Total
             * @description Number of values across all pages.
             */
            total: number;
            /** Values */
            values: components["schemas"]["TaxonomyAttributeValue"][];
        };
        /**
         * TaxonomyCategory
         * @description One canonical taxonomy category.
         */
        TaxonomyCategory: {
            /**
             * Childcount
             * @description Number of direct child categories.
             */
            childCount: number;
            /**
             * Depth
             * @description 0 for a root category.
             */
            depth: number;
            /**
             * Facets
             * @description Search `facets` that select this category, one `category_path.depth_N` facet per level; send them unchanged to `POST /products/search`. Null for a category too deep to filter on.
             */
            facets: components["schemas"]["Facet"][] | null;
            /**
             * Id
             * @description Canonical category UUID.
             */
            id: string;
            /**
             * Name
             * @description Display name, such as `Dresses`.
             */
            name: string;
            /**
             * Path
             * @description Fully qualified name, root first and ` > ` separated, such as `Apparel & Accessories > Clothing > Dresses`.
             */
            path: string;
        };
        /**
         * TaxonomyCategoryPage
         * @description One page of a category's children, or of the root categories.
         */
        TaxonomyCategoryPage: {
            /** Categories */
            categories: components["schemas"]["TaxonomyCategory"][];
            /**
             * Nextoffset
             * @description Offset of the next page; repeat the request with it. Null on the last page.
             */
            nextOffset: number | null;
            /** @description The requested parent category; null when listing roots. */
            parent: components["schemas"]["TaxonomyCategory"] | null;
            /**
             * Taxonomyversion
             * @description Canonical taxonomy version name.
             */
            taxonomyVersion: string;
            /**
             * Total
             * @description Number of children across all pages.
             */
            total: number;
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, unknown>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /** VideoView */
        VideoView: {
            /** Name */
            name?: string | null;
            /** Thumbnailurl */
            thumbnailUrl?: string | null;
            /** Url */
            url?: string | null;
        };
    };
    responses: never;
    parameters: {
        /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
        RequestContext: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getBrandDetails: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                /** @description Brand slug or case-insensitive name. */
                brand: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrandCoverageResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use `/v1`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The brand could not be resolved. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    browseBrandProducts: {
        parameters: {
            query?: {
                limit?: number;
                /** @description Rows to skip. Pagination stops at offset 10000: `hasMore` goes false there even when more rows exist. */
                offset?: number;
            };
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                /** @description Brand slug or case-insensitive name. */
                brand: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrandProductsPage"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use `/v1`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The brand could not be resolved. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    getBrandTopCategories: {
        parameters: {
            query?: {
                limit?: number;
                minLevel?: number;
            };
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                /** @description Brand slug or case-insensitive name. */
                brand: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrandTopCategoriesPage"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use `/v1`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The brand could not be resolved. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    searchBrandPrefix: {
        parameters: {
            query: {
                limit?: number;
                /** @description Canonical brand name prefix. */
                prefix: string;
            };
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": string[];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use `/v1`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The brand could not be resolved. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Brand search backend unavailable (safe to retry). */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    searchBrandsFromText: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BrandTextSearchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimilarBrandsResponse"];
                };
            };
            /** @description Unusable generated query or reference brands without embeddings. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use `/v1`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The brand could not be resolved. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Brand search backend unavailable (safe to retry). */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    searchSimilarBrands: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SimilarBrandsRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimilarBrandsResponse"];
                };
            };
            /** @description None of the requested brands have embeddings. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use `/v1`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The brand could not be resolved. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Brand search backend unavailable (safe to retry). */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    listUrlLists: {
        parameters: {
            query?: {
                /** @description Opaque page cursor. */
                cursor?: string | null;
                limit?: number;
            };
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CoverageUrlListListResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use URL lists, or the principal carries no organization. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description The standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    createUrlList: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CoverageUrlListCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CoverageUrlList"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use URL lists, or the principal carries no organization. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Name already used by a live list, or the organization is at its list cap. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description The standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description URL lists are not enabled (rollout flag). */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    getUrlList: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                urlListId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CoverageUrlList"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use URL lists, or the principal carries no organization. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description List does not exist or is not visible to the caller's organization (deliberately indistinguishable). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description The standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    deleteUrlList: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                urlListId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CoverageUrlList"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use URL lists, or the principal carries no organization. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description List does not exist or is not visible to the caller's organization (deliberately indistinguishable). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description The standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    listUrlListUrls: {
        parameters: {
            query?: {
                /** @description Opaque page cursor. */
                cursor?: string | null;
                limit?: number;
            };
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                urlListId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CoverageUrlListUrlsResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use URL lists, or the principal carries no organization. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description List does not exist or is not visible to the caller's organization (deliberately indistinguishable). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Malformed pagination cursor. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    addUrlListUrls: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                urlListId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CoverageUrlsRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CoverageUrlMutationResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use URL lists, or the principal carries no organization. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description List does not exist or is not visible to the caller's organization (deliberately indistinguishable). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The list is being deleted, awaits the normalization-ruleset sweep (retryable within minutes), or — on add — the batch would cross the per-list URL cap (batch-atomic). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Request body over the byte-level size cap. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description The standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    checkUrlListUrls: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                urlListId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CoverageUrlsRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CoverageContainsResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use URL lists, or the principal carries no organization. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description List does not exist or is not visible to the caller's organization (deliberately indistinguishable). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The list is being deleted, awaits the normalization-ruleset sweep (retryable within minutes), or — on add — the batch would cross the per-list URL cap (batch-atomic). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Request body over the byte-level size cap. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description The standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    removeUrlListUrls: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                urlListId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CoverageUrlsRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CoverageUrlMutationResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use URL lists, or the principal carries no organization. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description List does not exist or is not visible to the caller's organization (deliberately indistinguishable). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The list is being deleted, awaits the normalization-ruleset sweep (retryable within minutes), or — on add — the batch would cross the per-list URL cap (batch-atomic). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Request body over the byte-level size cap. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description The standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The caller's own identity, quotas, and rate-limit posture. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing, invalid, or revoked Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use `/v1`, or the organization is no longer active. `/me` is not an exception to the org-type gate; the `detail` is the reason. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. `/me` is cheap but not free: an agent polling it in a loop is throttled like any other `/v1` route. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    countProductFacets: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProgrammaticFacetCountsRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProgrammaticFacetCountsResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but not allowed to access this resource. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Request validation failed. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    lookupProduct: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProgrammaticProductLookupRequest"];
            };
        };
        responses: {
            /** @description The structured lookup envelope by default, or the product rendered as Markdown when format is md or markdown. */
            200: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProgrammaticProductLookupResponse"];
                    "text/markdown": string;
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Insufficient prepaid credit for this meter. The detail object includes code=insufficient_credit, top_up_url, next_renewal_at, balance (microdollars, observed_at, freshness, revision), balance_age_seconds, pending_usage_count and reconciliation_pending. No local credit reservation or deduction occurs. */
            402: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description API key is valid but not allowed to access this resource. */
            403: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Requested catalog or product was not found for this API key. */
            404: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Request validation failed. */
            422: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Product Lookup service-wide rate limit exceeded. */
            429: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The target failed before product extraction completed. */
            502: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Indexed lookup timed out waiting for a catalog DB connection or was killed at the server-side statement timeout (retry after the advertised delay), or on-demand product resolution is unavailable. Prepaid requests also return detail.code=billing_temporarily_suspended during an explicit operator billing incident. */
            503: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description On-demand product resolution exceeded its deadline. */
            504: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    moreLikeThisProducts: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProgrammaticMoreLikeThisRequest"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProgrammaticMoreLikeThisResponse"];
                };
            };
            /** @description The pagination cursor is structurally invalid, was minted under a different cursor version, or records a relaxation round that no longer maps onto the current query. Restart from page 1 (omit the cursor). */
            400: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but not allowed to access this resource. */
            403: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Requested catalog or product was not found for this API key. */
            404: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Request validation failed. */
            422: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    parseProductAlias: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProgrammaticProductLookupRequest"];
            };
        };
        responses: {
            /** @description The structured lookup envelope by default, or the product rendered as Markdown when format is md or markdown. */
            200: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProgrammaticProductLookupResponse"];
                    "text/markdown": string;
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Insufficient prepaid credit for this meter. The detail object includes code=insufficient_credit, top_up_url, next_renewal_at, balance (microdollars, observed_at, freshness, revision), balance_age_seconds, pending_usage_count and reconciliation_pending. No local credit reservation or deduction occurs. */
            402: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description API key is valid but not allowed to access this resource. */
            403: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Requested catalog or product was not found for this API key. */
            404: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Request validation failed. */
            422: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Product Lookup service-wide rate limit exceeded. */
            429: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The target failed before product extraction completed. */
            502: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Indexed lookup timed out waiting for a catalog DB connection or was killed at the server-side statement timeout (retry after the advertised delay), or on-demand product resolution is unavailable. Prepaid requests also return detail.code=billing_temporarily_suspended during an explicit operator billing incident. */
            503: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description On-demand product resolution exceeded its deadline. */
            504: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    resolveProductFromHtml: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProgrammaticResolveFromHtmlRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MerchantProductUrlLookupResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but not allowed to access this resource. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description The submitted HTML contains no credible product metadata, or no canonical product URL could be established (page declares none and no url was supplied). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Request body exceeds the size cap. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Request validation failed. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Product resolution service-wide rate limit exceeded. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Product resolution failed before completing. */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Product resolution is unavailable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Product resolution exceeded its deadline. */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    searchProducts: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProgrammaticProductSearchRequest"];
            };
        };
        responses: {
            /** @description Successful response */
            200: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProgrammaticProductSearchPage"];
                };
            };
            /** @description The pagination cursor is structurally invalid, was minted under a different cursor version, records a relaxation round that no longer maps onto the current query, or does not carry the understanding of this request's `q` that page 1 ran. Restart from page 1 (omit the cursor). */
            400: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Insufficient prepaid credit for this meter. The detail object includes code=insufficient_credit, top_up_url, next_renewal_at, balance (microdollars, observed_at, freshness, revision), balance_age_seconds, pending_usage_count and reconciliation_pending. No local credit reservation or deduction occurs. */
            402: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description API key is valid but not allowed to access this resource. */
            403: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Requested catalog or product was not found for this API key. */
            404: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Request validation failed. */
            422: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Prepaid API access explicitly suspended by an operator (detail.code=billing_temporarily_suspended), or billing startup incomplete. Management/payment access remains available. */
            503: {
                headers: {
                    /** @description Server-generated UUID for this execution, matching X-Request-ID. A new invocation or page gets a fresh ID even when the caller reuses X-Request-ID. */
                    "X-Request-ID"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getStore: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                domain: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoreCoverageResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    searchStores: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StoreSearchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoreSearchResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Organization cannot use the programmatic API. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Store search is unconfigured or its backend is unavailable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "detail": "store_search_unavailable"
                     *     }
                     */
                    "application/json": unknown;
                };
            };
        };
    };
    searchSimilarStores: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SimilarStoresRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoreSearchResponse"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Organization cannot use the programmatic API. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A store is not covered (`domain_not_covered`) or has no published profile to compare (`store_not_profiled`). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "detail": "store_not_profiled"
                     *     }
                     */
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Store search is unconfigured or its backend is unavailable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "detail": "store_search_unavailable"
                     *     }
                     */
                    "application/json": unknown;
                };
            };
        };
    };
    listTaxonomyAttributes: {
        parameters: {
            query: {
                /** @description A category UUID, a section handle such as `apparel`, or a category path such as `Apparel & Accessories > Clothing` (any letter case). */
                category: string;
                limit?: number;
                offset?: number;
            };
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaxonomyAttributePage"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use `/v1`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Unknown category. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    listTaxonomyAttributeValues: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path: {
                /** @description Attribute handle from `GET /taxonomy/attributes`. */
                handle: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaxonomyAttributeValuePage"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use `/v1`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Unknown attribute handle. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    listTaxonomyCategories: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description A category UUID, a section handle such as `apparel`, or a category path such as `Apparel & Accessories > Clothing` (any letter case). */
                parent?: string | null;
            };
            header?: {
                /** @description Optional caller-reported context as compact, ASCII-safe JSON. At most 4096 encoded bytes; strings at most 256 characters except user_agent (1024). Repeated headers, unknown fields, invalid types or vocabularies, and size violations return a bounded 400. Does not establish authenticated identity or trusted bot status. */
                "X-Octogen-Request-Context"?: components["parameters"]["RequestContext"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaxonomyCategoryPage"];
                };
            };
            /** @description Invalid X-Octogen-Request-Context header */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid Bearer API key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description API key is valid but its organization may not use `/v1`. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Unknown parent category. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Standard per-org request-rate limit. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
}
