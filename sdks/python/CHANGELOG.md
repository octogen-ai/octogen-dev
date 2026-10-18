# Changelog — `octogen-ai-sdk`

## 0.6.0 (unreleased)

- **Breaking:** remove customer Voyage methods and types. Voyage is admin-only;
  customer applications must stop calling these retired endpoints.
- Regenerate the public contract mirror without Voyage operations and schemas.
- `search_products` takes `diversity` again, now that the API applies it:
  `diversity=True` spreads page 1 across retailers and drops repeated images.
  `ProgrammaticProductSearchRequest` declares the field. Omitted by default.
- `search_products` takes `fallback_category`, a category path root first
  (1-4 names as the `category_path.depth_N` facets accept them), searched when
  understanding finds no category in `q`. It requires an understood `q`; the
  request model raises `ValidationError` otherwise, or for an empty, blank or
  over-long path. Applied levels appear in `effective_query` as `generated`.
- `ProgrammaticProductSearchPage.effective_query` is present on every
  response, not only with `debug=True`. It stays optional so a page from an
  older server still parses. `debug` is now reserved for diagnostic detail.
- `MerchantProductListItem` declares the search and more-like-this card
  fields: `currency`, `in_stock`, `colors`, `sizes`, `gender`, `category_path`
  and `catalog_display_name` (wire names `inStock`, `categoryPath`,
  `catalogDisplayName`). Each is `None` when absent; `gender` is a plain `str`
  so a new value never fails parsing.
- Search cursors now carry page 1's query understanding, so they are longer
  (about 1-3 KB). They stay opaque; pass `next_cursor` back unchanged with the
  same `q`.
- Regenerate the contract mirror for these changes.
- Every operation with a request body also takes `request=`, a prebuilt request
  model (`ProgrammaticProductSearchRequest`, `ProgrammaticProductLookupRequest`,
  `ProgrammaticMoreLikeThisRequest`, `ProgrammaticResolveFromHtmlRequest`,
  `CoverageUrlListCreateRequest`, `CoverageUrlsRequest`), sent as
  `model_dump(mode="json", by_alias=True, exclude_none=True)`. A subclass's
  extra fields are sent, so a caller can send a field the API accepts before
  the SDK declares it. `request=` with any keyword argument is a `TypeError`.
  To allow this, keywords that had a non-`None` default (`limit`,
  `resolution_mode`, `on_demand_cache_policy`, `price_preference`, `debug` on
  `more_like_this_products`) now default to `None`, meaning the same value as
  before; `lookup_product`'s `url` and the coverage methods' `name`, `html` and
  `urls` are optional when `request=` is passed.
- Every operation takes `timeout` (seconds or an `httpx.Timeout`) for that call
  only. It applies to an injected `http_client` too; omitted, the client's own
  timeout stands.
- Typed errors, all subclasses of the existing ones:
  `OctogenRateLimitError` (`429`), `OctogenInsufficientCreditError` (`402`),
  `OctogenServerError` (`5xx`), and `OctogenTimeoutError`
  (an `OctogenConnectionError`) for `httpx` timeouts. A `504` raises
  `OctogenGatewayTimeoutError`, both an `OctogenTimeoutError` and an
  `OctogenServerError`. A refused or reset connection stays a plain
  `OctogenConnectionError`. The SDK still never retries.
- Every `OctogenAPIError` carries `request_id` (from `x-request-id`) and
  `retry_after` (whole seconds from `Retry-After`, delta-seconds or HTTP-date;
  `None` when absent), so callers need not read `.response`.

## 0.5.0 — 2026-10-14

`search_products` now exposes the redesigned `/v1` search contract: one control
per intent. **Breaking:** the keywords the API stopped accepting are gone from
the SDK, because every request carrying them now fails with a `422`.

### Added

- `search_products` takes `understand`, `exclude_facets`,
  `omit_generated_facets`, `brand_quality_min`, `brand_quality_max`,
  `similar_to_brands`, `relax`, and `debug`, sent under those wire names.
- `search_products` returns `ProgrammaticProductSearchPage`, a
  `MerchantProductListPage` subclass that adds `request_id` and, with
  `debug=True`, a typed `effective_query`
  (`ProgrammaticProductSearchEffectiveQuery`) — the text, facets (each with
  `source` `"caller"` or `"generated"`), bounds, catalogs, and `relaxation`
  (`rounds`, `dropped_facets`, `declined_rounds`) that actually ran. The
  effective-query models are re-exported from the generated contract mirror.
- `ProgrammaticProductSearchRequest` rejects the contradictions the API
  refuses, raising `pydantic.ValidationError` before any request:
  `understand=False`, `relax=True`, or a non-empty `omit_generated_facets`
  without a `q` (and the latter two with `understand=False`); a facet name
  repeated within `facets` or `exclude_facets`; a name in both `facets` and
  `omit_generated_facets`; more than 50 entries in any of the three; a
  negative price or `price_min > price_max`; brand quality outside 1–6 or
  min > max; and `similar_to_brands` that is empty, longer than 10, or has a
  blank name. The server remains the source of truth for everything else.

### Removed

- `search_products(catalog=...)`, deprecated in 0.4.0. Use `catalogs=[key]`.
- `search_products(text_search_query=...)`, deprecated in 0.4.0, and the
  `TextSearchQuery` model. Send `q` with `understand=False` to match the text
  as written, with your filters in `facets` and `exclude_facets` (formerly
  `exclusion_facets`), and the bounds and brands as top-level `price_min`,
  `price_max`, `brand_quality_min`, `brand_quality_max`, and
  `similar_to_brands`.
- `ProgrammaticProductSearchRequest` drops `catalog` and `text_search_query`;
  it forbids extra fields, so passing either is a `ValidationError`.

Passing a removed keyword to `search_products` is a `TypeError`.

### Migrating from 0.4.0

```python
# 0.4.0
await client.search_products(catalog="macys", q="linen dress")
await client.search_products(
    text_search_query={
        "text": "linen dress",
        "facets": [{"name": "color_family", "values": ["blue"]}],
        "exclusion_facets": [{"name": "brand_name", "values": ["acme"]}],
        "price_max": 200,
    }
)

# 0.5.0
await client.search_products(catalogs=["macys"], q="linen dress")
await client.search_products(
    q="linen dress",
    understand=False,
    facets=[{"name": "color_family", "values": ["blue"]}],
    exclude_facets=[{"name": "brand_name", "values": ["acme"]}],
    price_max=200,
)
```

`text_search_query`'s retrieval tuning (`search_id`, `ranking_text`, embedding
columns, similarity weights, `search_after`, `browse_menu_uuid`,
`compact_mode`) has no replacement on `/v1` search.

## 0.4.0 — 2026-10-14

The `/v1` search API is moving to one control per intent. Narrowing to catalogs
is the `catalogs` allowlist, and the single-valued `catalog` is being retired.
Upgrade before the platform stops accepting `catalog` on search.

### Added

- `search_products(catalogs=[...])`: restrict results to a list of 1–500
  catalog keys, sent verbatim. An empty list, or a blank key, raises
  `ValueError` rather than sending a request, and a bare string raises
  `TypeError`: omit `catalogs` to search every catalog.

### Changed

- `more_like_this_products` takes `catalogs` (1–100 keys) in place of
  `catalog`. The endpoint already refused `catalog` with a `422`, so this is a
  fix rather than a break.
- `ProgrammaticProductSearchRequest` gains `catalogs`;
  `ProgrammaticMoreLikeThisRequest` replaces `catalog` with `catalogs`.

### Deprecated

- `search_products(catalog=...)` — use `catalogs=[key]`. Still sent as
  `catalog` (not rewritten), with a `DeprecationWarning`. Passing both
  `catalog` and `catalogs` raises `ValueError`.
- `search_products(text_search_query=...)` — use `q` with `facets`,
  `price_min`, and `price_max`. Still sent, with a `DeprecationWarning`.

Both deprecated parameters will be removed in a later release, after the
platform stops accepting them.

## 0.3.0 and earlier

No changelog was kept; see the `sdk-py-v*` tags and the git history.
