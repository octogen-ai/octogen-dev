# Changelog — `@octogen-ai/sdk`

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
