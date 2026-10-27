# StoreRouter MCP server listing

[`server.json`](server.json) describes the hosted StoreRouter MCP server for
the [Official MCP Registry](https://registry.modelcontextprotocol.io), where it
is published as `ai.storerouter/mcp`. MCP clients and directories that read the
registry pick it up from there.

The server is remote only: Streamable HTTP at `https://mcp.storerouter.ai/mcp`,
with OAuth 2.1 (PKCE and Dynamic Client Registration) discovered from
`https://mcp.storerouter.ai/.well-known/oauth-protected-resource`. There is no
package to install and no API key to configure, so `server.json` lists one
`remotes` entry and no `headers`. Setup guides for each client are in the
[MCP docs](https://storerouter.ai/docs/mcp/overview).

## Publishing a new version

The `ai.storerouter` namespace is proven with a DNS TXT record on the
`storerouter.ai` apex (`v=MCPv1; k=ed25519; p=<public key>`). Publishing needs
the matching Ed25519 private key.

1. Install [`mcp-publisher`](https://github.com/modelcontextprotocol/registry/releases).
2. Bump `version` in `server.json`. The registry rejects a version it has
   already published.
3. Validate, log in, and publish from this directory:

   ```bash
   mcp-publisher validate server.json
   mcp-publisher login dns --domain storerouter.ai --private-key "$MCP_REGISTRY_PRIVATE_KEY"
   mcp-publisher publish server.json
   ```

4. Confirm the listing:

   ```bash
   curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=ai.storerouter/mcp"
   ```
