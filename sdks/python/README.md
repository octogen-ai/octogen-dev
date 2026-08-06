# Octogen Python SDK

Async Python SDK for the Octogen AI commerce API.

## Install For Development

From this directory:

```bash
uv sync
```

## Authentication

The client reads the API key from `OCTO_API_KEY` by default and sends it as:

```text
Authorization: Bearer <api-key>
```

You can also pass `api_key` explicitly when constructing the client.

## Usage

```python
import asyncio

from octogen_ai_sdk import OctogenClient


async def main() -> None:
    async with OctogenClient() as client:
        results = await client.search_products(
            q="women's linen summer dresses",
            limit=5,
        )
        for product in results.items:
            print(product.title, product.product_url)


asyncio.run(main())
```

## API

- `search_products(...)` searches all authorized catalogs by default, or one
  catalog when `catalog` is provided.
- `more_like_this_products(...)` finds products similar to a source product URL
  or UUID, optionally within one catalog.
- `lookup_product(url, resolution_mode=..., on_demand_cache_policy=...)` resolves
  a product URL from the index or on demand. The optional controls default to
  `auto` and `prefer_cache`.
- `recrawl_products(targets=[...])` schedules product URLs or UUIDs for recrawl.
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
async with OctogenClient() as client:
    similar = await client.more_like_this_products(
        source_url="https://warrenlotas.com/products/black-hoodie",
        price_preference="any",
        limit=12,
    )
    for product in similar.items:
        print(product.title, product.product_url)
```

```python
async with OctogenClient() as client:
    recrawl = await client.recrawl_products(
        targets=[
            {
                "catalog": "warrenlotas",
                "url": "https://warrenlotas.com/products/black-hoodie",
            },
            {"uuid": "product-uuid"},
        ],
    )
    print(recrawl.tasks_created, recrawl.task_ids)
```

```python
async with OctogenClient() as client:
    url_list = await client.create_coverage_url_list(name="q3-campaign")
    result = await client.add_coverage_url_list_urls(
        url_list.url_list_id,
        urls=["https://warrenlotas.com/products/black-hoodie"],
    )
    print(result.url_count, [r.code for r in result.rejected])
```

## Coverage URL lists CLI

`octogen-url-lists` manages coverage URL lists from the terminal, so the whole
workflow — build a list, then subscribe to its BigQuery listing with
`octogen-bq-subscribe` — stays on the command line. It uses `OCTO_API_KEY`
(or `--api-key`), not Google credentials.

```bash
export OCTO_API_KEY=octo_live_...
uv run --project sdks/python octogen-url-lists create --name q3-campaign --apply
```

Mutating commands are **dry-run by default** — matching `octogen-bq-subscribe`
and `octogen-bq-autosubscribe` — so nothing changes until you pass `--apply`:

```bash
uv run --project sdks/python octogen-url-lists add-urls cul_01... --file urls.txt
uv run --project sdks/python octogen-url-lists add-urls cul_01... --file urls.txt --apply
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
  --client-id-file /secure/octogen-mcp.client-id \
  --refresh-token-file /secure/octogen-mcp.refresh
```

Dry-run first:

```bash
OCTOGEN_MCP_CLIENT_ID_FILE=/secure/octogen-mcp.client-id \
OCTOGEN_MCP_REFRESH_TOKEN_FILE=/secure/octogen-mcp.refresh \
uv run --project sdks/python --extra bigquery \
  octogen-bq-autosubscribe \
  --project my-gcp-project \
  --principal serviceAccount:bq-reader@my-gcp-project.iam.gserviceaccount.com \
  --json
```

Apply from cron:

```cron
*/15 * * * * cd /path/to/octogen-dev && OCTOGEN_MCP_CLIENT_ID_FILE=/secure/octogen-mcp.client-id OCTOGEN_MCP_REFRESH_TOKEN_FILE=/secure/octogen-mcp.refresh uv run --project sdks/python --extra bigquery octogen-bq-autosubscribe --project my-gcp-project --principal serviceAccount:bq-reader@my-gcp-project.iam.gserviceaccount.com --apply --json
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
OCTO_API_KEY=... uv run --project sdks/python python examples/python/search_clothes.py
```
