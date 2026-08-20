# Fixtures

Sanitized sample payloads, mocked responses, and commerce scenarios shared by
SDK tests.

## `openapi/platform-v1.json`

The published `/v1` OpenAPI contract, fetched verbatim from
`https://cdn.octogen.ai/openapi/platform/v1/openapi.json` and re-serialized with
sorted keys so a diff is readable.

It is the single input to two things:

- **Codegen.** `npm run codegen` emits `sdks/typescript/src/generated/types.ts`
  and `sdks/python/src/octogen_ai_sdk/generated/models.py` from this file, not
  from the network, so regeneration is reproducible offline and in CI.
- **Conformance.** Both runners in [`tests/contract`](../contract/README.md)
  hold each SDK's routing table to this file.

Refresh it — and the generated types with it — when the contract moves:

```bash
npm run codegen -- --fetch
```

`npm run test:published-contract` is what tells you it has moved.
