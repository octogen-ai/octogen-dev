# Changelog — `@octogen-ai/sdk`

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
