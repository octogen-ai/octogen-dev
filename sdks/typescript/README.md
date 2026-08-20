# Octogen TypeScript SDK

Async TypeScript SDK for the Octogen AI commerce API.

## Install

```bash
npm install @octogen-ai/sdk
```

During local repo development this package is an npm workspace member. Install
once from the repository root:

```bash
npm install
```

## Usage

The client reads `OCTOGEN_PLATFORM_API_KEY` from the environment by default,
which is the name every Octogen document uses. You can also pass `apiKey`
explicitly. `OCTO_API_KEY` is still read as a fallback, with a deprecation
warning on stderr, and will be removed in a future release.

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
- `lookupProduct(url, options?)` resolves a product URL from the index or on
  demand. The optional controls default to `auto` and `prefer_cache`.
- `listDomains(options?)` lists every host covered by an active crawled
  catalog. This is the coverage gate — match a page's host against this set
  before calling `lookupProduct`. Supports `ETag` revalidation; see below.
- `refreshProducts(params)` schedules product URLs or UUIDs for a refresh crawl.
- `resolveProductFromHtml(params)` resolves a product from HTML you already
  have: no index read, no outbound fetch.
- `startVoyage(domain)`, `listVoyages(params?)`, and `getVoyage(taskId)` drive
  Voyager, which crawls and builds an extraction for a domain Octogen does not
  cover yet.
- `createCoverageUrlList(name)`, `listCoverageUrlLists(params?)`,
  `getCoverageUrlList(urlListId)`, and `deleteCoverageUrlList(urlListId)`
  manage coverage URL lists — named sets of product URLs that Octogen
  continuously joins against its crawled index and shares back as a BigQuery
  listing.
- `addCoverageUrlListUrls(urlListId, urls)`,
  `removeCoverageUrlListUrls(urlListId, urls)`,
  `checkCoverageUrlListUrls(urlListId, urls)`, and
  `listCoverageUrlListUrls(urlListId, params?)` mutate and inspect a list's
  membership with per-URL accepted/rejected outcomes.

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

Check coverage before looking a URL up. The domain set is stable and large, so
cache it and revalidate with the `ETag` the API returns:

```ts
let coverage = await client.listDomains();
const covered = new Set(coverage.domains?.map((entry) => entry.host));

if (covered.has(new URL(productUrl).host)) {
  const product = await client.lookupProduct(productUrl);
  console.log(product.product.title);
}

// Later: one round trip that usually comes back `304`.
const revalidated = await client.listDomains({
  ifNoneMatch: coverage.etag ?? undefined,
});
if (!revalidated.notModified) {
  coverage = revalidated;
}
```

If Octogen does not cover the host yet, start a voyage. Voyages are shared per
domain, so `joined` tells you whether this call dispatched a new one — which
consumes quota — or attached to one already running, which does not:

```ts
const { task, joined } = await client.startVoyage("shop.example");
console.log(task.taskId, task.phaseLabel, joined ? "joined" : "dispatched");

// Voyages run for hours to days. Poll no faster than every five minutes.
const progress = await client.getVoyage(task.taskId);
console.log(progress.progressPercent, progress.result?.catalog);
```

```ts
const refresh = await client.refreshProducts({
  targets: [
    {
      catalog: "warrenlotas",
      url: "https://warrenlotas.com/products/black-hoodie",
    },
    { uuid: "product-uuid" },
  ],
});

console.log(refresh.submitted, refresh.workflowStatus);
```

Resolve a page you already fetched yourself — useful in a browser extension or
a crawler that has the DOM in hand:

```ts
const resolved = await client.resolveProductFromHtml({
  html: document.documentElement.outerHTML,
  url: location.href,
});
```

```ts
const urlList = await client.createCoverageUrlList("q3-campaign");
const result = await client.addCoverageUrlListUrls(urlList.urlListId, [
  "https://warrenlotas.com/products/black-hoodie",
]);

console.log(
  result.urlCount,
  result.rejected.map((r) => r.code),
);
```

## Development

Every command runs from the repository root, across all workspaces:

```bash
npm run lint
npm run format
npm run typecheck
npm run test
npm run build
```

Or the whole quality suite, which is what CI runs:

```bash
npm run check
```

To scope a command to this package:

```bash
npm run test --workspace sdks/typescript
```

Request and response types under `src/generated/` are emitted from the
published OpenAPI contract by `npm run codegen` and committed, so a contract
change lands as a reviewable diff. The method layer is hand-written;
[`tests/contract`](../../tests/contract) is what keeps the two in agreement.

Run the live example:

```bash
OCTOGEN_PLATFORM_API_KEY=... npm run example:search-clothes --workspace sdks/typescript
```
