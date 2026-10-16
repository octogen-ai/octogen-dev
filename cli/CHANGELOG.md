# Changelog — `@storerouter/cli`

## 0.4.0 (unreleased, `next`)

- Generate request validation and help from the public contract; include the
  contract runtime in the package.
- Preserve numeric, string, array, and nested-path validation errors through
  nullable schemas. Genuine unions report all type-compatible alternatives.
- **Breaking:** remove customer Voyage commands; Voyage is admin-only.
- Pin SDK 0.6.0. Publish that SDK before releasing this CLI.

## 0.3.0 — 2026-10-16 (`next`)

- Move the primary package to `@storerouter/cli`, with `storerouter` and `octogen` executables.
- Default to the StoreRouter API, accept StoreRouter env names with legacy fallback, and preserve the cache directory.
- Add `parse` as an exact alias of `lookup`; preserve JSON and exit-code contracts.
- Document old-package migration, global bin collisions, and the first-release owner steps.

## 0.2.0 — 2026-10-14

Moves onto `@octogen-ai/sdk` 0.4.0 so the CLI stops sending the retired
single-valued `catalog` field. 0.1.0 sends it on `search` (which the platform is
about to refuse) and on `similar` (which it already refuses with a `422`), so
upgrade.

### Changed

- `octogen search --catalog <key>` is sent as a one-entry `catalogs` allowlist.
- `octogen similar --catalog <key>` is repeatable and every key is sent as
  `catalogs`. 0.1.0 sent only the first key and warned with
  `single_catalog_only`; that warning is gone.
- Pins `@octogen-ai/sdk` 0.4.0 (was 0.3.0).

### Removed

- `octogen refresh`. The product refresh endpoint it called has been retired.

## 0.1.0

First release. No changelog was kept; see the `cli-v0.1.0` tag.
