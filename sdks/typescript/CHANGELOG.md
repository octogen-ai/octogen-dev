# Changelog — `@octogen-ai/sdk`

## 0.9.0 (unreleased)

- Search `facets` take `SearchFacet`, a `Facet` with `relaxable`. A facet sent
  with `relaxable: true` may be dropped by `relax`; it still replaces an
  understood facet of the same name and is never dropped with `relax: false`.
  Only a name a relaxation stage covers may be marked (the server answers
  `422` otherwise). Plain facets still work and are sent unchanged.
- `relax` now requires `q`, and either an understood `q` or at least one
  `relaxable` facet, so `understand: false` with `relax: true` is valid when a
  facet is relaxable (octogen#14239). The client-side check mirrors that.
- `ProgrammaticProductSearchEffectiveFacet` declares `relaxable`, present as
  `true` on a caller facet marked relaxable, in `facets` and in
  `relaxation.droppedFacets`.
- `searchBrandsFromText` takes `understand` (octogen#14245): `false` matches
  `text` as written with no query understanding and no generated facets,
  filtering only by the facets you send; reference brands still apply. Sent
  only when set; the server defaults it to `true`.
- Add `searchSimilarStores({ stores, limit })` for `POST /v1/stores/similar`,
  returning `StoreSearchResponse`.
- `searchProducts` accepts `stores` (1-20 domains), searching every catalog
  serving each; send it or `catalogs`, not both.
- Add `searchStores({ text, limit })` for `POST /v1/stores/search`, returning
  `StoreSearchResponse` (`StoreSearchResult` per store).
- **Breaking:** `getDomain` is now `getStore` (`GET /v1/stores/{domain}`),
  returning `StoreCoverageResponse`; `DomainCoverageResponse` and
  `DomainCatalogCoverage` are now `StoreCoverageResponse` and
  `StoreCatalogCoverage`. The API publishes only the stores route.
- **Breaking:** `getBrandDetails` returns `BrandCoverageResponse` (was
  `BrandDetailsView`): brand metadata plus a snapshot of the brand's products
  across catalogs (`productCount`, `computedAt`, `fields`, `price`) and
  `catalogs`, each a `BrandCatalog` with `hosts` for `getStore`.
- Add the six published `/v1/brands` operations: `searchBrandPrefix`,
  `searchBrandsFromText`, `searchSimilarBrands`, `getBrandDetails`,
  `browseBrandProducts` and `getBrandTopCategories`, with their request and
  response types. Blank brands, prefixes and descriptions throw a `TypeError`
  before any request; an unknown brand is an `OctogenNotFoundError` with
  `detail` `brand_not_found`.
- Refresh the OpenAPI snapshot and generated mirrors for the brand routes.

## 0.8.0

- Add typed per-call `RequestContext` on every API operation, with stable
  application defaults, explicit override/clear semantics and isolated request
  headers. IDs, original user agent and visitor metadata are per call only.
- Validate the API's strict fields, vocabularies, Unicode character limits and
  4,096-byte ASCII-safe compact JSON budget without exposing input in errors.
- Refresh the deployed OpenAPI snapshot and generated mirrors for the context
  header. Resolve shared header parameters in codegen without adding CLI inputs.
- Preserve routes, bodies, transport/authentication, timeouts and retry policy.
  Shared synthetic contract fixtures and concurrent transport tests cover parity.
- Publication is a separate OCT-4518 step after merge; this change does not
  publish a package or activate context collection.

## 0.7.0 (unreleased)

**Breaking:** the covered-domain list is gone. The API no longer serves
`GET /v1/domains` (octogen#13525), so `listDomains` and `fetchDomainCoverage`
fail against it on every version that has them.

- Remove `listDomains`, `fetchDomainCoverage`, `DomainCoverage`,
  `DomainEntry`, `ListDomainsOptions`, `ListDomainsResponse` and
  `ListDomainsResult`. Call `lookupProduct` directly instead of checking the
  host first, and use `getMe` to check credentials. A lookup miss does not mean
  the merchant is uncovered.
- `isHostCovered` and `normalizeHost` stay, for host sets you supply yourself.
- Regenerate the public contract mirror without the `listDomains` operation and
  its schemas.
- Add `getDomain(urlOrHost)` for `GET /v1/domains/{host}`: one covered store's
  coverage snapshot (catalogs, product counts, populated facets, price
  histogram). It normalizes a URL to its host first, and an uncovered host is
  `OctogenNotFoundError` with `detail` `domain_not_covered`. It asks about one
  host; nothing lists hosts. Adds the `DomainCoverageResponse`,
  `DomainCatalogCoverage`, `DomainField`, `DomainFieldValue`,
  `PriceDistribution` and `PriceBucket` types.

More-like-this takes several source products at once.

- `moreLikeThisProducts` takes `sources`, 1–20 distinct indexed product UUIDs
  treated as one set, for example a collection. Pass exactly one of `source`
  and `sources`; `source` is now optional in `MoreLikeThisProductsParams` and
  `ProgrammaticMoreLikeThisRequest`. Results exclude every source; a facet is
  generated only when every source has it; and `pricePreference` compares
  with the sources' median price. Both or neither, an empty or over-long list,
  an empty UUID or a UUID sent twice throws `TypeError` before any request.
- `MoreLikeThisProductsResponse.sources` carries the resolved sources in
  request order when the request sent `sources`. `source` is then absent, so
  it is now optional.
- Regenerate the public contract mirror for `sources`.
- `moreLikeThisProducts` takes `omitGeneratedFacets` (generated facets to drop
  by name; unknown names are ignored and no `q` is needed) and
  `retrievalEmbeddingColumns` / `rankingEmbeddingColumns` (one or more
  `EmbeddingColumn`s; an empty list or an unknown column throws `TypeError`).
  `ProgrammaticMoreLikeThisRequest` declares their wire names.
- `MoreLikeThisProductsResponse` declares `requestId`, `resolution` and
  `sourceImage` (the new `MoreLikeThisSourceImageResponse`). The parity test
  now requires the more-like-this request and response to cover every
  contract field.

## 0.6.0 — 2026-10-19

More-like-this takes the same caller controls as search, and this release
catches the SDK up with the `/v1` additions the Python SDK already ships.
**Breaking:** `includeFacets` is gone. The API now refuses `include_facets`
with a `422` that names `facets`, so 0.5.0 breaks on any call that passes it.
Upgrade before that API change deploys.

- `moreLikeThisProducts` takes `facets` (sent as `facets`) in place of
  `includeFacets`. A facet you send replaces the generated facet of the same
  name and is never relaxed. Passing `includeFacets` from JavaScript throws
  `TypeError` instead of sending a request the API refuses.
- `moreLikeThisProducts` takes `relax`. It is omitted unless set, and the
  server defaults it to `true`: a short page 1 is retried with Platform's own
  generated facets dropped, never the facets or bounds you sent. For a `url`
  or `uuid` source, page 1 is short when it has fewer than `min(5, limit)`
  results and no `nextCursor`. An image source relaxes only an empty page.
  Search keeps its default of `false`. The rule is the same on both routes:
  what you send is never dropped, but the server may drop its own inferences.
- `moreLikeThisProducts` takes `priceMin`/`priceMax` and
  `brandQualityMin`/`brandQualityMax`, with search's semantics. A minimum
  above its maximum, an out-of-range bound, or a facet name sent twice in
  `facets` or `excludeFacets` throws `TypeError` before any request.
- `MoreLikeThisEffectiveQuery` (returned with `debug: true`) reports
  `relaxation` in search's shape
  (`rounds`, `declinedRounds`, `droppedFacets`) and the applied
  `brandQualityMin`/`brandQualityMax`.
- Add `listTaxonomyCategories`, `listTaxonomyAttributes` and
  `listTaxonomyAttributeValues` for `GET /v1/taxonomy/...`, and
  `countProductFacets` for `POST /v1/products/facet-counts`, which counts by
  `categories`, `attributes` and `facetNames` under search's filters. Local
  checks mirror the server's `422` rules.
- **Breaking:** remove customer Voyage methods and types. Voyage is admin-only;
  customer applications must stop calling these retired endpoints.
- Regenerate the public contract mirror without Voyage operations and schemas.
- `searchProducts` takes `diversity` again, now that the API applies it:
  `diversity: true` spreads page 1 across retailers and drops repeated images.
  It is no longer refused as a removed field. Omitted by default.
- `searchProducts` takes `fallbackCategory` (sent as `fallback_category`), a
  category path root first (1–4 names as the `category_path.depth_N` facets
  accept them), searched when understanding finds no category in `q`. It
  requires an understood `q` and throws `TypeError` otherwise, or for an
  empty, blank or over-long path. Applied levels appear in `effectiveQuery` as
  `generated`.
- `ProgrammaticProductSearchPage.effectiveQuery` is present on every response,
  not only with `debug: true`. It stays optional so a page from an older
  server still type-checks. `debug` is now reserved for diagnostic detail.
- `MerchantProductListItem` declares the search and more-like-this card
  fields: `currency`, `inStock`, `colors`, `sizes`, `gender`, `categoryPath`
  and `catalogDisplayName`, each null or absent when the product lacks them.
  `MerchantProductView` (lookup) omits the ones lookup does not report.
- Search cursors now carry page 1's query understanding, so they are longer
  (about 1–3 KB). They stay opaque; pass `nextCursor` back unchanged with the
  same `q`.
- Regenerate the contract mirror for these changes.

## 0.5.0 — 2026-10-14

`searchProducts` now exposes the redesigned `/v1` search contract: one control
per intent. **Breaking:** the fields the API stopped accepting are gone from the
SDK, because every request carrying them now fails with a `422`.

### Added

- `searchProducts` takes `understand`, `excludeFacets`, `omitGeneratedFacets`,
  `brandQualityMin`, `brandQualityMax`, `similarToBrands`, `relax`, and
  `debug`, sent as `understand`, `exclude_facets`, `omit_generated_facets`,
  `brand_quality_min`, `brand_quality_max`, `similar_to_brands`, `relax`, and
  `debug`.
- `searchProducts` returns `ProgrammaticProductSearchPage`: the existing
  `items` and `nextCursor`, plus `requestId` and, with `debug: true`, a typed
  `effectiveQuery` (`ProgrammaticProductSearchEffectiveQuery`) — the text,
  facets (each tagged `source: "caller"` or `"generated"`), bounds, catalogs,
  and `relaxation` (`rounds`, `droppedFacets`, `declinedRounds`) that actually
  ran. `ProgrammaticProductSearchPage` extends `MerchantProductListPage`, so
  code typed against the old return type still compiles.
- Contradictions the API refuses are a local `TypeError` before any request:
  `understand: false`, `relax`, or a non-empty `omitGeneratedFacets` without a
  `q` (and the latter two with `understand: false`); a facet name repeated
  within `facets` or `excludeFacets`; a name in both `facets` and
  `omitGeneratedFacets`; more than 50 entries in any of the three; a negative
  price or `priceMin > priceMax`; brand quality outside 1–6 or min > max; and
  `similarToBrands` that is empty, longer than 10, or has a blank name. The
  server remains the source of truth for everything else.

### Removed

- `searchProducts({ catalog })`, deprecated in 0.4.0. Use `catalogs: [key]`.
- `searchProducts({ textSearchQuery })`, deprecated in 0.4.0, and the
  `TextSearchQuery` and `TextSearchQueryPayload` types. Send `q` with
  `understand: false` to match the text as written, with your filters in
  `facets` and `excludeFacets` (formerly `exclusionFacets`), and the bounds and
  brands as top-level `priceMin`, `priceMax`, `brandQualityMin`,
  `brandQualityMax`, and `similarToBrands`.
- `ProgrammaticProductSearchRequest` drops `catalog` and `text_search_query` to
  match the contract.

Passing `catalog`, `textSearchQuery`, or `diversity` from JavaScript (or past
the types) is a `TypeError` naming the replacement, rather than a dropped field
and silently widened results.

### Migrating from 0.4.0

```ts
// 0.4.0
await client.searchProducts({ catalog: "macys", q: "linen dress" });
await client.searchProducts({
  textSearchQuery: {
    text: "linen dress",
    facets: [{ name: "color_family", values: ["blue"] }],
    exclusionFacets: [{ name: "brand_name", values: ["acme"] }],
    priceMax: 200,
  },
});

// 0.5.0
await client.searchProducts({ catalogs: ["macys"], q: "linen dress" });
await client.searchProducts({
  q: "linen dress",
  understand: false,
  facets: [{ name: "color_family", values: ["blue"] }],
  excludeFacets: [{ name: "brand_name", values: ["acme"] }],
  priceMax: 200,
});
```

`textSearchQuery`'s retrieval tuning (`searchId`, `rankingText`, embedding
columns, similarity weights, `searchAfter`, `browseMenuUuid`, `compactMode`)
has no replacement on `/v1` search.

## 0.4.0 — 2026-10-14

The `/v1` search API is moving to one control per intent. Narrowing to catalogs
is the `catalogs` allowlist, and the single-valued `catalog` is being retired.
Upgrade before the platform stops accepting `catalog` on search.

### Added

- `searchProducts({ catalogs })`: restrict results to a list of 1–500 catalog
  keys, sent verbatim. An empty list, or a blank key, is a `TypeError` rather
  than a request: omit `catalogs` to search every catalog.

### Changed

- `moreLikeThisProducts` takes `catalogs` (1–100 keys) in place of `catalog`.
  The endpoint already refused `catalog` with a `422`, so this is a fix rather
  than a break; passing `catalog` from JavaScript is now a local `TypeError`
  instead of a dropped field and silently widened results.

### Deprecated

- `searchProducts({ catalog })` — use `catalogs: [key]`. Still sent as `catalog`
  (not rewritten), with a one-time `console.warn`. Passing both `catalog` and
  `catalogs` is a `TypeError`.
- `searchProducts({ textSearchQuery })` — use `q` with `facets`, `priceMin`, and
  `priceMax`. Still sent, with a one-time `console.warn`.

Both deprecated fields will be removed in a later release, after the platform
stops accepting them.

## 0.3.0 and earlier

No changelog was kept; see the `sdk-ts-v*` tags and the git history.
