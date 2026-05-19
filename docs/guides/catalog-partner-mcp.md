# Catalog Partner MCP — Getting Started

The Octogen Catalog Partner MCP server lets agents (Claude Code, Codex CLI,
Claude Desktop, and any other [Model Context Protocol](https://modelcontextprotocol.io/)
client) discover and query the product catalogs granted to your organization.
It is the interactive sibling of [Platform Catalog API v1](../api/platform-catalog-api-v1.md);
both share the same business logic and the same set of granted catalogs.

| Connection | What you should know |
| --- | --- |
| Base URL | `https://mcp.octogen.ai/mcp` |
| Transport | [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http) |
| Authentication | OAuth 2.1 with PKCE-S256 against `https://auth.octogen.ai` |
| Discovery | RFC 9728 protected-resource metadata at `https://mcp.octogen.ai/.well-known/oauth-protected-resource` |
| Client registration | RFC 7591 Dynamic Client Registration — your MCP client registers itself on first launch |

You do not need to provision API keys, client IDs, or shared secrets. Compliant
MCP clients walk the discovery chain automatically; on first use they open a
browser tab for sign-in and cache the resulting tokens locally.

## Prerequisites

Before your first tool call:

1. Your organization is provisioned as a Catalog Partner (`org_type=catalog_partner`)
   and your account has been granted at least one catalog. If you don't yet
   have a Catalog Partner organization, contact Octogen support.
2. You can sign in to the Octogen Platform with the email that belongs to the
   Catalog Partner organization. If you belong to multiple organizations,
   you'll be asked to pick which one to act as during sign-in.

## Choose your client

### Claude Code

```bash
claude mcp add --transport http octogen https://mcp.octogen.ai/mcp
```

The first tool call opens a browser tab for sign-in. Subsequent runs reuse
the cached token until your Octogen sign-in session expires. To share the
configuration with a team, add `--scope project` so the entry lands in a
committed `.mcp.json` at your repo root.

### Codex CLI

Add the server to `~/.codex/config.toml`:

```toml
[mcp_servers.octogen]
url = "https://mcp.octogen.ai/mcp"
```

Then sign in:

```bash
codex mcp login octogen
```

### Claude Desktop

Claude Desktop loads MCP servers over stdio, so use the open-source
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) adapter to bridge
stdio to streamable HTTP. Add this to your
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
the equivalent on other platforms:

```json
{
  "mcpServers": {
    "Octogen MCP": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.octogen.ai/mcp"]
    }
  }
}
```

Fully quit and reopen Claude Desktop. The adapter opens the same Octogen
sign-in flow on first connection.

### Other clients

Any client that implements MCP discovery (RFC 9728) + OAuth 2.1 + PKCE-S256
will work. Point it at `https://mcp.octogen.ai/mcp` and it should walk the
chain automatically.

## Sign-in

The first tool call triggers a browser hand-off:

1. Your client opens `https://auth.octogen.ai/oauth2/authorize?...` in a
   browser tab.
2. The Octogen Platform signs you in (email + password, SSO, magic link —
   whatever your organization is configured for).
3. If you belong to multiple organizations, you pick which one to act as.
4. You consent to the requested scopes.
5. The browser redirects to your client's local callback. The client exchanges
   the code for an access token and a refresh token, both cached locally.

The access token's lifetime is around 5 minutes; refresh happens transparently
as long as the refresh token is valid.

## What the tools do

Three tools are available. Each one maps to an endpoint in the
[Platform Catalog API v1 (REST)](../api/platform-catalog-api-v1.md), so the
arguments and result shapes are the same on either surface.

### `list_catalogs()`

Returns the list of catalogs granted to your organization. Start here when you
or your agent doesn't know what's available.

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

Pass the `catalog` value to `lookup_product` or `search_products`. An
organization with no active catalog grants gets an empty list — not an error.

### `lookup_product(canonical_url, catalogs?)`

Resolves a product URL to a canonical product record. Use when a user pastes a
specific product page URL and asks for canonical details.

```text
canonical_url   string  required  The product page URL to resolve.
catalogs        array   optional  Subset of catalog keys to search. Defaults
                                  to all granted catalogs.
```

Returns the matching product with title, description, prices, sizes, colors,
images, and identifiers. If no active product matches, the tool returns a
structured `product_not_found` error (HTTP 200 with an `error` field) — not
a transport-level failure — so your agent can recover.

### `search_products(catalog, query?, limit?, cursor?)`

Searches products inside a single granted catalog. Use when the URL isn't
known and the user wants products by name, attribute, or keyword.

```text
catalog   string   required  Catalog key (from list_catalogs). Single-catalog
                             by design — cross-catalog search is not supported.
query     string   optional  Free-text query. Omit to browse the catalog's
                             most relevant products without filtering.
limit     integer  optional  Page size, 1..100 (default 50). Out-of-range
                             values return an `invalid_limit` structured
                             error — there is no silent clamping.
cursor    string   optional  Opaque cursor from a previous response's
                             `nextCursor` field. Pass it verbatim to advance.
                             Malformed cursors silently restart at page 1.
```

Returns a page of items plus a `nextCursor` for pagination.

## Error model

The tools return two flavors of error.

**Transport-level errors** (HTTP 4xx) interrupt the call and propagate as
client-side exceptions. The most common are:

| Status | Meaning |
| --- | --- |
| 401 | Missing, expired, or wrong-audience token. Compliant clients restart the OAuth flow automatically using the `WWW-Authenticate` header. |
| 403 | Token is valid but the organization isn't allowed to use MCP (e.g. `org_type` is not `catalog_partner`). |
| 422 | Request body validation failed. |

**Tool-level errors** (HTTP 200 with an `error` field in the payload) are
returned as values so the calling agent can recover without a transport
failure. The codes you can see:

| Tool | `error` | Meaning |
| --- | --- | --- |
| `lookup_product` | `product_not_found` | No active product matched the URL in your granted catalogs. |
| `lookup_product` | `catalog_not_granted` | The `catalogs` argument listed only catalogs you don't have access to. |
| `search_products` | `catalog_not_granted` | The `catalog` argument is not in your active grants. |
| `search_products` | `invalid_limit` | `limit` was outside the 1..100 range. |

If an agent encounters one of these, the right move is usually to call
`list_catalogs` again and retry with valid inputs.

## Coexistence with API keys

If you also have a Platform Catalog API v1 key, both paths work concurrently
against the same grants table — no migration needed.

| | Platform Catalog API v1 (API keys) | MCP (OAuth) |
| --- | --- | --- |
| Use case | Backends, batch jobs, server-to-server | Interactive agents (Claude Code, Codex, Claude Desktop) |
| Auth | Bearer `octo_live_...` key | OAuth 2.1 + PKCE → audience-bound Octogen access token |
| Caller identity | (api_key_id, org_id) | (user_sub, org_id, oauth_client_id) |
| Token lifetime | Until manually revoked | ~5 minutes access; refresh until session expiry |
| Revocation | Revoke the API key | Sign out of the Octogen Platform or remove the user from the organization |

Both surfaces enforce the same per-org catalog grants. A grant revoked on
one path takes effect immediately on the other.

## Next

- [Platform Catalog API v1 — REST reference](../api/platform-catalog-api-v1.md)
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-06-18)
