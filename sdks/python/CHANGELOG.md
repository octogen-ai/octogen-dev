# Changelog — `octogen-ai-sdk`

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
