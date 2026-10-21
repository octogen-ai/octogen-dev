# `@storerouter/cli`

The StoreRouter CLI. Product lookup and search from a terminal —
or from an agent, which is the caller this is actually designed for.

> **Pre-release.** Targets the `@next` dist-tag only. Set
> `STOREROUTER_API_KEY` or use `--api-key-file <path>` with your StoreRouter API key.
> See [MIGRATION.md](MIGRATION.md) for package migration and release steps.
> `init` and MCP registration are not implemented.

```bash
npm exec --yes --package=@storerouter/cli@next -- storerouter search "linen dress" --limit 3
```

The primary executable is `storerouter`; `octogen` runs the same implementation.
`parse` is an exact alias of `lookup`: it calls `/products/lookup` and keeps
`command: "lookup"` in JSON, including failures. No output schema or exit codes change.

The default API is `https://api.storerouter.ai/v1`. Override precedence is
`--base-url`, `STOREROUTER_BASE_URL`, `OCTOGEN_BASE_URL`, then the default.
Base URL environment variables are read from the process, not `.env`.

The coverage cache uses `STOREROUTER_CACHE_DIR`, then `OCTOGEN_CACHE_DIR`,
then `${XDG_CACHE_HOME:-$HOME/.cache}/octogen`. The historical default directory
is retained; there is no credential store to migrate. Cache entries remain
scoped by API base URL and key identifier, so the new default gets a fresh
snapshot. `status` never writes the cache.

## Design in one page

**Output.** Human-readable when stdout is a TTY; **JSON when it is not**, so an
agent gets parseable output without knowing to ask. `--json` / `--no-json`
force. JSON is one object on one line with `schemaVersion` first; diagnostics go
to stderr and nothing else is ever written to stdout. `--quiet` silences stderr,
`--verbose` adds timing and allow-listed headers, and neither changes stdout.

**Exit codes.** One table for every command, frozen within a major version, so
branching never requires parsing a message.

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | Success                                                                 |
| `1`  | Unexpected failure — network, a `5xx` after retries, an unhandled throw |
| `2`  | Usage error                                                             |
| `3`  | No usable credential — none found, malformed, invalid, or revoked       |
| `4`  | Not entitled — `403`; the organization is not a Developer organization  |
| `5`  | Throttled or out of quota — any `429`, including the keyless cap        |
| `6`  | **No result: the server answered and the answer was empty**             |
| `7`  | Partial success                                                         |

`6` is narrow on purpose. It means a lookup missed or a search matched
nothing. It is **never**
a throttle and never an error we could not classify — because the expensive
mistake this product can cause is an agent reading "you are out of quota" as
"StoreRouter does not cover this merchant" and abandoning a covered domain forever.
Nothing errors when that happens, so the exit code is the only thing that can
prevent it.

**Credentials.** Resolved in this order, and reported as `auth.source`:

1. `--api-key-stdin` (one line from stdin)
2. `--api-key-file <path>`
3. `STOREROUTER_API_KEY`
4. `OCTOGEN_PLATFORM_API_KEY` — compatibility name, still accepted
5. `OCTO_API_KEY` — deprecated, accepted with a notice
6. `.env` in the current directory, then ancestors up to the `.git` boundary;
   within each file use the same three names in that order
7. nothing → no credential; authenticated service requests require a key

**There is no `--api-key` flag.** argv is visible to every process on the box,
lands in shell history, and gets echoed verbatim into agent transcripts.

Key material is never printed. A leaked full key degrades to its safe two-segment
identifier (`octo_live_<key_id>`) rather than to `[redacted]`, so bug reports
stay useful; `Authorization` values are removed outright, including inside
unexpected stack traces.

## Commands

### `storerouter status`

Org, key, quotas, rate-limit window, and both versions. This is what an agent
parses to decide whether onboarding worked.

```bash
storerouter status --json
```

`ok` is the single boolean to branch on, and it is `true` only when a key
resolved, the API answered, and the organization is entitled. `status` mutates
nothing — no key minting, no file writes, no cache warming — so it is safe in a
loop. `--offline` reports local state with no network calls.

The probe is `GET /v1/me`, which requires a key and returns calling identity
and rate limits.

### `storerouter skill [<reference>]`

```bash
storerouter skill --no-json
storerouter skill references/commands.md --no-json
```

The agent skill bundled with this CLI version: when to use StoreRouter, which
command fits a task, what each exit code means, and how to present results. Its
source is [`skills/storerouter/SKILL.md`](../skills/storerouter/SKILL.md);
codegen bundles it, with this reference as `references/commands.md`, so the
guidance always matches the installed commands and flags. Piped output keeps
the JSON envelope, with the text in `markdown`. No network and no credential.

### `storerouter lookup <url>` (alias: `parse`)

```bash
storerouter lookup https://lagence.com/products/akiya-satin-maxi-dress-merlot-red
storerouter lookup https://www.etro.com/us-en/cashmere-overshirt-MRBA008599TU2K3F0257.html
```

`--match-mode strict|loose`, `--resolution-mode auto|index_only|on_demand_only`,
`--on-demand-cache-policy prefer_cache|refresh`.

Exit `6` means the server looked and found nothing _for this URL_ — which is not
proof that every product from the merchant is unavailable.

### `storerouter search <query>`

```bash
storerouter search 'paisley jackets' --limit 3
storerouter search dress --facet color=red,blue --price-max 300 --catalog macys
```

`--catalog` (sent as a one-key `catalogs` allowlist), `--facet k=v`
(repeatable; comma-separate values), `--price-min`, `--price-max`, `--limit`,
`--cursor`. Exit `6` when nothing matched.

### `storerouter similar <url|uuid>`

```bash
storerouter similar https://lagence.com/products/akiya-satin-maxi-dress-merlot-red
```

### `storerouter stores show <domain|url>`

```bash
storerouter stores show thereformation.com
storerouter stores show https://www.thereformation.com/products/some-dress --json
```

One store's coverage snapshot from `GET /v1/stores/{domain}`: every catalog
serving the host, with its product count, populated search fields and their
most common values, and a price histogram. A URL is reduced to its host the way
the API normalizes hosts (lowercased, port and leading `www.` dropped). `--json`
emits `host`, `covered`, `coverage` and `catalogs`, the full per-catalog
snapshots.

Exit `6` with `covered: false` means the server answered `404
domain_not_covered`: no catalog serves that host. It asks about one host at a
time; there is no list of covered hosts.

### `storerouter brands <search|similar|show|products|categories|prefix>`

```bash
storerouter brands search 'quiet luxury knitwear' --like 'Loro Piana' --limit 10
storerouter brands similar Reformation 'Free People' --limit 10
storerouter brands show reformation
storerouter brands products reformation --limit 24 --offset 24
storerouter brands categories reformation --min-level 2
storerouter brands prefix Re
```

Brand discovery over `/v1/brands`. `search` ranks brands against a
plain-language description, steered by `--like` brands; `similar` ranks them
against one or more source brands; `prefix` completes a canonical name. `show`
and `categories` describe one brand, and `products` pages its active products
within the catalogs your key can access (continue with `--offset
<nextOffset>`). A `<brand>` is a slug or a case-insensitive name. Brand facets
use the brand index's names, such as `--facet facet_price_tier=premium`.

Exit `6` with `code: brand_not_found` means the server could not resolve the
brand; `no_matches` means it resolved and the answer was empty. There is no
command that lists every brand.

### `storerouter resolve --html <file|->`

```bash
storerouter resolve --html page.html --url https://example.com/p/1
curl -s https://example.com/p/1 | storerouter resolve --html - --url https://example.com/p/1
```

HTML comes from a file or stdin and **never from an argument**: the body cap is
5 MiB, argv is the wrong channel for a payload that size, and a multi-megabyte
argv entry in an agent transcript is its own problem.

### `storerouter api <METHOD> <path>` — the escape hatch

```bash
storerouter api GET /coverage/url-lists --query limit=5
storerouter api POST /products/search --data '{"q":"dress","limit":1}'
```

**Unstable by construction: you own the request body.** No request or response
types, no defaults, and no promise the route exists. You still get key
resolution, retry, rate-limit surfacing, the exit-code taxonomy, and redaction.

This is how the eight `coverage/url-lists` operations stay reachable. Their
first-class CLI is `octogen-url-lists` in the Python SDK, whose mutations are
dry-run-by-default behind `--apply`; a second, differently-shaped CLI for the
same mutating surface would be worse than none.

## Service credentials

Use a StoreRouter API key for service requests. The CLI can represent anonymous
quota responses, but that does not guarantee anonymous service access. A missing
or rejected credential exits `3`; throttling exits `5`, never `6`.

## How this stays honest

The public `/v1` snapshot generates SDK types and CLI runtime request schemas.
The [complete command reference](REFERENCE.md) is generated from the same command
registry and contract-backed help displayed by `storerouter <command> --help`.

- **All `/v1` traffic goes through `@octogen-ai/sdk`**, pinned to an exact version.
- **Every public operation and request field is accounted for.** Add a binding
  or a substantive exclusion reason; additions, removals and stale exclusions
  fail generation, typecheck or conformance checks.
- **Types, enums, bounds, defaults and descriptions come from the contract.**
  `src/fields.ts` only declares flag/positional spelling, repeatability, codecs,
  exclusions and SDK parameter name differences. Defaults on exposed fields
  are passed explicitly so SDK defaults cannot override the selected contract.
- **Custom handlers retain human semantics:** normalized domain checks, safe
  HTML file/stdin input, facet merging, cross-field conflict checks, polling,
  output envelopes and error/exit classification.
- **Build and release drift gates** validate generated artifacts and the linked
  reference. CI compares the complete CDN schema, including changes under an
  unchanged API version. See [the contract and release guide](CONTRACT.md).
- **Exit-code invariants are tested**, including that nothing classified ever
  produces `6` and that `ExitCode.NoResult` is named nowhere it should not be.

## Requirements

Node ≥ 20. One dependency (`@octogen-ai/sdk`), no native modules, and no
`postinstall` script — `npx -y` fetches and executes in one shot, so an install
hook or a native build step would turn the one-liner into a support load.

## License

Apache-2.0
