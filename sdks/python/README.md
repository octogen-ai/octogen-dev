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
