# Catalog Partner MCP — Getting Started

The Octogen Catalog Partner MCP server lets agents (Claude Code, Codex CLI,
Claude Desktop, and any other [Model Context Protocol](https://modelcontextprotocol.io/)
client) discover and query the product catalogs granted to your organization.
It is the interactive sibling of [Platform Catalog API v1](../api/platform-catalog-api-v1.md);
both share the same business logic and active crawled catalog policy. MCP
also exposes BigQuery listing/subscriber helpers for organizations with
BigQuery access.

| Connection          | What you should know                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL            | `https://mcp.octogen.ai/mcp` for most clients; `https://codex-mcp.octogen.ai/mcp` for Codex CLI                                                                                       |
| Transport           | [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http)                                                                          |
| Authentication      | OAuth 2.1 with PKCE-S256 against `https://auth.octogen.ai`                                                                                                                            |
| Discovery           | RFC 9728 protected-resource metadata at `https://mcp.octogen.ai/.well-known/oauth-protected-resource`; Codex uses `https://codex-mcp.octogen.ai/.well-known/oauth-protected-resource` |
| Client registration | RFC 7591 Dynamic Client Registration — your MCP client registers itself on first launch                                                                                               |

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
3. To use BigQuery subscription tools, your organization needs active
   `bigquery_listing` grants. Subscriber registration and status tools require
   your account to be an owner/admin member of the Catalog Partner organization.

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

Codex CLI should use Octogen's Codex compatibility endpoint:

```bash
codex mcp add octogen --url https://codex-mcp.octogen.ai/mcp
```

Or add the server manually to `~/.codex/config.toml`:

```toml
[mcp_servers.octogen]
url = "https://codex-mcp.octogen.ai/mcp"
```

Then sign in:

```bash
codex mcp login octogen
```

You can verify the configured URL with:

```bash
codex mcp get octogen
```

The compatibility endpoint is only for Codex. It advertises OAuth resource
indicator support and forwards the authorize/token requests to Octogen AuthKit
with the canonical MCP resource (`https://mcp.octogen.ai`) attached. The access
token still targets the canonical MCP audience; the separate hostname only
helps Codex complete OAuth discovery and token minting correctly.

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

1. Your client opens an Octogen OAuth authorize URL in a browser tab. Most
   clients open `https://auth.octogen.ai/oauth2/authorize?...`; Codex opens
   `https://codex-mcp.octogen.ai/oauth2/authorize?...`, which forwards to
   AuthKit after attaching the MCP resource indicator.
2. The Octogen Platform signs you in (email + password, SSO, magic link —
   whatever your organization is configured for).
3. If you belong to multiple organizations, you pick which one to act as.
4. You consent to the requested scopes.
5. The browser redirects to your client's local callback. The client exchanges
   the code for an access token and a refresh token, both cached locally.

The access token's lifetime is around 5 minutes; refresh happens transparently
as long as the refresh token is valid.

## What the tools do

The catalog read tools map to endpoints in the
[Platform Catalog API v1 (REST)](../api/platform-catalog-api-v1.md), so the
arguments and result shapes are the same on either surface. BigQuery tools are
OAuth-only and help an agent coordinate Analytics Hub subscription setup.

### `lookup_product(product_url, catalogs?)`

Resolves a product URL to a full product record. Use when a user pastes a
specific product page URL and asks for product details.

```text
product_url     string  required  The product page URL to resolve — any real
                                  product URL, not necessarily normalized or
                                  canonical.
catalogs        array   optional  Subset of catalog keys to search. Defaults
                                  to all active crawled catalogs.
```

Returns the matching product with title, description, prices, sizes, colors,
images, and identifiers. If no active product matches, the tool returns a
structured `product_not_found` error (HTTP 200 with an `error` field) — not
a transport-level failure — so your agent can recover.

### `search_products(catalog, query?, limit?, cursor?)`

Searches products inside a single active crawled catalog. Use when the URL isn't
known and the user wants products by name, attribute, or keyword.

```text
catalog   string   required  Known active crawled catalog key. Single-catalog
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

### `list_bigquery_listing_resources(catalogs?)`

Returns Analytics Hub listing resources for catalogs where your organization
has an active `bigquery_listing` grant. Use this before subscribing from a
customer GCP project.

```json
[
  {
    "catalogKey": "warrenlotas",
    "status": "active",
    "location": "us",
    "listingResource": "projects/octogen-prod/locations/us/dataExchanges/octogen/listings/warrenlotas",
    "linkedDatasetSuggestion": "octogen_warrenlotas",
    "sampleQuery": "SELECT * FROM `my_project.octogen_warrenlotas.products` LIMIT 10"
  }
]
```

Pass `catalogs` when you want to limit the response to specific granted
catalogs. If a requested catalog does not have a BigQuery listing grant, the
tool returns a structured `catalog_not_granted` error.

### `list_bigquery_subscribers()`

Lists registered subscriber projects/principals for your organization and the
per-catalog materialization status for each subscriber. Owner/admin membership
is required because the response includes customer GCP principals.

Important cell states:

| Status                  | Meaning                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `preparing`             | Octogen accepted the subscriber but has not finished granting Analytics Hub IAM. |
| `awaiting_subscription` | IAM is ready; run the customer-side BigQuery subscribe helper.                   |
| `active`                | Analytics Hub sees the linked dataset subscription.                              |
| `removing`              | The subscriber was disabled and teardown is in progress.                         |

### `register_bigquery_subscriber(request)`

Registers the customer GCP project and subscriber principal that should receive
Analytics Hub subscriber access. Owner/admin membership is required.

```json
{
  "subscriberProjectId": "my-gcp-project",
  "subscriberPrincipal": "user:data-team@example.com",
  "shareSchema": "exported_product_view",
  "schemaVersion": "v1"
}
```

`shareSchema` and `schemaVersion` are optional for the default product export
view. After registration, poll `list_bigquery_subscribers` until the target
cell is `awaiting_subscription`.

### `delete_bigquery_subscriber(subscriber_id)`

Disables a registered subscriber. Teardown is asynchronous; use
`list_bigquery_subscribers` to watch cells move through `removing`.

### `refresh_bigquery_subscription_status(catalog_key, subscriber_principal, share_schema?, schema_version?)`

After you run the customer-side subscribe helper, this tool asks Analytics Hub
whether the linked dataset subscription exists. It returns `active` once the
subscription is visible; otherwise retry after a short delay.

### BigQuery setup flow

1. Call `list_bigquery_listing_resources` and choose a `listingResource`.
2. Call `register_bigquery_subscriber` with the customer project and principal.
3. Poll `list_bigquery_subscribers` until the matching catalog cell is
   `awaiting_subscription`.
4. Run the customer-side helper from the Python SDK:

   ```bash
   pip install "octogen-ai-sdk[bigquery]"
   gcloud auth application-default login
   octogen-bq-subscribe --listing <listing-resource> --project <customer-project> --apply
   ```

5. Poll `refresh_bigquery_subscription_status` until the status is `active`.

### Cron automation

Customers who want to automatically pick up new listings can run the Python
SDK's `octogen-bq-autosubscribe` command on a schedule. The command performs
the MCP flow above in one idempotent pass:

1. Lists granted BigQuery listings.
2. Lists registered subscribers.
3. Registers the configured Reader if it is missing.
4. Subscribes every cell whose status is `awaiting_subscription`.
5. Refreshes Octogen status after each linked dataset is created.

Bootstrap cron credentials once from an interactive terminal:

```bash
octogen-mcp-login \
  --client-id-file /secure/octogen-mcp.client-id \
  --redirect-uri-file /secure/octogen-mcp.redirect-uri \
  --refresh-token-file /secure/octogen-mcp.refresh
```

The login command opens Octogen AuthKit in your browser, registers a public MCP
OAuth client if needed, requests an MCP-audience refresh token, and writes the
client id, registered redirect URI, and rotating refresh token to the requested
files. It does not print the refresh token.

Install the SDK with the BigQuery extra and authenticate to Google with
credentials that can create linked datasets in the destination project:

```bash
pip install "octogen-ai-sdk[bigquery]"
gcloud auth application-default login
```

Dry-run first:

```bash
OCTOGEN_MCP_CLIENT_ID_FILE=/secure/octogen-mcp.client-id \
OCTOGEN_MCP_REDIRECT_URI_FILE=/secure/octogen-mcp.redirect-uri \
OCTOGEN_MCP_REFRESH_TOKEN_FILE=/secure/octogen-mcp.refresh \
octogen-bq-autosubscribe \
  --project customer-project \
  --principal serviceAccount:bq-reader@customer-project.iam.gserviceaccount.com \
  --json
```

Then run with `--apply` from cron:

```cron
*/15 * * * * OCTOGEN_MCP_CLIENT_ID_FILE=/secure/octogen-mcp.client-id OCTOGEN_MCP_REDIRECT_URI_FILE=/secure/octogen-mcp.redirect-uri OCTOGEN_MCP_REFRESH_TOKEN_FILE=/secure/octogen-mcp.refresh octogen-bq-autosubscribe --project customer-project --principal serviceAccount:bq-reader@customer-project.iam.gserviceaccount.com --apply --json
```

`OCTOGEN_MCP_REFRESH_TOKEN_FILE` should contain an Octogen MCP OAuth refresh
token. If WorkOS rotates that refresh token during exchange, the command writes
the replacement back to the same file while holding a sibling `.lock` file, so
overlapping cron runs do not use and overwrite the same rotating token at once.
The autosubscribe command can also use `OCTOGEN_MCP_CLIENT_ID` instead of
`OCTOGEN_MCP_CLIENT_ID_FILE`, `OCTOGEN_MCP_TOKEN_COMMAND` for custom token
brokers, or `OCTOGEN_MCP_ACCESS_TOKEN` for short-lived manual runs.

## Error model

The tools return two flavors of error.

**Transport-level errors** (HTTP 4xx) interrupt the call and propagate as
client-side exceptions. The most common are:

| Status | Meaning                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | Missing, expired, or wrong-audience token. Compliant clients restart the OAuth flow automatically using the `WWW-Authenticate` header. |
| 403    | Token is valid but the organization isn't allowed to use MCP (e.g. `org_type` is not `catalog_partner`).                               |
| 422    | Request body validation failed.                                                                                                        |

**Tool-level errors** (HTTP 200 with an `error` field in the payload) are
returned as values so the calling agent can recover without a transport
failure. The codes you can see:

| Tool                      | `error`               | Meaning                                                                |
| ------------------------- | --------------------- | ---------------------------------------------------------------------- |
| `lookup_product`          | `product_not_found`   | No active product matched the URL in active crawled catalogs.          |
| `lookup_product`          | `catalog_not_granted` | The `catalogs` argument listed only catalogs you don't have access to. |
| `search_products`         | `catalog_not_granted` | The `catalog` argument is not in your active grants.                   |
| `search_products`         | `invalid_limit`       | `limit` was outside the 1..100 range.                                  |
| BigQuery tools            | `catalog_not_granted` | A requested catalog does not have an active `bigquery_listing` grant.  |
| BigQuery subscriber tools | `not_authorized`      | Your user is not an owner/admin member of the target organization.     |
| BigQuery tools            | `request_failed`      | The backing Analytics Hub or subscriber operation failed.              |

If an agent encounters one of these, retry with a known active crawled catalog
or call `list_bigquery_listing_resources` for the explicitly granted BigQuery
listing set.

## Coexistence with API keys

If you also have a Platform Catalog API v1 key, both paths work concurrently
against the same catalog access policy — no migration needed.

|                 | Platform Catalog API v1 (API keys)     | MCP (OAuth)                                                               |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Use case        | Backends, batch jobs, server-to-server | Interactive agents (Claude Code, Codex, Claude Desktop)                   |
| Auth            | Bearer `octo_live_...` key             | OAuth 2.1 + PKCE → audience-bound Octogen access token                    |
| Caller identity | (api_key_id, org_id)                   | (user_sub, org_id, oauth_client_id)                                       |
| Token lifetime  | Until manually revoked                 | ~5 minutes access; refresh until session expiry                           |
| Revocation      | Revoke the API key                     | Sign out of the Octogen Platform or remove the user from the organization |

Both surfaces give Catalog Partners search/browse access to all active crawled
catalogs and exclude merchant catalogs.

## Next

- [Platform Catalog API v1 — REST reference](../api/platform-catalog-api-v1.md)
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-06-18)
