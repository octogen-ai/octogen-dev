# Platform Catalog API v1 — Reference

The Octogen Platform Catalog API v1 is the server-to-server surface for
Catalog Partner organizations to search and look up products in the catalogs
granted to them. It is the REST sibling of the
[Catalog Partner MCP server](../guides/catalog-partner-mcp.md); both enforce
the same per-org catalog grants — pick the surface that fits your runtime.

| Property | Value |
| --- | --- |
| Base URL | `https://api.octogen.ai/v1` |
| Authentication | Bearer Platform API key (`octo_live_...`) |
| Content type | `application/json` |
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
organizations. A key can only access catalogs granted to the organization that
owns it. Rotate keys via the partner portal; deactivating a key revokes it
immediately on the next request.

## Endpoints

Three endpoints are available. They use the same catalog grants as the
[Catalog Partner MCP server](../guides/catalog-partner-mcp.md), so access
control is consistent across surfaces.

### `GET /catalogs` — list catalogs

Returns the active catalogs granted to your organization.

```bash
curl -sS https://api.octogen.ai/v1/catalogs \
  -H "Authorization: Bearer $OCTOGEN_PLATFORM_API_KEY"
```

Response:

```json
[
  {
    "catalog": "warrenlotas",
    "displayName": "Warren Lotas",
    "sourceBaseUrl": "https://warrenlotas.com",
    "productCount": 1248,
    "lastIndexedAt": "2026-05-19T18:04:10Z"
  }
]
```

Pass a `catalog` value to `/products/search` when you want to restrict search
to one catalog. Omit it to search all catalogs granted to your key. An
organization with no active catalog grants gets an empty list — not an error.

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

| Field | Type | Notes |
| --- | --- | --- |
| `url` | string | Required. Canonical product page URL. |

Response:

```json
{
  "catalogKey": "warrenlotas",
  "catalogDisplayName": "Warren Lotas",
  "sourceBaseUrl": "https://warrenlotas.com",
  "product": {
    "uuid": "prod_01HX...",
    "title": "Black Hoodie",
    "description": "Heavyweight cotton hoodie...",
    "productUrl": "https://warrenlotas.com/products/black-hoodie",
    "imageUrl": "https://cdn.example.com/black-hoodie.jpg",
    "images": ["https://cdn.example.com/black-hoodie.jpg"],
    "currentPrice": 180,
    "originalPrice": null,
    "inStock": true,
    "sizes": ["s", "m", "l", "xl"],
    "colors": [{"label": "Black", "hexCode": "#000000"}],
    "tags": ["hoodie", "black"],
    "identifiers": {"productId": "WL-BH-001", "gtin": null, "productGroupId": null},
    "isActive": true,
    "updatedAt": "2026-05-19T18:04:10Z"
  }
}
```

The product view is fuller than a search hit and includes optional detail
fields such as `variants`, `categories`, `breadcrumbs`, `colors`, `reviews`,
`promotions`, `videos`, `identifiers`, and `enrichment` when the underlying
record has them.

### `POST /products/search` — search products

Searches products across all catalogs granted to your API key. To restrict
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

| Field | Type | Notes |
| --- | --- | --- |
| `catalog` | string | Optional. When omitted, searches all catalogs granted to your key. When provided, must be one granted catalog. |
| `q` | string | Free-text keyword query. Omit to browse without filtering. |
| `facets` | array | Structured filters (brand, category, color, product attributes). |
| `price_min` | number | Inclusive minimum price. |
| `price_max` | number | Inclusive maximum price. |
| `cursor` | string | Opaque pagination cursor from a previous response's `nextCursor`. |
| `limit` | integer | Page size, 1..100. Defaults to 50. |
| `text_search_query` | object | Pre-generated semantic query. Prefer `q` unless an upstream workflow already produced this object. |

Response:

```json
{
  "items": [
    {
      "uuid": "prod_01HX...",
      "title": "Black Hoodie",
      "productUrl": "https://warrenlotas.com/products/black-hoodie",
      "imageUrl": "https://cdn.example.com/black-hoodie.jpg",
      "images": ["https://cdn.example.com/black-hoodie.jpg"],
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

## Error model

The API returns JSON error bodies using a standard `detail` field.

| Status | Meaning | Example `detail` |
| --- | --- | --- |
| `401` | Missing, malformed, or invalid Bearer API key. | `"Authorization Bearer token required"`, `"Invalid API key"` |
| `403` | API key is valid but not allowed to access this resource. | `"api_key_forbidden"`, `"api_key_org_type_forbidden"` |
| `404` | Requested catalog or product is not visible for this API key. | `"catalog_not_found"`, `"product_not_found"` |
| `422` | Request body or field validation failed. | Validation error array with `loc`, `msg`, and `type`. |

Example `422` body:

```json
{
  "detail": [
    {
      "loc": ["body", "limit"],
      "msg": "Input should be less than or equal to 100",
      "type": "less_than_equal",
      "input": 500,
      "ctx": {"le": 100}
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
- Operation IDs: `listCatalogs`, `searchProducts`, `lookupProduct`.
- Full request and response schemas for code generation.
- Example error bodies for auth, authorization, missing-catalog,
  missing-product, and validation failures.

Most language ecosystems can generate a typed client from this JSON
(e.g. `openapi-generator`, `openapi-typescript`, `oapi-codegen`).

## Choosing between REST and MCP

Both surfaces are equally supported and run against the same grants table.

| | REST (`/v1`, API keys) | MCP (OAuth) |
| --- | --- | --- |
| Best for | Backends, batch jobs, server-to-server | Interactive agents (Claude Code, Codex, Claude Desktop) |
| Auth | Bearer `octo_live_...` key | OAuth 2.1 + PKCE → audience-bound Octogen access token |
| Caller identity | (api_key_id, org_id) | (user_sub, org_id, oauth_client_id) |
| Token lifetime | Until manually revoked | ~5 minutes access; refresh until session expiry |
| Revocation | Revoke the API key | Sign out of the Octogen Platform or remove the user from the organization |

A grant change on one path takes effect immediately on the other.

## Next

- [Catalog Partner MCP — getting started](../guides/catalog-partner-mcp.md)
