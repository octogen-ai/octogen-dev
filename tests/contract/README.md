# Contract Tests

Cross-language conformance between the SDKs and the published
[Platform Catalog API v1](https://cdn.octogen.ai/openapi/platform/v1/openapi.json)
contract.

| Path                             | What it is                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `openapi/platform-v1.json`       | The contract snapshot, written by `npm run codegen`. Committed so a contract change lands as a reviewable diff. |
| `allowlist.json`                 | Paths an SDK may call that the contract does not define. Only the unpublished `/brands/*` routes.               |
| `typescript/conformance.test.ts` | The suite for `@octogen-ai/sdk` (Vitest).                                                                       |
| `python/test_conformance.py`     | The suite for `octogen-ai-sdk` (pytest).                                                                        |

## What it asserts

Both suites make the same three assertions, one for each direction drift can
travel:

1. **Every published `operationId` has an SDK method.** There is no allowlist
   for this direction. A published operation the SDK cannot call is a caller
   reaching for raw `fetch`, which is the thing the SDK exists to prevent.
2. **Every SDK method calls the method and path the contract defines for it.**
   This one does not read the source: it _calls_ each method against a stub
   transport and observes the request line.
3. **Every request-issuing client method is registered for a check.** Without
   this, a new method calling a new path would simply not be looked at.

## Why it exists

Both SDKs shipped a `recrawlProducts` / `recrawl_products` that posted to
`POST /products/recrawl`, a route that has never existed — the live route is
`POST /products/refresh` — and it reached `main` of a public repository because
nothing checked. Assertion (2) fails on that in milliseconds. Assertion (1)
would have caught the five published operations neither SDK implemented,
including `listDomains`, the coverage check the shipped agent-onboarding
`SKILL.md` leads with.

## Running

```bash
npm run test:contract
uv run --project sdks/python pytest -c sdks/python/pyproject.toml tests/contract/python
```

Locally both read the committed snapshot, so they are deterministic and need no
network. In CI the `contract` job runs `npm run codegen` first, so the suites
run against what `/v1` publishes at that moment rather than what it published
when the branch was written — a newly published operation with no SDK method
turns CI red, which is the point.

## Adding an operation to the contract

1. `npm run codegen` — refreshes the snapshot and the generated types.
2. Add the hand-written method to both SDKs.
3. Register it in `INVOCATIONS` in both suites.

Steps 1 and 3 without step 2 fail, which is the intended order of discovery.
