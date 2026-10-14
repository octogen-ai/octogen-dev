# Changelog — `@octogen-ai/cli`

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
