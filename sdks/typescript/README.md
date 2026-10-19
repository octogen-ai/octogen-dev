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

const client = new OctogenClient({ baseUrl: "https://api.storerouter.ai/v1" });
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

### Product lookup

Look up a product URL directly. A missing product does not prove that its whole
merchant domain is unsupported. Use `getMe` (Python: `get_me`) to check credentials.

## API

Every published `/v1` operation has a method. `tests/contract` fails the build
if that stops being true — see [Contract conformance](../../tests/contract/README.md).

- `getMe()` returns the calling organization, key id and provenance, quotas, and
  rate-limit posture. Read-only and side-effect free: safe on startup and in CI.
- `getDomain(urlOrHost)` returns one store's coverage snapshot
  (`GET /v1/domains/{host}`): every catalog serving the host, with product
  counts, populated facets and a price histogram. A URL is normalized to its
  host first. An uncovered host throws `OctogenNotFoundError` with
  `detail` `domain_not_covered`. There is no list of covered hosts.

- `searchProducts(params)` searches every active catalog by default, or only
  the catalogs in `catalogs` (1–500 keys) when it is provided. The query field
  is `q`, understood by default; `understand`, `facets`, `excludeFacets`, the
  price and brand-quality bounds, `relax`, and `debug` refine it (see below).
  Results come back as `items` + `nextCursor`, each item carrying `productUrl`,
  plus `effectiveQuery`, the search that ran.
- `moreLikeThisProducts(params)` finds products similar to a source product URL
  or UUID, optionally restricted to `catalogs` (1–100 keys). `facets`,
  `excludeFacets` and the price and brand-quality bounds work as on search.
  `relax` defaults to `true` on the server: a short page 1 is retried with
  Platform's generated facets dropped, never yours, and reported in
  `effectiveQuery.relaxation` with `debug: true`. `facets` replaced `includeFacets` in 0.6.0.
- `lookupProduct(url, options?)` resolves a product URL from the index or on
  demand. `matchMode`, `resolutionMode`, and `onDemandCachePolicy` are optional;
  the request field is `url`.
- `resolveProductFromHtml(params)` resolves a product from page HTML you already
  have — no index read, no outbound fetch.
- `listTaxonomyCategories(params?)`, `listTaxonomyAttributes(category, params?)`
  and `listTaxonomyAttributeValues(handle, params?)` discover categories, their
  attributes and the attributes' value handles, paged with `offset`/`limit`.
  A category's `facets` and an attribute's `facetName` plus value `handle` go
  back into `searchProducts` unchanged.
- `countProductFacets(params?)` counts the products `searchProducts` would
  filter to — by `categories`, `attributes` and `facetNames` — under the same
  `q`, facets, bounds and `catalogs`.

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
const urlList = await client.createCoverageUrlList("q3-campaign");
const result = await client.addCoverageUrlListUrls(urlList.urlListId, [
  "https://warrenlotas.com/products/black-hoodie",
]);

console.log(
  result.urlCount,
  result.rejected.map((r) => r.code),
);
```

### Search controls

Each `searchProducts` field controls one thing. `q` says what to find and is
understood by default — rewritten for retrieval, with category, colour, brand,
price, and attribute filters derived from it. `facets`, `excludeFacets`, and the
bounds say what to keep; `catalogs` says where to look.

```ts
const page = await client.searchProducts({
  q: "black hoodie",
  catalogs: ["warrenlotas"], // omit to search every catalog your key can access
  facets: [{ name: "color", values: ["black"] }],
  excludeFacets: [{ name: "brand_name", values: ["acme"] }],
  priceMin: 50,
  priceMax: 300,
  brandQualityMin: 4, // 1 (very poor) to 6 (exceptional)
  similarToBrands: ["Warren Lotas"], // ranks, does not filter
  relax: true, // drop understood filters in stages if nothing matches
  debug: true,
});

for (const facet of page.effectiveQuery?.facets ?? []) {
  console.log(facet.name, facet.values, facet.source); // "caller" | "generated"
}
```

- `understand: false` matches `q` as written and filters only by what you send.
- `omitGeneratedFacets: ["fit"]` drops an understood facet that is wrong when
  you have no value of your own for it; to replace one, send a facet of that
  name instead. Use the names `effectiveQuery` reports.
- `debug: true` adds `effectiveQuery`, the search that actually ran.

Contradictions the API would refuse — `relax` or `understand: false` without a
`q`, a facet name sent twice, `priceMin` above `priceMax` — throw a `TypeError`
before any request.

**Removed in 0.5.0** (the API now answers them with `422`): `catalog` → use
`catalogs: [key]`; `textSearchQuery` → use `q` with `understand: false` and your
filters in `facets` and `excludeFacets`. See the
[CHANGELOG](./CHANGELOG.md#050--2026-10-14) for the migration.

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
classes — is hand-written, because that ergonomics is the
reason to install an SDK instead of calling `fetch`.

`src/operations.ts` is the routing table. Its `path` is typed as `keyof paths`
from the generated contract, so naming a route the API does not publish is a
compile error, and `tests/contract` fails when a published operation has no
method here.
