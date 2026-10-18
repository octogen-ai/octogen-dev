# Platform Catalog API v1 — Reference

The Octogen Platform Catalog API v1 is the server-to-server surface for
Catalog Partner organizations to search and look up products in every active
crawled catalog. It is the REST sibling of the
[Catalog Partner MCP server](../guides/catalog-partner-mcp.md); both enforce
the same catalog access policy — pick the surface that fits your runtime.

| Property         | Value                                                         |
| ---------------- | ------------------------------------------------------------- |
| Base URL         | `https://api.storerouter.ai/v1`                               |
| Authentication   | Bearer Platform API key (`octo_live_...`)                     |
| Content type     | `application/json`                                            |
| OpenAPI contract | `https://cdn.storerouter.ai/openapi/platform/v1/openapi.json` |

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
SDK — `getMe`, `listDomains`, `resolveProductFromHtml`,
and the eight
[Coverage URL Lists](./coverage-url-lists-v1.md) operations:

| Operation                          | What it is for                                                        |
| ---------------------------------- | --------------------------------------------------------------------- |
| `GET /domains`                     | Every covered host. Check this before `lookup` — see the note below.  |
| `GET /me`                          | Your organization, key id and provenance, quotas, rate-limit posture. |
| `POST /products/resolve-from-html` | Resolve a product from HTML you already have. No index, no fetch.     |

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
curl -sS https://api.storerouter.ai/v1/products/lookup \
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

Searches indexed products by free text, filters, or both. Results span every
catalog your key can access unless `catalogs` narrows them. Each field controls
one thing, and a request that combines fields in a contradictory way is a `422`
rather than being resolved silently. Every field is optional.

```bash
curl -sS https://api.storerouter.ai/v1/products/search \
  -H "Authorization: Bearer $OCTOGEN_PLATFORM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "black hoodie",
    "catalogs": ["warrenlotas"],
    "facets": [{"name": "color", "values": ["black"]}],
    "price_min": 50,
    "price_max": 300,
    "limit": 25
  }'
```

Request fields:

| Field                                    | Type    | Notes                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`                                      | string  | Free text. Omit (or send blank) to browse by filters alone. Understood by default: rewritten for retrieval, with category, gender, colour, brand, price and attribute filters derived from it.                                                                                                                            |
| `understand`                             | boolean | Defaults to `true`. `false` matches `q` as written and filters only by what you send. Requires `q`.                                                                                                                                                                                                                       |
| `facets`                                 | array   | Filters a product must match: every facet, any value within a facet. Replaces any understood facet of the same name and is never relaxed. Each name at most once.                                                                                                                                                         |
| `exclude_facets`                         | array   | Filters a product must not match. Each name at most once.                                                                                                                                                                                                                                                                 |
| `omit_generated_facets`                  | array   | Names of understood facets to drop, for a derived filter that is wrong and that you have no value for. Use the names `effectiveQuery` reports. Requires understood `q`; a name may not also be in `facets`.                                                                                                               |
| `price_min`, `price_max`                 | number  | Inclusive, at least 0, min ≤ max. Combined with understood bounds by keeping the stricter one.                                                                                                                                                                                                                            |
| `brand_quality_min`, `brand_quality_max` | number  | Brand quality score bounds from 1 (very poor) to 6 (exceptional), min ≤ max. Combined with understood bounds by keeping the stricter one.                                                                                                                                                                                 |
| `similar_to_brands`                      | array   | 1 to 10 brand names whose style to favour. Ranks, does not filter. Replaces brands understood from `q`.                                                                                                                                                                                                                   |
| `fallback_category`                      | array   | 1 to 4 category names, root first, as the `category_path.depth_N` facets accept them, e.g. `["apparel & accessories", "clothing"]`; the path must exist in the taxonomy. Applied as `generated` category facets only when understanding finds no category and you send no `category_path` facet. Requires understood `q`. |
| `catalogs`                               | array   | 1 to 500 catalog keys. Omit to search everything your key can access; keys you cannot access match nothing.                                                                                                                                                                                                               |
| `limit`                                  | integer | 1 to 100. Defaults to 50.                                                                                                                                                                                                                                                                                                 |
| `cursor`                                 | string  | `nextCursor` from the previous page, sent with the same body. Later pages reuse page 1's understanding of `q`; a cursor sent with a different `q` is a `400`.                                                                                                                                                             |
| `relax`                                  | boolean | When an understood `q` returns nothing, drop understood filters in stages until a stage returns results. Facets you send are never dropped. Requires understood `q`.                                                                                                                                                      |
| `diversity`                              | boolean | Defaults to `false`. Spreads page 1 across retailers and drops repeated images. No effect with `catalogs`, a catalog-limited key, or a `brand_name` facet. Changing it mid-search is a `400`.                                                                                                                             |
| `debug`                                  | boolean | Reserved for diagnostic detail. `effectiveQuery` is returned without it.                                                                                                                                                                                                                                                  |

`catalog` and `text_search_query` were removed and are now a `422` whose
message names the replacement: send `catalogs: ["<key>"]` for
`catalog`, and `q` with `understand: false` (filters in `facets` and
`exclude_facets`) for `text_search_query`.

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
      "currency": "USD",
      "inStock": true,
      "colors": ["Black"],
      "sizes": ["S", "M", "L"],
      "gender": "unisex",
      "categoryPath": ["apparel & accessories", "clothing", "activewear"],
      "catalogDisplayName": "Warren Lotas",
      "isActive": true,
      "updatedAt": "2026-05-19T18:04:10Z"
    }
  ],
  "nextCursor": "eyJzZWFyY2hBZnRlciI6Wy4uLl19",
  "requestId": "3f2c0a52-5d8e-4a57-9a61-0c9f1f7b2d11",
  "effectiveQuery": {
    "text": "black hoodie",
    "understood": true,
    "facets": [
      { "name": "color", "values": ["black"], "source": "caller" },
      { "name": "product_type", "values": ["hoodie"], "source": "generated" }
    ],
    "excludeFacets": [],
    "priceMin": 50,
    "priceMax": 300,
    "catalogs": ["warrenlotas"]
  }
}
```

Each item's `currency`, `inStock`, `colors`, `sizes`, `gender` (`male`,
`female` or `unisex`), `categoryPath` (root first, in the names the
`category_path.depth_N` facets accept) and `catalogDisplayName` are null when
the product does not carry them. `inStock` and `colors` describe the product
family, not a particular variant.

When `nextCursor` is non-null, pass it as `cursor` on the next request — with
the same filters — to advance pagination. A null `nextCursor` means the page
is the last one. Query understanding runs once, on page 1; later pages reuse
it.

Every page includes `effectiveQuery`, the search that actually ran: `text` (the understood rewrite of `q`, `q` itself with `understand: false`,
or empty when browsing), `understood`, `facets` and `excludeFacets` (each
`{name, values, source}` with `source` `caller` or `generated`), `priceMin`,
`priceMax`, `brandQualityMin`, `brandQualityMax`, `similarToBrands`,
`catalogs`, and — with `relax: true` — `relaxation` (`rounds`,
`droppedFacets`, `declinedRounds`). It is a report, not a request fragment:
understood facets of one name can AND together, which a request cannot
express.

#### Facets

Facet names are the ones the coverage snapshot publishes as filterable, one
spelling each: `gender`, `age_groups`, `product_type`, `brand_name`,
`brand_slug`, `raw_brand_name`, `color`, `color_family`, `is_activewear`,
`category_path.depth_0` to `category_path.depth_6`, brand profile facets such
as `brand_origin_country`, and taxonomy attribute handles such as `fit`. The
attribute named `color` is `attribute_facets.color`; any other
`attribute_facets.` prefix and unknown names are a `422`. Values are canonical
lowercase handles and may contain spaces.

### `POST /products/more-like-this` — find similar products

Finds products similar to a source product. The server resolves the source by
URL or UUID inside the API key's catalog grants, builds the similarity query
from indexed product enrichment, excludes the source product, and returns a
standard product list page.

```bash
curl -sS https://api.storerouter.ai/v1/products/more-like-this \
  -H "Authorization: Bearer $OCTOGEN_PLATFORM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": {
      "url": "https://warrenlotas.com/products/black-hoodie"
    },
    "catalogs": ["warrenlotas"],
    "price_preference": "any",
    "limit": 12
  }'
```

Request fields:

| Field              | Type    | Notes                                                                                                 |
| ------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| `source.url`       | string  | Canonical source product URL. Exactly one of `source.url` or `source.uuid` is required.               |
| `source.uuid`      | string  | Indexed source product UUID. Exactly one of `source.url` or `source.uuid` is required.                |
| `catalogs`         | array   | Optional allowlist of 1–100 catalog keys. Restricts results only; the source may live outside it.     |
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
https://cdn.storerouter.ai/openapi/platform/v1/openapi.json
```

It includes:

- Server URLs and OpenAPI version.
- All 15 operation IDs, including `listDomains`, `getMe`, `searchProducts`,
  `moreLikeThisProducts`, `lookupProduct`,
  `resolveProductFromHtml`.
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
