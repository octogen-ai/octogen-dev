# Python Examples

Runnable examples for the Python SDK.

Run the clothes search example from the repository root:

```bash
OCTO_API_KEY=... uv run --project sdks/python python examples/python/search_clothes.py
```

Run the BigQuery autosubscribe cron tool in dry-run mode:

```bash
OCTOGEN_MCP_CLIENT_ID=client_... \
OCTOGEN_MCP_REFRESH_TOKEN_FILE=/secure/octogen-mcp.refresh \
uv run --project sdks/python --extra bigquery \
  octogen-bq-autosubscribe \
  --project my-gcp-project \
  --principal serviceAccount:bq-reader@my-gcp-project.iam.gserviceaccount.com \
  --json
```
