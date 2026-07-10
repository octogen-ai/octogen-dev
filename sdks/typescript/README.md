# Octogen TypeScript SDK

Async TypeScript SDK for the Octogen AI commerce API.

## Install

```bash
npm install @octogen-ai/sdk
```

During local repo development, install dependencies from this package directory:

```bash
npm --prefix sdks/typescript install
```

## Usage

The client reads `OCTO_API_KEY` from the environment by default. You can also
pass `apiKey` explicitly.

```ts
import { OctogenClient } from "@octogen-ai/sdk";

const client = new OctogenClient();
const results = await client.searchProducts({
  limit: 5,
  q: "women's linen summer dresses",
});

for (const product of results.items) {
  console.log(product.title, product.productUrl);
}
```

## API

- `searchProducts(params)` searches all authorized catalogs by default, or one
  catalog when `catalog` is provided.
- `moreLikeThisProducts(params)` finds products similar to a source product URL
  or UUID, optionally within one catalog.
- `lookupProduct(url)` looks up a product by canonical URL.
- `recrawlProducts(params)` schedules product URLs or UUIDs for recrawl.

Requests are authenticated with `Authorization: Bearer <api-key>`.

```ts
const similar = await client.moreLikeThisProducts({
  source: { url: "https://warrenlotas.com/products/black-hoodie" },
  pricePreference: "any",
  limit: 12,
});

for (const product of similar.items) {
  console.log(product.title, product.productUrl);
}
```

```ts
const recrawl = await client.recrawlProducts({
  targets: [
    {
      catalog: "warrenlotas",
      url: "https://warrenlotas.com/products/black-hoodie",
    },
    { uuid: "product-uuid" },
  ],
});

console.log(recrawl.tasksCreated, recrawl.taskIds);
```

## Development

```bash
npm --prefix sdks/typescript run lint
npm --prefix sdks/typescript run format
npm --prefix sdks/typescript run typecheck
npm --prefix sdks/typescript run test
npm --prefix sdks/typescript run build
```

Run the complete TypeScript SDK quality suite:

```bash
npm --prefix sdks/typescript run check
```

Run the live example:

```bash
OCTO_API_KEY=... npm --prefix sdks/typescript run example:search-clothes
```
