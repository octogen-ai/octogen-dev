# Octogen

Find, compare, and recommend products through Octogen product search and URL
lookup. This Agent Plugins 1.0 package connects to the existing Octogen service.

## Build the package

From the repository root, run:

```bash
python3 tools/plugins/package.py
```

The command checks the manifest, MCP endpoint, skill metadata, and referenced
logo, then creates `dist/octogen-plugin-0.1.0.zip`. It needs only Python 3.11 or
newer and makes no network calls. The ZIP contains one `octogen/` directory.
Generated ZIPs stay out of Git; CI makes the package available as an artifact.

Bump `plugin.json`'s version when releasing a changed package. Plugin versions
are independent of SDK and CLI versions. This initial PR does not automatically
publish plugins or create GitHub releases.

## Connection

- MCP endpoint: `https://mcp.octogen.ai/mcp`
- Transport: Streamable HTTP
- Authentication: Octogen OAuth, discovered by the host from the endpoint
- OAuth issuer: `https://auth.octogen.ai`

Import the ZIP through Plugin Creator or a host that supports Agent Plugins 1.0,
then use its Octogen Connect flow to sign in. For ChatGPT, private MCP plugins
must be enabled by the workspace administrator. An upload permission error is
separate from Octogen authentication and cannot be fixed by changing the URL.

No credentials are included in this package. Each user authenticates with their
own account. An internal super-admin may need to specify an organization ID.
See the [MCP guide](https://github.com/octogen-ai/octogen-dev/blob/main/docs/guides/catalog-partner-mcp.md)
for Octogen sign-in prerequisites.

## Examples

- Find a compact oak dining table for a small apartment.
- Look up this product URL and explain the available sizes and materials.
- Find alternatives to this product and explain how they compare.

The product-discovery skill uses `search_products` and `lookup_product`. The
server can expose additional BigQuery management tools; the skill does not
filter the server's tool list or change server-side permissions.

## Package contents

- `plugin.json`: presentation and portable plugin metadata
- `mcp.json`: the canonical Octogen connection
- `skills/product-discovery/SKILL.md`: product discovery workflow
- `assets/octogen-mark.png`: the supplied compressed transparent logo

## Validation and live checks

The packaging command checks the local package and reads back the generated ZIP.
It does not authenticate to Octogen. The product workflow follows the tool
schemas in the Octogen server source; host-discovered schemas are authoritative
when connecting. The supplied transparent logo is 512 by 512 pixels and 6,959
bytes.

After connecting, verify a product search and a lookup of a known product page
URL. Check that product links and images are preserved, missing price/stock data
is not invented, and returned errors are explained. Live discovery and these
end-to-end checks require the user's Octogen sign-in; packaging success does not
prove they passed. Importing the plugin does not change the Octogen server.
