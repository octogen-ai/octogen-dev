# Fixtures

Sanitized sample payloads, mocked responses, and commerce scenarios shared by
SDK tests.

## `openapi/platform-v1.json`

The complete normalized `/v1` OpenAPI contract. This snapshot currently prepares
OCT-4757 against the canonical Brand Search **server candidate**, not the deployed
CDN. [Provenance](openapi/platform-v1.provenance.json) records the exact server
base, [source patch](openapi/platform-v1.source.patch), generator command and
SHA-256 hashes. Apply the patch to the recorded base, run the checked-in server
snapshot test, then normalize with `json.dumps(sort_keys=True, indent=2,
ensure_ascii=False) + "\n"`, as the SDK generator does when fetching. The manifest
records both the original server bytes and the normalized SDK fixture hashes. Keep the candidate immutable while
reviewing its SDK diff; do not overwrite it with the older CDN document.

Publication remains gated on canonical server deployment, a fresh CDN snapshot
and the unchanged live-contract equality test. Package versions are intentionally
unchanged in this preparation slice.

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
