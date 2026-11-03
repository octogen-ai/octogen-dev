# Fixtures

Sanitized sample payloads, mocked responses, and commerce scenarios shared by
SDK tests.

## `openapi/platform-v1.json`

The complete normalized `/v1` OpenAPI contract. This snapshot comes from the
merged canonical Brand Search server source at
`c14f7859c91589e06eb47e22c54e4e1076a87f8e`; it does not claim deployed CDN parity.
[Provenance](openapi/platform-v1.provenance.json) records the exact server commit,
generator command and SHA-256 hashes. Check out that server commit, run its
checked-in snapshot test, then normalize with
`json.dumps(sort_keys=True, indent=2, ensure_ascii=False) + "\n"`, as the SDK
generator does when fetching. The manifest records both the original server bytes
and normalized SDK fixture hashes. No source patch is needed for the merged
commit. The previous candidate's provenance and patch remain in git at the
recorded SDK commit.

Compared with the reviewed candidate, the merged document changes only the API
description and the More Like This endpoint description. No schema changes were
introduced. Do not overwrite this fixture with an older CDN document.

Publication remains gated on canonical server deployment, a fresh complete CDN
comparison and the unchanged live-contract equality test. The package manifests
prepare Python 0.15.0, TypeScript 0.13.0 and CLI 0.5.0; preparation is not publication.

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
