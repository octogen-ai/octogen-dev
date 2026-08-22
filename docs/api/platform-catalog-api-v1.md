# Platform Catalog API v1 — Reference

The Octogen Platform Catalog API v1 is the server-to-server surface for
Catalog Partner organizations to search and look up products in every active
crawled catalog. It is the REST sibling of the
[Catalog Partner MCP server](../guides/catalog-partner-mcp.md); both enforce
the same catalog access policy — pick the surface that fits your runtime.

| Property         | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| Base URL         | `https://api.octogen.ai/v1`                               |
| Authentication   | Bearer Platform API key (`octo_live_...`)                 |
| Content type     | `application/json`                                        |
| OpenAPI contract | `https://cdn.octogen.ai/openapi/platform/v1/openapi.json` |

The OpenAPI document is the source of truth for complete schemas, enum values,
and generated-client setup. This page covers integration-level behavior and
examples.

## Authentication

Send your Platform API key as a Bearer token on every request:

```http
Authorization: Bearer octo_live_<32-hex-id>_<base64url-secret>
Content-Type: application/json
```

API keys are organization-scoped and currently usable only by Catalog Partner
organizations. Catalog-partner keys can search and browse every active crawled
catalog, including catalogs activated later, and can never access merchant
catalogs. Rotate keys via the partner portal; deactivating a key revokes it
immediately on the next request.

## Endpoints

The published contract carries **18 operations across 14 paths**. They use the
same access policy as the
[Catalog Partner MCP server](../guides/catalog-partner-mcp.md), so access
control is consistent across surfaces.

The three product endpoints below are documented in full here. The rest are
covered by the [published OpenAPI document](#openapi) and by a method in each
SDK — `getMe`, `listDomains`, `refreshProducts`, `resolveProductFromHtml`,
`startVoyage`, `listVoyages`, `getVoyage`, and the eight
[Coverage URL Lists](./coverage-url-lists-v1.md) operations:

| Operation                                      | What it is for                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `GET /domains`                                 | Every covered host. Check this before `lookup` — see the note below.  |
| `GET /me`                                      | Your organization, key id and provenance, quotas, rate-limit posture. |
| `POST /products/refresh`                       | Schedule indexed products for a re-crawl.                             |
| `POST /products/resolve-from-html`             | Resolve a product from HTML you already have. No index, no fetch.     |
| `POST /voyage`, `GET /voyage`, `GET /voyage/…` | Build a catalog for a merchant not covered yet.                       |

> **`GET /domains` returns hosts normalized by the server** — lowercased, with a
> leading `www.` stripped. It reports `macys.com` and never `www.macys.com`.
> Product URLs in the wild usually _do_ carry `www.`, so comparing a raw URL
> host against that list reports covered merchants as uncovered. Normalize your
> side the same way, or use the SDK helpers (`isHostCovered` /
> `is_host_covered`), which do it for you. The endpoint carries a strong `ETag`
> and `Cache-Control: max-age=300`: revalidate with `If-None-Match` rather than
> refetching.

### `POST /products/lookup` — lookup product by URL

Resolves a product page URL to a canonical product record within the catalogs
your key has access to.

```bash
curl -sS https://api.octogen.ai/v1/products/lookup \
  -H "Authorization: Bearer $OCTOGEN_PLATFORM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://warrenlotas.com/products/black-hoodie"}'
```

Request fields:

| Field | Type   | Notes                                                                                 |
| ----- | ------ | ------------------------------------------------------------------------------------- |
| `url` | string | Required. Any real product page URL — it does not need to be normalized or canonical. |

Response:

```json
{
  "catalogKey": "warrenlotas",
  "catalogDisplayName": "Warren Lotas",
  "sourceBaseUrl": "https://warrenlotas.com",
  "requestedUrl": "https://warrenlotas.com/products/black-hoodie",
  "normalizedUrl": "https://warrenlotas.com/products/black-hoodie",
  "canonicalUrl": null,
  "product": {
    "uuid": "prod_01HX...",
    "title": "Black Hoodie",
    "description": "Heavyweight cotton hoodie...",
    "productUrl": "https://warrenlotas.com/products/black-hoodie",
    "imageUrl": "https://cdn.example.com/black-hoodie.jpg",
    "primaryImage": {
      "url": "https://warrenlotas.com/cdn/shop/black-hoodie.jpg",
      "cdnUrl": "https://cdn.example.com/black-hoodie.jpg",
      "width": 1200,
      "height": 1600,
      "mimeType": "image/webp"
    },
    "images": [
      {
        "url": "https://warrenlotas.com/cdn/shop/black-hoodie.jpg",
        "cdnUrl": "https://cdn.example.com/black-hoodie.jpg",
        "width": 1200,
        "height": 1600,
        "mimeType": "image/webp"
      }
    ],
    "currentPrice": 180,
    "originalPrice": null,
    "inStock": true,
    "sizes": ["s", "m", "l", "xl"],
    "colors": [{ "label": "Black", "hexCode": "#000000" }],
    "tags": ["hoodie", "black"],
    "identifiers": { "productId": "WL-BH-001", "gtin": null, "productGroupId": null },
    "isActive": true,
    "updatedAt": "2026-05-19T18:04:10Z"
  }
}
```

The product view is fuller than a search hit and includes optional detail
fields such as `variants`, `categories`, `breadcrumbs`, `colors`, `reviews`,
`promotions`, `videos`, `identifiers`, and `enrichment` when the underlying
record has them.

Four URL fields describe how the result was reached, each with one meaning:

- `requestedUrl` — the URL you submitted, echoed back on every successful
  result.
- `normalizedUrl` — the matched product's URL as normalized by Octogen
  (HTTPS-forced, `www.`-stripped, tracking parameters removed, query sorted).
  Populated for indexed results. This is the stable URL: submit it on a
  follow-up lookup and it deterministically re-resolves the same product.
  Prefer storing it over the URL you originally submitted.
- `resolvedUrl` — the final URL after redirects. Populated for on-demand
  results; use it for on-demand follow-up lookups.
- `canonicalUrl` — the canonical URL the product page itself declares
  (JSON-LD `url`, `og:url`, or `link rel="canonical"`). Populated only for
  on-demand results; when the page declares none, the resolver currently
  falls back to the final fetched URL, so a non-null value is not proof of a
  declaration. `null` for indexed results.

### `POST /products/search` — search products

Searches products across all active crawled catalogs. To restrict
the search to one catalog, include `catalog`; everything else is optional.

```bash
curl -sS https://api.octogen.ai/v1/products/search \
  -H "Authorization: Bearer $OCTOGEN_PLATFORM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "black hoodie",
    "facets": [
      {"name": "color", "values": ["black"]},
      {"name": "category", "values": ["hoodies"]}
    ],
    "price_min": 50,
    "price_max": 300,
    "limit": 25
  }'
```

Request fields:

| Field               | Type    | Notes                                                                                                                 |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `catalog`           | string  | Optional. When omitted, searches all active crawled catalogs. When provided, it must name one active crawled catalog. |
| `q`                 | string  | Free-text keyword query. Omit to browse without filtering.                                                            |
| `facets`            | array   | Structured filters (brand, category, color, product attributes).                                                      |
| `price_min`         | number  | Inclusive minimum price.                                                                                              |
| `price_max`         | number  | Inclusive maximum price.                                                                                              |
| `cursor`            | string  | Opaque pagination cursor from a previous response's `nextCursor`.                                                     |
| `limit`             | integer | Page size, 1..100. Defaults to 50.                                                                                    |
| `text_search_query` | object  | Pre-generated semantic query. Prefer `q` unless an upstream workflow already produced this object.                    |

Response:

```json
{
  "items": [
    {
      "uuid": "prod_01HX...",
      "title": "Black Hoodie",
      "productUrl": "https://warrenlotas.com/products/black-hoodie",
      "imageUrl": "https://cdn.example.com/black-hoodie.jpg",
      "primaryImage": {
        "url": "https://warrenlotas.com/cdn/shop/black-hoodie.jpg",
        "cdnUrl": "https://cdn.example.com/black-hoodie.jpg"
      },
      "images": [
        {
          "url": "https://warrenlotas.com/cdn/shop/black-hoodie.jpg",
          "cdnUrl": "https://cdn.example.com/black-hoodie.jpg"
        }
      ],
      "currentPrice": 180,
      "originalPrice": null,
      "isActive": true,
      "updatedAt": "2026-05-19T18:04:10Z"
    }
  ],
  "nextCursor": "eyJzZWFyY2hBZnRlciI6Wy4uLl19"
}
```

When `nextCursor` is non-null, pass it as `cursor` on the next request — with
the same filters — to advance pagination. A null `nextCursor` means the page
is the last one.

#### Facets

Facet `name` values accept both base facet keys and product attribute keys.
Attribute facets may be sent either as the bare attribute key (e.g. `fit`) or
as a fully qualified key (e.g. `attribute_facets.fit`). Facet `values` should
be lowercase; phrase values may contain spaces.

### `POST /products/more-like-this` — find similar products

Finds products similar to a source product. The server resolves the source by
URL or UUID inside the API key's catalog grants, builds the similarity query
from indexed product enrichment, excludes the source product, and returns a
standard product list page.

```bash
curl -sS https://api.octogen.ai/v1/products/more-like-this \
  -H "Authorization: Bearer $OCTOGEN_PLATFORM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": {
      "url": "https://warrenlotas.com/products/black-hoodie"
    },
    "catalog": "warrenlotas",
    "price_preference": "any",
    "limit": 12
  }'
```

Request fields:

| Field              | Type    | Notes                                                                                                 |
| ------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| `source.url`       | string  | Canonical source product URL. Exactly one of `source.url` or `source.uuid` is required.               |
| `source.uuid`      | string  | Indexed source product UUID. Exactly one of `source.url` or `source.uuid` is required.                |
| `catalog`          | string  | Optional. If present, source resolution and search are limited to this active crawled catalog.        |
| `limit`            | integer | Page size from 1 to 100. Defaults to 12.                                                              |
| `cursor`           | string  | Opaque pagination cursor from the previous response.                                                  |
| `include_facets`   | array   | Additional include facets appended after server-generated audience facets.                            |
| `exclude_facets`   | array   | Facets to exclude from results.                                                                       |
| `price_preference` | string  | `lower`, `any`, or `higher` relative to the source product's current price. Defaults to `any`.        |
| `debug`            | boolean | Defaults to `false`. When `true`, includes the curated camelCase `effectiveQuery` used for retrieval. |

Response:

```json
{
  "source": {
    "catalogKey": "warrenlotas",
    "uuid": "prod_01HX...",
    "productUrl": "https://warrenlotas.com/products/black-hoodie",
    "title": "Black Hoodie"
  },
  "items": [
    {
      "uuid": "prod_01HY...",
      "catalogKey": "warrenlotas",
      "title": "Washed Black Hoodie",
      "productUrl": "https://warrenlotas.com/products/washed-black-hoodie",
      "imageUrl": "https://cdn.example.com/washed-black-hoodie.jpg",
      "currentPrice": 190,
      "isActive": true,
      "updatedAt": "2026-05-11T18:04:10Z"
    }
  ],
  "nextCursor": null
}
```

With `"debug": true`, the response adds `effectiveQuery` containing only the
server-derived fields intended for public inspection: `text`,
`retrievalEmbeddingColumns`, `rankingEmbeddingColumns`, `facets`,
`exclusionFacets`, `priceMin`, `priceMax`, and `limit`.

## Error model

The API returns JSON error bodies using a standard `detail` field.

| Status | Meaning                                                           | Example `detail`                                             |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `401`  | Missing, malformed, or invalid Bearer API key.                    | `"Authorization Bearer token required"`, `"Invalid API key"` |
| `403`  | API key is valid but the operation is forbidden for its org type. | `"api_key_forbidden"`, `"api_key_org_type_forbidden"`        |
| `404`  | Requested catalog or product is not visible for this API key.     | `"catalog_not_found"`, `"product_not_found"`                 |
| `422`  | Request body or field validation failed.                          | Validation error array with `loc`, `msg`, and `type`.        |

Example `422` body:

```json
{
  "detail": [
    {
      "loc": ["body", "limit"],
      "msg": "Input should be less than or equal to 100",
      "type": "less_than_equal",
      "input": 500,
      "ctx": { "le": 100 }
    }
  ]
}
```

How to react in client code:

- `401` is an auth/config problem — rotate or replace the API key.
- `403` and `404` are grant-scope failures — confirm the organization has
  access to the catalog.
- `422` is a client bug — surface the field-level message.
- Retry only transient network errors or documented `5xx` responses; the
  documented `4xx` responses require caller changes.

## Pagination

`search_products` returns up to `limit` items per page, plus an opaque
`nextCursor`. To paginate:

1. Issue a search with your filters, optionally setting `limit`.
2. If the response has a non-null `nextCursor`, issue the next request with
   the **same filters** and `cursor: <nextCursor>`.
3. Repeat until `nextCursor` is null.

Cursors are opaque — do not parse them. They encode the engine's
internal continuation state and may change shape over time. Pass them through
verbatim.

## OpenAPI

The generated contract is published during every platform deploy:

```text
https://cdn.octogen.ai/openapi/platform/v1/openapi.json
```

It includes:

- Server URLs and OpenAPI version.
- All 18 operation IDs, including `listDomains`, `getMe`, `searchProducts`,
  `moreLikeThisProducts`, `lookupProduct`, `refreshProducts`,
  `resolveProductFromHtml`, `startVoyage`, `listVoyages`, and `getVoyage`.
- Full request and response schemas for code generation.
- Example error bodies for auth, authorization, missing-catalog,
  missing-product, and validation failures.

Most language ecosystems can generate a typed client from this JSON
(e.g. `openapi-generator`, `openapi-typescript`, `oapi-codegen`). Both Octogen
SDKs in this repository generate their types from it and are held to it by
[contract conformance tests](../../tests/contract/README.md), so a published
operation cannot go missing from an SDK without CI failing.

## Choosing between REST and MCP

Both surfaces are equally supported and run against the same grants table.

|                 | REST (`/v1`, API keys)                 | MCP (OAuth)                                                               |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Best for        | Backends, batch jobs, server-to-server | Interactive agents (Claude Code, Codex, Claude Desktop)                   |
| Auth            | Bearer `octo_live_...` key             | OAuth 2.1 + PKCE → audience-bound Octogen access token                    |
| Caller identity | (api_key_id, org_id)                   | (user_sub, org_id, oauth_client_id)                                       |
| Token lifetime  | Until manually revoked                 | ~5 minutes access; refresh until session expiry                           |
| Revocation      | Revoke the API key                     | Sign out of the Octogen Platform or remove the user from the organization |

A grant change on one path takes effect immediately on the other.

## Next

- [Catalog Partner MCP — getting started](../guides/catalog-partner-mcp.md)
- [Coverage URL Lists API v1 — Reference](./coverage-url-lists-v1.md)
