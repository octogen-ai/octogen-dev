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

The client reads **`OCTOGEN_PLATFORM_API_KEY`** from the environment by default —
the same variable the Octogen agent-onboarding skill and CLI use. You can also
pass `apiKey` explicitly.

```ts
import { OctogenClient } from "@octogen-ai/sdk";

const client = new OctogenClient();
const results = await client.searchProducts({
  limit: 3,
  q: "paisley jackets",
});

for (const product of results.items) {
  console.log(product.title, product.productUrl);
}
```

`OCTO_API_KEY` is still read as a **deprecated** fallback: it warns once and
will be removed. Set `OCTOGEN_PLATFORM_API_KEY`.

### Start with coverage

Octogen does not cover every merchant, and the coverage check is the cheapest
call you can make. `GET /v1/domains` returns hosts **normalized by the
server** — lowercased, with a leading `www.` stripped — so it reports
`macys.com` and never `www.macys.com`. Real product URLs usually _do_ carry
`www.`, so comparing a raw URL host against that list reports covered
merchants as uncovered. `fetchDomainCoverage` normalizes both sides for you:

```ts
const coverage = await client.fetchDomainCoverage();

const url = "https://www.macys.com/shop/product/some-dress";
if (coverage.isHostCovered(url)) {
  const product = await client.lookupProduct(url);
  console.log(product.product.title);
} else {
  // Not covered yet — this is what `startVoyage` is for.
  const { task, created } = await client.startVoyage(url);
  console.log(task.taskId, created ? "dispatched" : "joined an existing voyage");
}
```

The endpoint is `Cache-Control: max-age=300` behind a strong `ETag`, and clients
are expected to revalidate rather than refetch. Pass the previous snapshot back
and a `304` returns it untouched:

```ts
let coverage = await client.fetchDomainCoverage();
// …later…
coverage = await client.fetchDomainCoverage(coverage); // sends If-None-Match

console.log(coverage.hosts.length, "covered hosts");
console.log(coverage.catalogsFor("https://www.macys.com/x")); // ["macys"]
```

Use `listDomains({ ifNoneMatch })` directly if you manage the cache yourself; it
reports `notModified`, `etag`, and `maxAgeSeconds` and leaves the decision to
you.

## API

Every published `/v1` operation has a method. `tests/contract` fails the build
if that stops being true — see [Contract conformance](../../tests/contract/README.md).

- `getMe()` returns the calling organization, key id and provenance, quotas, and
  rate-limit posture. Read-only and side-effect free: safe on startup and in CI.
- `listDomains(options?)` and `fetchDomainCoverage(previous?)` return the covered
  hosts, with `ETag` revalidation and host normalization.
- `searchProducts(params)` searches all authorized catalogs by default, or one
  catalog when `catalog` is provided. The query field is `q`; results come back
  as `items` + `nextCursor`, each item carrying `productUrl`.
- `moreLikeThisProducts(params)` finds products similar to a source product URL
  or UUID, optionally within one catalog.
- `lookupProduct(url, options?)` resolves a product URL from the index or on
  demand. `matchMode`, `resolutionMode`, and `onDemandCachePolicy` are optional;
  the request field is `url`.
- `resolveProductFromHtml(params)` resolves a product from page HTML you already
  have — no index read, no outbound fetch.
- `refreshProducts(params)` schedules product URLs or UUIDs for refresh
  (`POST /v1/products/refresh`).
- `startVoyage(domain)`, `listVoyages(params?)`, and `getVoyage(taskId)` build a
  catalog for a merchant Octogen does not cover yet. Voyages are shared per
  domain: `StartVoyageResult.created` is `false` when you joined one already
  running, which consumes no quota.
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

// 202: the targets were accepted and a workflow was dispatched — not that the
// products have been re-crawled yet.
console.log(refresh.submitted, refresh.workflowStatus);
console.log(refresh.rejected.map((target) => target.code));
```

```ts
// Poll a voyage until its catalog is live. Voyages run for hours to days.
const { task } = await client.startVoyage("shop.example");
const progress = await client.getVoyage(task.taskId);
console.log(progress.phaseLabel, progress.progressPercent);
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
OCTOGEN_PLATFORM_API_KEY=... npm --prefix sdks/typescript run example:search-clothes
```

### Generated versus hand-written

`src/generated/types.ts` is emitted from the published contract by
`npm run codegen` (at the repository root) and committed, so a contract change
arrives as a reviewable diff. Response types come straight from it; request
bodies alias it where the generated shape works as an input and _derive_ from it
where it does not — a contract field with a default is `required` in the
generated type, so `ProgrammaticProductLookupRequestBody` relaxes those three
fields rather than forcing callers to send them.

Everything else — the method layer, the payload builders, the typed error
classes, `DomainCoverage` — is hand-written, because that ergonomics is the
reason to install an SDK instead of calling `fetch`.

`src/operations.ts` is the routing table. Its `path` is typed as `keyof paths`
from the generated contract, so naming a route the API does not publish is a
compile error, and `tests/contract` fails when a published operation has no
method here.
