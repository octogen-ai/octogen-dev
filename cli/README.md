# `@storerouter/cli`

The StoreRouter CLI. Coverage, product lookup, search, and voyages from a terminal —
or from an agent, which is the caller this is actually designed for.

> **Pre-release.** Targets the `@next` dist-tag only. Set
> `STOREROUTER_API_KEY`, use `--api-key-file <path>`, or use the keyless trial below.
> See [MIGRATION.md](MIGRATION.md) for package migration and release steps.
> `init`, skills, and MCP registration are not implemented.

```bash
npx -y @storerouter/cli@next domains --check https://www.macys.com/shop/product/x
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

`6` is narrow on purpose. It means a lookup missed, a host is absent from a
coverage list the server confirmed, or a search matched nothing. It is **never**
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
7. nothing → the keyless trial where the command supports it, else exit `3`

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

The probe is `GET /v1/me`, which requires a key. It is deliberately **not**
`GET /v1/domains`: that route now answers `200` with no credential at all, so a
`status` built on it would call a keyless install healthy.

### `storerouter domains [--check <url>]`

```bash
storerouter domains --check https://www.macys.com/shop/product/x   # exit 0, macys.com
storerouter domains --check https://www.not-a-merchant.example/p    # exit 6
```

The list comes back **normalized** — lowercased, leading `www.` stripped — so the
server reports `macys.com` and never `www.macys.com`. Real product URLs
overwhelmingly do carry `www.`, so `--check` normalizes both sides before
comparing. A raw comparison reports a covered merchant as uncovered and nothing
errors, which is exactly the silent false negative this flag exists to prevent.

Exit `0` covered, `6` not covered, and never `6` for any other reason. Cached
with its `ETag` and revalidated with `If-None-Match` (`--no-cache` to skip).

### `storerouter lookup <url>` (alias: `parse`)

```bash
storerouter lookup https://lagence.com/products/akiya-satin-maxi-dress-merlot-red
storerouter lookup https://www.etro.com/us-en/cashmere-overshirt-MRBA008599TU2K3F0257.html
```

`--match-mode strict|loose`, `--resolution-mode auto|index_only|on_demand_only`,
`--on-demand-cache-policy prefer_cache|refresh`.

Exit `6` means the server looked and found nothing _for this URL_ — which is not
the same as the merchant being uncovered. Ask that with `domains --check`.

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

### `storerouter resolve --html <file|->`

```bash
storerouter resolve --html page.html --url https://example.com/p/1
curl -s https://example.com/p/1 | storerouter resolve --html - --url https://example.com/p/1
```

HTML comes from a file or stdin and **never from an argument**: the body cap is
5 MiB, argv is the wrong channel for a payload that size, and a multi-megabyte
argv entry in an agent transcript is its own problem.

### `storerouter voyage <url>`, `voyage status <task_id>`, `voyage list`

```bash
storerouter voyage https://newmerchant.example --wait --wait-timeout 1800
storerouter voyage status task_01H...
storerouter voyage list --status running
```

Voyages are shared per domain: starting one that is already running joins it and
consumes no quota, and `created` says which happened. With `--wait`: exit `0`
completed, `7` still running at the deadline (the voyage is unaffected — resume
with `voyage status`), `1` failed or cancelled.

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

## The keyless trial

With no key, `domains`, `lookup`, and `search` answer anyway — 30 requests per IP
per day, complete untruncated payloads. Everything else exits `3` and says so.

Exhaustion is exit **`5`**, never `6`, and the body carries
`"coverage": "unknown"`. Shared egress makes this common rather than exotic: CI
runners, corporate NAT, and cloud sandboxes collide on one address, so the first
keyless request an agent makes may already be over the cap. It says nothing about
whether StoreRouter covers the merchant.

## How this stays honest

The CLI is not generated from the OpenAPI document — the spec cannot express
which command an operation belongs to, that `resolve` must read from a file, or
that `domains --check` has to normalize hosts. What is enforced instead:

- **All `/v1` traffic goes through `@octogen-ai/sdk`**, pinned to an exact
  version. No second HTTP client. The CLI is the SDK's most demanding customer,
  which is how a route that does not exist gets found in an afternoon.
- **The command table is bound to the SDK's `OPERATIONS` registry.** Every
  published operation must be either mapped to a command or listed in
  `EXCLUDED_OPERATIONS` with a stated reason — checked at compile time and by
  `tests/operation-coverage.test.ts`.
- **Request flags are derived from the generated types.** `src/fields.ts` has one
  entry per property of every request body, so a newly published field is a
  compile error until someone gives it a flag or writes down why not.
- **Exit-code invariants are tested**, including that nothing classified ever
  produces `6` and that `ExitCode.NoResult` is named nowhere it should not be.

## Requirements

Node ≥ 20. One dependency (`@octogen-ai/sdk`), no native modules, and no
`postinstall` script — `npx -y` fetches and executes in one shot, so an install
hook or a native build step would turn the one-liner into a support load.

## License

Apache-2.0
