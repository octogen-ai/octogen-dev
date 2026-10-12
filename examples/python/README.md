# Python Examples

Runnable examples for the Python SDK.

Run the clothes search example from the repository root:

```bash
OCTOGEN_PLATFORM_API_KEY=... uv run --project sdks/python python examples/python/search_clothes.py
```

Check coverage before looking products up — including the `www.` host
normalization that makes a naive coverage check report covered merchants as
uncovered:

```bash
OCTOGEN_PLATFORM_API_KEY=... uv run --project sdks/python python examples/python/check_coverage.py
```

Run the BigQuery autosubscribe cron tool in dry-run mode:

```bash
uv run --project sdks/python octogen-mcp-login \
  --authkit-domain https://auth.storerouter.ai \
  --resource https://mcp.storerouter.ai \
  --client-id-file /secure/octogen-mcp.client-id \
  --refresh-token-file /secure/octogen-mcp.refresh

OCTOGEN_MCP_CLIENT_ID_FILE=/secure/octogen-mcp.client-id \
OCTOGEN_MCP_REFRESH_TOKEN_FILE=/secure/octogen-mcp.refresh \
uv run --project sdks/python --extra bigquery \
  octogen-bq-autosubscribe \
  --mcp-url https://mcp.storerouter.ai/mcp/ \
  --mcp-token-endpoint https://auth.storerouter.ai/oauth2/token \
  --project my-gcp-project \
  --principal serviceAccount:bq-reader@my-gcp-project.iam.gserviceaccount.com \
  --json
```
