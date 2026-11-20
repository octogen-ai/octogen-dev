# Fixtures

Sanitized sample payloads, mocked responses, and commerce scenarios shared by
SDK tests.

## `openapi/platform-v1.json`

The complete normalized `/v1` OpenAPI contract comes from the merged Platform
API source. [Provenance](openapi/platform-v1.provenance.json) records the server
commit, generator command, and hashes for the server and SDK snapshots.
To reproduce it, check out the server commit, run its snapshot test, then
normalize with `json.dumps(sort_keys=True, indent=2, ensure_ascii=False) + "\n"`.

This revision adds the full-selection option types and updates their references
on product summaries and details. SDK publication requires the deployed API and
published CDN contract to match this snapshot.

It is the single input to two things:

- **Codegen.** `npm run codegen` emits `sdks/typescript/src/generated/types.ts`
  and `sdks/python/src/octogen_ai_sdk/generated/models.py` from this file, not
  from the network, so regeneration is reproducible offline and in CI.
- **Conformance.** Both runners in [`tests/contract`](../contract/README.md)
  hold each SDK's routing table to this file.

After the canonical server is deployed, refresh the snapshot and generated types:

```bash
npm run codegen -- --fetch
```

`npm run test:published-contract` is what tells you it has moved.
