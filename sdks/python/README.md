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

Get `<listing-resource>` from the Catalog Partner MCP
`list_bigquery_listing_resources` tool or from the Platform UI BigQuery sharing
page. It's idempotent, and raises `OctogenBigQueryAccessPendingError` if
Octogen's IAM grant hasn't landed yet (it's asynchronous — retry in a few
minutes).

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
