# StoreRouter Python SDK

[![PyPI](https://img.shields.io/pypi/v/storerouter)](https://pypi.org/project/storerouter/)
[![Python](https://img.shields.io/pypi/pyversions/storerouter)](https://pypi.org/project/storerouter/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/octogen-ai/octogen-dev/blob/main/LICENSE)

`storerouter` is the official Python SDK for [StoreRouter](https://storerouter.ai),
an API that returns **structured e-commerce product data**. Use it to:

- turn a product page URL into normalized JSON (title, brand, price, currency,
  stock, variants, images, identifiers, taxonomy category and attributes);
- search products across thousands of stores, or only the stores you name;
- discover stores and brands.

Every result uses **one product schema**, whatever store it came from, and
every response is a typed Pydantic model. The package has sync and async
clients, and it retries 429 and 5xx responses for you.

```bash
pip install storerouter
```

## Quickstart

Get an API key at [dev.storerouter.ai](https://dev.storerouter.ai) and export it:

```bash
export STOREROUTER_API_KEY="sk_..."
```

```python
from storerouter import StoreRouter

client = StoreRouter()  # reads STOREROUTER_API_KEY

result = client.lookup_product(
    "https://www.allbirds.com/products/mens-runner-nz-jersey-light-grey-syrah"
)
product = result.product
print(product.title, product.current_price, product.currency, product.in_stock)
# Men's Runner NZ Jersey - Light Grey/Syrah (Blizzard Sole) 110.0 USD True
```

## Look up a product URL

`lookup_product` takes the URL of any product page. It returns the indexed
product when StoreRouter already has it, and otherwise extracts the page on
demand. `result.source` says which: `"indexed"` or `"on_demand"`.

```python
result = client.lookup_product(
    "https://www.allbirds.com/products/mens-runner-nz-jersey-light-grey-syrah"
)
print(result.product.model_dump_json(by_alias=True, exclude_none=True, indent=2))
```

This is real output, shortened. It shows one of 19 variants and some of the
enrichment attributes. It leaves out the description, the long brand
description, the image list, the store's own attributes and the request ID on
image URLs.

```json
{
  "uuid": "2b7a52cc-93e4-545a-999c-ed6f41f54ea6",
  "catalogKey": "allbirds",
  "productUrl": "https://www.allbirds.com/products/mens-runner-nz-jersey-light-grey-syrah",
  "title": "Men's Runner NZ Jersey - Light Grey/Syrah (Blizzard Sole)",
  "brand": { "name": "Allbirds", "slug": "allbirds", "url": "www.allbirds.com" },
  "currentPrice": 110.0,
  "originalPrice": 110.0,
  "currency": "USD",
  "inStock": true,
  "availability": "InStock",
  "primaryImage": {
    "url": "https://cdn.shopify.com/s/files/1/1104/4168/files/A12548_26Q1_Runner-NZ-Jersey-Light-Grey-Syrah-Bizzard-Sole_PDP_LEFT.png?v=1774551568",
    "cdnUrl": "https://cdn.storerouter.ai/91b22b320476b49b1d658a81b4f2aad6/6afbe5a521bcb04aa95fbb111487a33d.webp",
    "width": 4000,
    "height": 4000,
    "mimeType": "image/webp"
  },
  "sizes": [
    "8",
    "8.5",
    "9",
    "9.5",
    "10",
    "10.5",
    "11",
    "11.5",
    "12",
    "12.5",
    "13",
    "13.5",
    "14"
  ],
  "colors": [{ "label": "Light Grey/Syrah (Blizzard Sole)" }],
  "categories": [{ "name": "Shoes" }],
  "variants": [
    {
      "sku": "mens-runner-nz-jersey-light-grey-syrah",
      "productUrl": "https://www.allbirds.com/products/mens-runner-nz-jersey-light-grey-syrah",
      "color": { "label": "Light Grey/Syrah (Blizzard Sole)" },
      "inStock": true,
      "availability": "InStock",
      "currentPrice": 110.0,
      "currency": "USD"
    }
  ],
  "identifiers": { "productId": "7258388856912", "productGroupId": "7258388856912" },
  "details": { "materials": ["cotton"], "fit": [], "patterns": [] },
  "audience": { "genders": ["male"], "ageGroups": ["adult"] },
  "enrichment": {
    "type": "sneakers",
    "category_path": ["Apparel & Accessories", "Shoes", "Sneakers"],
    "color_family": ["Gray", "Red", "White"],
    "gender": "male",
    "age_groups": ["adult"],
    "attributes": {
      "Activity Type": ["Running"],
      "Closure type": ["Lace-Up"],
      "Footwear material": ["Cotton"],
      "Sneaker style": ["Athletic"],
      "Shoe Type (Silhouette/Style)": ["Low-Top"]
    },
    "summary": "Men's light grey jersey textile sneakers featuring contrasting red laces and a clean white sole."
  },
  "languageCode": "en-US",
  "updatedAt": "2026-11-06T10:34:25.665193Z"
}
```

Want Markdown for an LLM prompt instead of JSON? Call
`client.lookup_product_markdown(url)`.

### Look up many URLs at once

`lookup_products` runs lookups concurrently (8 at a time by default) and
returns one `LookupResult` per URL, in the same order. A URL that fails does
not stop the batch.

```python
results = client.lookup_products([
    "https://www.allbirds.com/products/mens-runner-nz-jersey-light-grey-syrah",
    "https://www.jcrew.com/p/mens/categories/clothing/shirts/linen/short-sleeve-camp-collar-shirt-in-irish-linen/BG997",
    "https://www.example.com/not-a-product",
])
for r in results:
    if r.ok:
        print("ok  ", r.product.title, r.product.current_price)
    else:
        print("fail", r.url, type(r.error).__name__, r.error)
```

```text
ok   Men's Runner NZ Jersey - Light Grey/Syrah (Blizzard Sole) 110.0
ok   Short-sleeve camp-collar shirt in Irish linen 87.99
fail https://www.example.com/not-a-product OctogenNotFoundError product_not_found
```

## Search products

`search_products` takes a natural-language query. By default StoreRouter
understands it: it rewrites the query for retrieval and turns implied
constraints into filters. You can narrow the search with:

- `stores`: up to 20 store domains;
- `facets`: filters such as `color_family`, `gender`, `brand_name`,
  `category_path.depth_N` and taxonomy attributes;
- `price_min` and `price_max`.

With `relax=True`, a query that finds nothing is retried with its filters
dropped in stages. Only the facets you mark `relaxable=True` can be dropped.

```python
from storerouter import SearchFacet

page = client.search_products(
    q="linen shirt",
    stores=["jcrew.com"],
    facets=[SearchFacet(name="color_family", values=["Blue"], relaxable=True)],
    relax=True,
    limit=3,
)
for item in page.items:
    print(f"{item.title} | {item.current_price} {item.currency} | {item.product_url}")
```

```text
Short-sleeve camp-collar shirt in Irish linen | 87.99 USD | https://www.jcrew.com/p/mens/categories/clothing/shirts/linen/short-sleeve-camp-collar-shirt-in-irish-linen/BG997
Gamine button-up shirt in linen | 87.99 USD | https://www.jcrew.com/p/womens/categories/clothing/matching-sets/gamine-button-up-shirt-in-linen/CV033
Washed linen shirt with point collar | 104.99 USD | https://www.jcrew.com/p/mens/categories/clothing/shirts/linen/washed-linen-shirt-with-point-collar/CH601
```

`page.effective_query` shows the search that actually ran: the understood
filters, and which facets `relax` dropped. To get the next page, pass
`cursor=page.next_cursor`. Each item is a `ProductListItem`, a lighter
version of `Product`. To get the full record, call `lookup_product` with the
item's URL, or `retrieve_products` with the item UUIDs.

Related calls:

- `count_product_facets`: facet value counts for a query;
- `more_like_this_products`: products similar to the ones you pass;
- `list_taxonomy_categories` and `list_taxonomy_attributes`: the category tree
  and attribute names that facets accept.

## Stores and brands

```python
store = client.get_store("allbirds.com")        # is this store covered, and how well?
for catalog in store.catalogs:
    print(catalog.catalog_display_name, catalog.product_count)

stores = client.search_stores("sustainable sneakers", limit=3)
print([s.store.primary_domain for s in stores.results])
# ['seavees.com', 'stellamccartney.com', '8000kicks.com']

brands = client.search_brands("minimalist sneakers", limit=3)
print([(b.brand_name, b.domain) for b in brands.results])
# [('Little Love Bug Co.', 'littlelovebugcompany.com'), ('ALIVEFORM', 'aliveform.co'), ('Camper', 'camper.com')]

brand = client.get_brand_details("allbirds")
print(brand.founded_year, brand.origin_country, brand.price_tier)
# 2016 New Zealand PREMIUM
```

More brand calls: `search_brand_prefix` (autocomplete), `search_similar_brands`,
`get_brand_directory`, `get_brand_coverage`, `browse_brand_products` and
`get_brand_top_categories`. For stores there is also `search_similar_stores`.

To list the catalogs your key may search, and pass their keys as
`catalogs` to `search_products`:

```python
for page in client.iter_catalog_pages(q="allbirds", limit=50):
    for catalog in page.items or []:
        print(catalog.catalog, catalog.display_name, catalog.product_count)
```

`list_catalogs` returns one page; `page.taxonomy_root_counts` counts the
catalogs per top-level taxonomy category across the whole listing.

## Async

`AsyncStoreRouter` has the same constructor and the same methods as
`StoreRouter`, as coroutines:

```python
import asyncio
from storerouter import AsyncStoreRouter

async def main() -> None:
    async with AsyncStoreRouter() as client:
        page = await client.search_products(q="wool sweater", limit=2)
        print([item.title for item in page.items])

asyncio.run(main())
```

`StoreRouter` runs the async client on a private event-loop thread. It
therefore works inside Jupyter and other code that already runs an event
loop. Close it with `client.close()`, or use it in a `with` block.

## The normalized product schema

Every lookup returns a `Product` (`storerouter.models.Product`). Every search
result is a `ProductListItem`, which is a subset of `Product`. Python
attributes use snake_case. The JSON wire format uses camelCase:
`model_dump(by_alias=True)`.

| Field                                | What it holds                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `uuid`, `catalog_key`, `product_url` | StoreRouter's stable ID, the store's catalog, and the canonical product URL                    |
| `title`, `description`               | As the store states them                                                                       |
| `brand`                              | `name`, `slug`, `url`, `description`                                                           |
| `current_price`, `original_price`    | Sale price and list price, as numbers                                                          |
| `currency`                           | ISO 4217 code, for example `USD`                                                               |
| `in_stock`, `availability`           | Stock rolled up across variants, and the schema.org availability term                          |
| `variants`                           | Per-variant `sku`, `color`, `size`, `in_stock`, `current_price`, `original_price`, `image_url` |
| `sizes`, `colors`                    | Sizes and color labels (with swatches and hex codes when the store has them)                   |
| `primary_image`, `images`            | Store image URL plus a StoreRouter CDN copy (`cdn_url`), with dimensions                       |
| `identifiers`                        | `product_id`, `gtin`, `product_group_id`                                                       |
| `categories`, `breadcrumbs`          | The store's own categories and breadcrumb trail                                                |
| `details`                            | `materials`, `fit`, `dimensions`, `patterns`                                                   |
| `audience`                           | `genders`, `age_groups`                                                                        |
| `rating`, `reviews`                  | Aggregate rating and individual reviews                                                        |
| `promotions`, `videos`, `tags`       | Promotions with codes, product videos, and store tags                                          |
| `additional_attributes`              | Name/value pairs as the store states them                                                      |
| `enrichment`                         | Added by StoreRouter (see below)                                                               |
| `item_condition`, `language_code`    | schema.org item condition, and the language of the text                                        |
| `updated_at`                         | When StoreRouter last refreshed the product                                                    |

StoreRouter adds `enrichment` itself. It holds:

- the product `type`;
- a taxonomy `category_path`, root first;
- `color_family`, `gender`, `age_groups` and `styles`;
- category-specific `attributes`: fit and fabric for apparel, skin type for
  skincare, notes for fragrance, upholstery for furniture;
- a `canonical_brand` profile;
- a one-line `summary`.

The full machine-readable schema is the
[OpenAPI document](https://cdn.storerouter.ai/openapi/platform/v1/openapi.json).

## Errors and retries

The client retries 429, 500, 502, 503 and 504 responses, and connections that
fail to open. It waits for `Retry-After` when the server sends one, and uses
exponential backoff otherwise. Read timeouts are not retried. Set the number
of retries with `StoreRouter(max_retries=...)` (the default is 2, and 0
disables retries).

When a call fails, it raises a typed error. Each one is an alias of the
matching `octogen_ai_sdk` error:

| Error                     | When                                                 |
| ------------------------- | ---------------------------------------------------- |
| `MissingAPIKeyError`      | No key passed, and none in the environment           |
| `AuthenticationError`     | 401: the key is invalid                              |
| `InsufficientCreditError` | 402: the organization is out of credit               |
| `PermissionDeniedError`   | 403: the key cannot use this endpoint or catalog     |
| `NotFoundError`           | 404: product not found, or store not covered         |
| `ValidationError`         | 422: invalid request                                 |
| `RateLimitError`          | 429 after retries; `error.retry_after` is in seconds |
| `InternalServerError`     | 5xx after retries                                    |
| `APITimeoutError`         | The request timed out                                |
| `APIConnectionError`      | Network failure                                      |

`APIError` is the base class of every HTTP error, and `StoreRouterError` is
the base class of them all. HTTP errors carry `status_code`, `detail` and
`request_id`.

## Configuration

| Setting  | Argument                                | Environment variable                                    | Default                         |
| -------- | --------------------------------------- | ------------------------------------------------------- | ------------------------------- |
| API key  | `api_key=`                              | `STOREROUTER_API_KEY` (then `OCTOGEN_PLATFORM_API_KEY`) | required                        |
| Base URL | `base_url=`                             | `STOREROUTER_BASE_URL`                                  | `https://api.storerouter.ai/v1` |
| Timeout  | `timeout=` (seconds or `httpx.Timeout`) |                                                         | 60 s                            |
| Retries  | `max_retries=`                          |                                                         | 2                               |

Every method also accepts a per-call `timeout=`. Requests use
`Authorization: Bearer <key>`. Billing is per successful request, and every
organization gets free credit each month: see
[pricing](https://storerouter.ai/docs/guides/pricing-and-billing).

## Other ways to use StoreRouter

- **MCP server for AI agents**: `https://mcp.dev.storerouter.ai/mcp`
  (Streamable HTTP with OAuth). It gives Claude, ChatGPT, Cursor and other MCP
  clients product search, product lookup, and store and brand tools. See the
  [setup guides](https://storerouter.ai/docs/mcp/overview).
- **LangChain**: [`langchain-storerouter`](https://pypi.org/project/langchain-storerouter/)
- **TypeScript**: [`@storerouter/sdk`](https://www.npmjs.com/package/@storerouter/sdk)
- **CLI**: [`@storerouter/cli`](https://www.npmjs.com/package/@storerouter/cli)
- **REST**: the [API reference](https://storerouter.ai/docs/api-reference)
  and the [OpenAPI document](https://cdn.storerouter.ai/openapi/platform/v1/openapi.json)

`storerouter` is built on [`octogen-ai-sdk`](https://pypi.org/project/octogen-ai-sdk/),
the lower-level async SDK for the same API. It adds the sync client, retries,
batch lookup and the `STOREROUTER_*` settings. Every `octogen_ai_sdk` model is
available from `storerouter.models`.

## Documentation

- [StoreRouter docs](https://storerouter.ai/docs)
- [API reference](https://storerouter.ai/docs/api-reference)
- [MCP server](https://storerouter.ai/docs/mcp/overview)
- [Source and issues](https://github.com/octogen-ai/octogen-dev/tree/main/sdks/storerouter-python)

## License

Apache-2.0
