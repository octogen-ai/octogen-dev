# Changelog

## 0.2.0 (unreleased)

- Requires `octogen-ai-sdk>=0.18.0`.
- `list_catalogs()` lists the catalogs your key may search, and
  `iter_catalog_pages()` follows `next_cursor` through every page (a plain
  iterator on `StoreRouter`, an async iterator on `AsyncStoreRouter`)
  (OCT-4848).
- `count_product_facets()` takes `context_facets` and `derive_attributes`
  (OCT-4849).

## 0.1.0 — 2026-11-06

First release of `storerouter`, the StoreRouter Python SDK.

- `StoreRouter` (blocking) and `AsyncStoreRouter` clients with every
  `octogen-ai-sdk` method: product lookup, search, facet counts,
  more-like-this, retrieve, stores, brands, taxonomy and coverage URL lists.
- `lookup_products()` looks up many URLs concurrently and returns one
  `LookupResult` per URL, so one failed URL does not stop the batch.
- Retries 429/5xx responses and failed connections, honoring `Retry-After`
  (`max_retries`, default 2).
- Reads `STOREROUTER_API_KEY` (falling back to `OCTOGEN_PLATFORM_API_KEY`) and
  `STOREROUTER_BASE_URL`; defaults to `https://api.storerouter.ai/v1`.
- Friendly aliases for the product models (`Product`, `ProductListItem`,
  `ProductLookupResponse`, `ProductSearchPage`) and errors (`NotFoundError`,
  `RateLimitError`, ...).
