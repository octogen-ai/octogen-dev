# Changelog — `@storerouter/cli`

## 0.5.0 (unreleased, `next`)

- Add `storerouter brands` for the six `/v1/brands` operations: `brands search
<description>` (`--like`, `--facet`, `--limit`), `brands similar <brand>…`
  (`--facet`, `--exclude-facet`, `--limit`), `brands prefix <prefix>`, `brands
show <brand>`, `brands products <brand>` (`--limit`, `--offset`) and `brands
categories <brand>` (`--min-level`, `--limit`). `404 brand_not_found` and empty
  results exit `6`. `storerouter brands` alone lists the subcommands, and an
  unknown one names the valid ones. Requires `@octogen-ai/sdk` 0.9.0.

- Add `storerouter skill [<reference>]`: prints the agent skill bundled with
  this version (`skills/storerouter/SKILL.md`), covering when to use
  StoreRouter, which command fits a task, what each exit code means, and how to
  present results. `storerouter skill references/commands.md` prints the
  command reference. No network or credential; `--no-json` prints the Markdown
  itself. Root `--help` points agents to it.

- **Breaking:** remove `storerouter domains` and its local coverage cache. The
  API no longer serves `GET /v1/domains` (octogen#13525), so `domains` fails
  on 0.4.0 and older. Run `lookup` directly; a miss no longer points at
  `domains --check`. `status` still checks credentials with `GET /v1/me`.
- Keyless trial messages name only `lookup` and `search`.
- Add `storerouter store <host|url>`: one covered store's coverage snapshot
  from `GET /v1/domains/{host}` (catalogs, product counts, populated fields,
  price histogram), as a summary or `--json`. A URL is normalized to its host.
  `404 domain_not_covered` exits `6` with `covered: false`. It takes one host;
  there is no list mode and no host cache.
- `similar` does not expose more-like-this `sources`; send several source
  products with `storerouter api`.
- Pin SDK 0.7.0. Publish that SDK before releasing this CLI.
- `storerouter parse --help` and `parse`'s usage errors name `parse` instead
  of `lookup`. Requests, exit codes and the JSON `command` (`lookup`) are
  unchanged.

## 0.4.0 — 2026-10-19 (`next`)

- Generate request validation and help from the public contract; include the
  contract runtime in the package.
- Preserve numeric, string, array, and nested-path validation errors through
  nullable schemas. Genuine unions report all type-compatible alternatives.
- **Breaking:** remove customer Voyage commands; Voyage is admin-only.
- `similar --facet` sends `facets` instead of `include_facets`, which the API
  now refuses with a `422`. 0.3.0 and older break on `similar --facet` once
  that API change deploys, so upgrade first.
- `similar` sends `relax`, `true` by default as the contract says: a short
  first page is retried with the server's own generated facets dropped, never
  your `--facet` or price bounds. `--no-relax` turns it off.
- `similar` takes `--price-min` and `--price-max`, as `search` does.
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
