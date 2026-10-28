# Octogen Python SDK

Async Python SDK for the Octogen AI commerce API.

## Install For Development

From this directory:

```bash
uv sync
```

## Authentication

The client reads the API key from **`OCTOGEN_PLATFORM_API_KEY`** by default —
the same variable the Octogen agent-onboarding skill and CLI use — and sends it
as:

```text
Authorization: Bearer <api-key>
```

You can also pass `api_key` explicitly when constructing the client.

`OCTO_API_KEY` is still read as a **deprecated** fallback: it raises a
`DeprecationWarning` once and will be removed. Set
`OCTOGEN_PLATFORM_API_KEY`.

## Usage

```python
import asyncio

from octogen_ai_sdk import OctogenClient


async def main() -> None:
    async with OctogenClient(base_url="https://api.storerouter.ai/v1") as client:
        results = await client.search_products(q="paisley jackets", limit=3)
        for product in results.items:
            print(product.title, product.product_url)


asyncio.run(main())
```

### Product lookup

Look up a product URL directly. A missing product does not prove that its whole
merchant domain is unsupported. Use `get_me()` to check credentials.

## API

Every published `/v1` operation has a method. `tests/contract` fails the build
if that stops being true — see
[Contract conformance](../../tests/contract/README.md).

- `get_me()` returns the calling organization, key id and provenance, quotas,
  and rate-limit posture. Read-only and side-effect free: safe on startup and
  in CI.
- `get_store(url_or_host)` returns one store's coverage snapshot
  (`GET /v1/stores/{domain}`): every catalog serving the host, with product
  counts, populated facets and a price histogram. A URL is normalized to its
  host first. An uncovered host raises `OctogenNotFoundError` with
  `detail == "domain_not_covered"`. There is no list of covered hosts.
- `search_stores(text, limit=...)` ranks profiled stores against a
  plain-language description (`POST /v1/stores/search`). It searches the stores
  with published profiles, not every covered store, so results may underfill;
  there is no pagination. `search_similar_stores(stores, limit=...)` ranks the
  same stores by resemblance to one or more stores (`POST /v1/stores/similar`).

- `search_products(...)` searches every active catalog by default, or only the
  catalogs in `catalogs` (1–500 keys) when it is provided, or every catalog
  serving each domain in `stores` (1–20). The query field is
  `q`, understood by default; `understand`, `facets`, `exclude_facets`, the
  price and brand-quality bounds, `relax`, and `debug` refine it (see below).
  Results come back as `items` + `next_cursor`, each item carrying
  `product_url`, plus `effective_query` with `debug=True`.
- `more_like_this_products(...)` finds products similar to a source product URL
  or UUID, or to a set of 1–20 product UUIDs passed as `sources`, optionally
  restricted to `catalogs` (1–100 keys). `facets`,
  `exclude_facets` and the price and brand-quality bounds work as on search.
  `relax` defaults to `True` on the server: a short page 1 is retried with
  Platform's generated facets dropped, never yours, and reported in
  `effective_query.relaxation` with `debug=True`. `facets` replaced `include_facets` in 0.8.0.
  `omit_generated_facets` and the embedding-column lists tune what is generated
  and how candidates are retrieved and ranked.
- `lookup_product(url, match_mode=..., resolution_mode=..., on_demand_cache_policy=...)`
  resolves a product URL from the index or on demand. `resolution_mode` and
  `on_demand_cache_policy` default to `auto` and `prefer_cache`; omitting
  `match_mode` leaves the server on its own default (`loose`).
- `resolve_product_from_html(html=..., url=...)` resolves a product from page
  HTML you already have — no index read, no outbound fetch.
- `list_taxonomy_categories(parent=...)`, `list_taxonomy_attributes(category)`
  and `list_taxonomy_attribute_values(handle)` discover categories, their
  attributes and the attributes' value handles, paged with `offset`/`limit`.
  A category's `facets` and an attribute's `facet_name` plus value `handle` go
  back into `search_products` unchanged.
- `count_product_facets(...)` counts the products `search_products` would
  filter to — by `categories`, `attributes` and `facet_names` — under the same
  `q`, facets, bounds and `catalogs`.

- `search_brand_prefix(prefix)` completes a canonical brand name from its
  first characters. `search_brands_from_text(text, ...)` finds brands from a
  description, optionally steered by `reference_brands` (`understand=False`
  matches the text as written, with only the facets you send);
  `search_similar_brands(brands, ...)` finds brands like 1–20 source brands.
  Both take `facets` (and similar, `exclusion_facets`) as `BrandFacet`s, whose
  names are `facet_*` keys such as `facet_price_tier`.
- `get_brand_details(brand)`, `browse_brand_products(brand, limit=..., offset=...)`
  and `get_brand_top_categories(brand, min_level=..., limit=...)` read one
  brand by slug or case-insensitive name. An unknown brand raises
  `OctogenNotFoundError` with `detail == "brand_not_found"`.

- `create_coverage_url_list(name=...)`, `list_coverage_url_lists(...)`,
  `get_coverage_url_list(url_list_id)`, and
  `delete_coverage_url_list(url_list_id)` manage coverage URL lists — named
  sets of product URLs that Octogen continuously joins against its crawled
  index and shares back as a BigQuery listing.
- `add_coverage_url_list_urls(url_list_id, urls=[...])`,
  `remove_coverage_url_list_urls(url_list_id, urls=[...])`,
  `check_coverage_url_list_urls(url_list_id, urls=[...])`, and
  `list_coverage_url_list_urls(url_list_id, ...)` mutate and inspect a list's
  membership with per-URL accepted/rejected outcomes.

```python
async with OctogenClient(base_url="https://api.storerouter.ai/v1") as client:
    similar = await client.more_like_this_products(
        source_url="https://warrenlotas.com/products/black-hoodie",
        price_preference="any",
        limit=12,
    )
    for product in similar.items:
        print(product.title, product.product_url)
```



```python
async with OctogenClient(base_url="https://api.storerouter.ai/v1") as client:
    url_list = await client.create_coverage_url_list(name="q3-campaign")
    result = await client.add_coverage_url_list_urls(
        url_list.url_list_id,
        urls=["https://warrenlotas.com/products/black-hoodie"],
    )
    print(result.url_count, [r.code for r in result.rejected])
```

```python
async with OctogenClient() as client:
    children = await client.list_taxonomy_categories(
        parent="Apparel & Accessories > Clothing"
    )
    dresses = next(c for c in children.categories if c.name == "Dresses")
    counts = await client.count_product_facets(
        q="red",
        categories=[{"key": dresses.id, "facets": dresses.facets}],
        attributes=["neckline"],
    )
    print(counts.categories[0].count, counts.attributes[0].values[:3])
```

```python
async with OctogenClient() as client:
    similar = await client.search_similar_brands(["Reformation"], limit=5)
    for brand in similar.results:
        print(brand.brand_name, brand.domain)
    top = await client.get_brand_top_categories("reformation", min_level=1)
    print([category.category_name for category in top.top_categories])
```

### Search controls

Each `search_products` keyword controls one thing. `q` says what to find and is
understood by default — rewritten for retrieval, with category, colour, brand,
price, and attribute filters derived from it. `facets`, `exclude_facets`, and
the bounds say what to keep; `catalogs` says where to look.

```python
async with OctogenClient(base_url="https://api.storerouter.ai/v1") as client:
    page = await client.search_products(
        q="black hoodie",
        catalogs=["warrenlotas"],  # omit to search every catalog your key can access
        facets=[{"name": "color", "values": ["black"]}],
        exclude_facets=[{"name": "brand_name", "values": ["acme"]}],
        price_min=50,
        price_max=300,
        brand_quality_min=4,  # 1 (very poor) to 6 (exceptional)
        similar_to_brands=["Warren Lotas"],  # ranks, does not filter
        relax=True,  # drop understood filters in stages if nothing matches
        debug=True,
    )
    if page.effective_query is not None:
        for facet in page.effective_query.facets or []:
            print(facet.name, facet.values, facet.source)  # "caller" | "generated"
```

- `understand=False` matches `q` as written and filters only by what you send.
- `omit_generated_facets=["fit"]` drops an understood facet that is wrong when
  you have no value of your own for it; to replace one, send a facet of that
  name instead. Use the names `effective_query` reports.
- A facet sent as `{"name": "color_family", "values": ["Red"], "relaxable": True}`
  (or `SearchFacet(..., relaxable=True)`) may be dropped by `relax`; every other
  facet you send never is. This is how a caller doing its own query
  understanding gets the server's staged fallback: `understand=False`, its
  guesses as `relaxable` facets, and `relax=True`. Only names a relaxation
  stage covers may be marked (brand profile facets, taxonomy attributes,
  `color`, `color_family`, `category_path.depth_2` and deeper).
- `debug=True` adds `effective_query`, the search that actually ran.

Contradictions the API would refuse — `relax` without a `q` or with
`understand=False` and no `relaxable` facet, `understand=False` without a `q`,
a facet name sent twice, `price_min` above `price_max` — raise
`pydantic.ValidationError` before any request.

**Removed in 0.5.0** (the API now answers them with `422`): `catalog=` → use
`catalogs=[key]`; `text_search_query=` → use `q` with `understand=False` and
your filters in `facets` and `exclude_facets`. See the
[CHANGELOG](./CHANGELOG.md#050--2026-10-14) for the migration.

### Prebuilt requests, timeouts, and errors

Every operation with a request body also takes `request=`, a prebuilt request
model sent as is. A subclass's extra fields go out too, which bridges a field
the API accepts before this SDK declares it. Passing `request=` together with
the keyword form is a `TypeError`.

```python
class MySearchRequest(ProgrammaticProductSearchRequest):
    new_control: bool | None = None

page = await client.search_products(
    request=MySearchRequest(q="linen dress", new_control=True),
    timeout=2.5,  # this call only; also works with an injected http_client
)
```

Every operation takes `timeout` (seconds or an `httpx.Timeout`). The SDK never
retries, so map failures by type and retry what is safe for your call:

| Error | When | Fields |
| --- | --- | --- |
| `OctogenRateLimitError` | `429` | `retry_after` (seconds or `None`) |
| `OctogenInsufficientCreditError` | `402` | `detail` has `top_up_url` |
| `OctogenServerError` | `5xx` | `retry_after` on a back-pressure `503` |
| `OctogenTimeoutError` | `httpx` timeout, or `504` (`OctogenGatewayTimeoutError`) | — |
| `OctogenConnectionError` | connection refused or reset | — |

`lookup_product_markdown(url)` returns the product as LLM-ready Markdown
(`format: "markdown"`, `Accept: text/markdown`) in a
`ProductMarkdownLookupResult`, with `request_id`, `product_uuid`, `catalog`,
`matched_via` and `normalized_url` from the response's identity headers.

Every `OctogenAPIError` carries `status_code`, `detail`, and `request_id` (the
response's `x-request-id`). `OctogenTimeoutError` subclasses
`OctogenConnectionError`; a `504` is both an `OctogenTimeoutError` and an
`OctogenServerError`.

## Coverage URL lists CLI

`octogen-url-lists` manages coverage URL lists from the terminal, so the whole
workflow — build a list, then subscribe to its BigQuery listing with
`octogen-bq-subscribe` — stays on the command line. It uses
`OCTOGEN_PLATFORM_API_KEY` (or `--api-key`), not Google credentials.

```bash
export OCTOGEN_PLATFORM_API_KEY=octo_live_...
uv run --project sdks/python octogen-url-lists create --base-url https://api.storerouter.ai/v1 --name q3-campaign --apply
```

Mutating commands are **dry-run by default** — matching `octogen-bq-subscribe`
and `octogen-bq-autosubscribe` — so nothing changes until you pass `--apply`:

```bash
uv run --project sdks/python octogen-url-lists add-urls --base-url https://api.storerouter.ai/v1 cul_01... --file urls.txt
uv run --project sdks/python octogen-url-lists add-urls --base-url https://api.storerouter.ai/v1 cul_01... --file urls.txt --apply
```

`--file` reads one URL per line, skipping blank lines and `#` comments (pass
`-` to read standard input), removes exact duplicates, and splits the result
into requests of 1,000 URLs automatically. `--url` takes a single URL and can
be repeated.

| Command | Purpose |
| --- | --- |
| `create --name NAME` | Create a list |
| `list` | Show every list, following pagination |
| `get URL_LIST_ID` | Show one list, including its BigQuery listing and last export |
| `urls URL_LIST_ID [--limit N]` | Print member URLs in insertion order |
| `add-urls URL_LIST_ID` | Add URLs (batched) |
| `remove-urls URL_LIST_ID` | Remove URLs (batched) |
| `contains URL_LIST_ID` | Report which URLs are members |
| `delete URL_LIST_ID` | Permanently delete the list and its BigQuery resources |

Add `--json` to any command for machine-readable output; dry-run JSON uses the
same keys as the applied output so automation can parse both with one schema.

Deletion is permanent and has no restore, so `delete --apply` first shows what
the list holds and then asks you to retype its name. Pass `--yes` to skip that
prompt; without a TTY, `--yes` is required rather than assumed.

| Exit code | Meaning |
| --- | --- |
| `0` | Success, or a dry run |
| `1` | The API call failed |
| `2` | Usage error, missing API key, or an unconfirmed delete |
| `3` | The change was applied but some URLs were rejected |

Because a large file becomes several requests, a failure partway through
leaves the earlier requests applied. In that case the command exits `1` but
still reports how many URLs landed — `completedRequests` and `urlCount` in
JSON, and a `stopped after N/M request(s)` line on stderr — so automation
never reads a partial update as a no-op. Re-running the same input is safe:
adds and removes are idempotent.

## BigQuery subscribe (optional)

Once Octogen grants your organization access to a catalog's BigQuery Analytics
Hub listing, subscribe to it — creating the linked dataset in **your** GCP
project — without leaving the terminal. Install the extra and authenticate with
Application Default Credentials:

```bash
pip install "octogen-ai-sdk[bigquery]"
gcloud auth application-default login
```

CLI (dry-run by default; `--apply` to subscribe):

```bash
octogen-bq-subscribe --listing <listing-resource> --project my-gcp-project --apply
```

Or programmatically:

```python
from octogen_ai_sdk import subscribe_to_listing

result = subscribe_to_listing(
    listing_resource="projects/octogen-prod/locations/us/dataExchanges/oneoff/listings/farfetch",
    destination_project="my-gcp-project",
)
print(result.linked_dataset, result.state)
```

Copy `<listing-resource>` from the Platform UI BigQuery sharing page or from
the Catalog Partner MCP `list_bigquery_listing_resources` tool. It's
idempotent, and raises `OctogenBigQueryAccessPendingError` if Octogen's IAM
grant hasn't landed yet (it's asynchronous — retry in a few minutes).

### Auto-subscribe new listings

For cron jobs, use the higher-level autosubscribe command. It calls Octogen MCP
to register your Reader if needed, finds every ready listing that is not active
yet, creates linked datasets in your GCP project, then refreshes Octogen's
status.

Bootstrap Octogen MCP credentials once from an interactive terminal:

```bash
uv run --project sdks/python octogen-mcp-login \
  --authkit-domain https://auth.storerouter.ai \
  --resource https://mcp.storerouter.ai \
  --client-id-file /secure/octogen-mcp.client-id \
  --refresh-token-file /secure/octogen-mcp.refresh
```

Dry-run first:

```bash
OCTOGEN_MCP_CLIENT_ID_FILE=/secure/octogen-mcp.client-id \
OCTOGEN_MCP_REFRESH_TOKEN_FILE=/secure/octogen-mcp.refresh \
uv run --project sdks/python --extra bigquery \
  octogen-bq-autosubscribe \
  --mcp-url https://mcp.storerouter.ai/mcp/ \
  --mcp-token-endpoint https://auth.storerouter.ai/oauth2/token \
  --project my-gcp-project \
  --principal serviceAccount:bq-reader@my-gcp-project.iam.gserviceaccount.com \
  --json
```

Apply from cron:

```cron
*/15 * * * * cd /path/to/octogen-dev && OCTOGEN_MCP_CLIENT_ID_FILE=/secure/octogen-mcp.client-id OCTOGEN_MCP_REFRESH_TOKEN_FILE=/secure/octogen-mcp.refresh uv run --project sdks/python --extra bigquery octogen-bq-autosubscribe --mcp-url https://mcp.storerouter.ai/mcp/ --mcp-token-endpoint https://auth.storerouter.ai/oauth2/token --project my-gcp-project --principal serviceAccount:bq-reader@my-gcp-project.iam.gserviceaccount.com --apply --json
```

`OCTOGEN_MCP_REFRESH_TOKEN_FILE` should contain an Octogen MCP OAuth refresh
token. If WorkOS rotates that refresh token during exchange, the command writes
the replacement back to the same file. The command also accepts
`OCTOGEN_MCP_CLIENT_ID` instead of `OCTOGEN_MCP_CLIENT_ID_FILE`,
`OCTOGEN_MCP_TOKEN_COMMAND` for custom token brokers, or
`OCTOGEN_MCP_ACCESS_TOKEN` for short-lived manual runs. BigQuery subscription
still uses your local Google Application Default Credentials.

## Tests

Run the mocked SDK tests:

```bash
uv run pytest
```

Run linting:

```bash
uv run ruff check
```

Run type checking:

```bash
uv run ty check
```

Run all configured git hooks:

```bash
uv run --project sdks/python prek run --all-files
```

## Example

From the repository root:

```bash
OCTOGEN_PLATFORM_API_KEY=... uv run --project sdks/python python examples/python/search_clothes.py
```

## Generated versus hand-written

`src/octogen_ai_sdk/generated/models.py` is emitted from the published contract
by `npm run codegen` (at the repository root) and committed, so a contract
change arrives as a reviewable diff. **Response** models are re-exported from it
under the contract's own names.

Response models are forward compatible, generated or hand-written: they keep
unknown fields (`extra="allow"`, read them from `model_extra` or
`model_dump(by_alias=True)`), and their enums are open (`Literal[...] | str`),
so a value the server adds after this release parses instead of failing the
response. Request models keep closed enums and `extra="forbid"`.

**Request** models stay hand-written in `models.py`, for two reasons: rules the
contract cannot express (`extra="forbid"` catches a misspelled key, but not
"exactly one of `url` or `uuid`"), and constructor ergonomics — the generator
turns a length-constrained string into a root-model alias, so a generated
request body would not accept a plain `str`.

`operations.py` is the routing table; `tests/contract` fails when it and the
published contract disagree in either direction.

## Per-call RequestContext

From **0.10.0**, every API operation accepts a keyword-only `context`, outside
its request body. Configure only stable application metadata as defaults; pass
visitor identity and the original visitor user agent on each call:

```python
from octogen_ai_sdk import (
    OctogenClient, RequestContext, RequestContextDefaults, RequestVisitor,
)

async with OctogenClient(
    default_context=RequestContextDefaults(application="storefront", feature="grid"),
) as client:
    # Inherit application/feature defaults.
    await client.search_products(q="linen shirt")
    # Override one default and attach this visitor only to this call.
    await client.search_products(
        q="linen shirt",
        context=RequestContext(
            feature="search", trigger="user_search",
            user_id="synthetic-user", session_id="synthetic-session",
            page_view_id="synthetic-view", user_agent="Original Browser/1.0",
            visitor=RequestVisitor(classification="likely_human", provider="storefront"),
        ),
    )
    # Clear one inherited field; other defaults remain.
    await client.search_products(context=RequestContext(feature=None))
    # Clear the entire inherited context: no context header for this call.
    await client.search_products(context=None)
```

Omitting `context` inherits defaults; `RequestContext()` also inherits them.
Without defaults, omission sends no new header and `RequestContext()` sends
`{}`. Explicit `None` on a context field clears that default by sending JSON
`null`. Defaults accept only `application`, `feature` and `trigger`; per-call
fields also include `user_id`, `session_id`, `page_view_id`, `user_agent` and
`visitor`. Visitor fields are `classification`, `provider` and `bot_name`.
IDs stay at the context root. Inputs are copied and headers are built per request,
including for an injected shared HTTPX client. A transport retry retains that
request's encoded context; the SDK itself never retries.

The header uses compact ASCII-safe JSON, with a **4,096-byte** serialized limit.
Strings allow **256 Unicode characters**, except `user_agent` (**1,024**), within
that same byte budget. Emoji count as one character but consume twelve bytes as
ASCII escapes. Unknown fields, invalid types/enums and limits raise
`InvalidRequestContext` (a `TypeError`) with no input values. `trigger` accepts
`user_search`, `page_load`, `filter_change`, `pagination`, `autoplay`, `prefetch`,
`isr_refresh`, `background`. Classification accepts `likely_human`, `verified_bot`,
`suspected_bot`, `unknown`. All fields may be omitted or null.

Raw HTTP uses the same optional header:

```bash
curl https://api.octogen.ai/v1/products/search \
  -H "Authorization: Bearer $OCTOGEN_PLATFORM_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'X-Octogen-Request-Context: {"application":"storefront","feature":"caf\u00e9","trigger":"user_search","user_id":"synthetic-user"}' \
  -d '{"q":"linen shirt"}'
```

`context.user_agent` is the caller-reported original visitor agent. HTTP
`User-Agent` continues to identify the SDK/transport; neither value is synthesized
from the other. Omit original visitor context for shared background/ISR work
without an originating visitor. Use opaque pseudonymous IDs, never email, names,
cookies or authentication tokens. Application labels and even `verified_bot` are
caller reports, not authenticated source or bot trust. Context is transient
metadata, not response data or search parameters; server storage and collection
activation are separate operations. Release publication is tracked by OCT-4518.
