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

- `list_catalogs()` lists active catalogs available to the API key's merchant.
- `search_products(...)` searches all authorized catalogs by default, or one
  catalog when `catalog` is provided.
- `lookup_product(url)` looks up a product by canonical URL.

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
