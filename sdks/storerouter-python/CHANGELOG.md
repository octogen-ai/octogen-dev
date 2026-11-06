# Changelog

## 0.1.0

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
