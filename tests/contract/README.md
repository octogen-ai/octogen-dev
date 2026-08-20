# Contract conformance

One question, asked of both SDKs against one document: **does the SDK's routing
table match the published `/v1` contract, exactly?**

The document is the committed snapshot at
[`tests/fixtures/openapi/platform-v1.json`](../fixtures/openapi/platform-v1.json).
Each SDK declares its routing table in one place — `operations.ts` /
`operations.py` — and every client method routes through it, so a method cannot
reach a path the table does not name.

| File                         | Runs                                                                   |
| ---------------------------- | ---------------------------------------------------------------------- |
| `contract.ts`                | Shared helpers: read the snapshot, fetch the live contract, flatten it |
| `operation-coverage.test.ts` | The TypeScript table vs the snapshot — hermetic, gates every job       |
| `test_operation_coverage.py` | The Python table vs the snapshot — hermetic, gates every job           |
| `published-contract.test.ts` | The snapshot vs what the CDN is serving — the drift alarm, network     |

## The rules

Both hermetic runners assert the same three things, and **there is no
allowlist**:

1. **Every published `operationId` has an SDK method.** A published operation
   with no method is an operation callers cannot reach through the SDK.
2. **No SDK method names an operation the contract does not publish.** Brands
   were deferred from CLI v1 on 2026-08-20, so there is no unpublished surface
   left for a method to legitimately call.
3. **Verbs and paths agree.** Same `operationId`, same method, same path
   template.

Together those pin each routing table to _exactly_ the published operation set,
which holds the two SDKs to each other transitively — neither test has to read
the other language's source.

### Why this exists

Both SDKs shipped `POST /products/recrawl` in `main` of a public repository. The
live route is `POST /products/refresh`; `products/recrawl` appears nowhere in
the API. Every caller of that method got a 404. Neither SDK implemented
`listDomains`, which is the coverage check the agent-onboarding skill leads with
and the single most consequential call an agent makes.

Run the tests against the pre-fix SDK and both failures are named, in both
languages:

```text
published operations with no SDK method:
  getMe (GET /me)
  getVoyage (GET /voyage/{task_id})
  listDomains (GET /domains)
  listVoyages (GET /voyage)
  refreshProducts (POST /products/refresh)
  resolveProductFromHtml (POST /products/resolve-from-html)
  startVoyage (POST /voyage)

SDK methods naming an operation the contract does not publish:
  recrawlProducts (POST /products/recrawl)
```

The TypeScript table has a second, earlier guard: `path` is typed as
`keyof paths` from the generated contract, so the bogus route does not even
compile.

```text
sdks/typescript/src/operations.ts(38,38): error TS2322:
  Type '"/products/recrawl"' is not assignable to type 'keyof paths'.
```

## Running them

```bash
npm run test:contract
```

```bash
uv run --project sdks/python pytest -c sdks/python/pyproject.toml tests/contract
```

The network-dependent drift alarm is separate on purpose — a red build should
say whether the SDK drifted from the contract or the contract moved:

```bash
npm run test:published-contract
```

It **skips** when `cdn.octogen.ai` is unreachable, because a CDN blip is not an
SDK defect. Set `OCTOGEN_REQUIRE_PUBLISHED_CONTRACT=1` to make unreachable a
failure. When the published contract has genuinely moved, refresh the snapshot,
add the SDK methods for anything new, and commit:

```bash
npm run codegen -- --fetch
```
