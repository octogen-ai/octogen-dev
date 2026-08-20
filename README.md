# Octogen Developer Tools

Developer tools, SDKs, examples, tests, and agent skills for working with the Octogen AI commerce platform.

This repository is public-facing and is intended to become the canonical home for:

- Python SDKs for Octogen APIs
- TypeScript SDKs for Octogen APIs
- Shared fixtures and contract tests for SDK behavior
- Codex, Claude, and Cursor skills for building with Octogen
- Examples and integration guides for commerce workflows

## Repository Layout

```text
.
+-- docs/
|   +-- adr/                 # Architecture decision records
|   +-- api/                 # API notes, schemas, and generated reference docs
|   +-- guides/              # User-facing integration and workflow guides
+-- examples/
|   +-- python/              # Python SDK examples
|   +-- typescript/          # TypeScript SDK examples
+-- sdks/
|   +-- python/              # Python package source, packaging config, and unit tests
|   +-- typescript/          # TypeScript package source, package config, and unit tests
+-- skills/
|   +-- codex/               # Codex skills for Octogen workflows
|   +-- claude/              # Claude skills for Octogen workflows
|   +-- cursor/              # Cursor rules or skills for Octogen workflows
+-- tests/
|   +-- contract/            # Contract conformance: both SDKs vs the published /v1 document
|   +-- fixtures/            # Mocked payloads, and the committed OpenAPI snapshot
|   +-- integration/         # Live or sandbox integration tests
+-- tools/
|   +-- codegen/             # `npm run codegen` — committed types from the contract
+-- .github/workflows/       # CI
+-- .gitignore
+-- .prettierrc.json         # Repo-wide Prettier config
+-- eslint.config.mjs        # Repo-wide ESLint config
+-- LICENSE
+-- package.json             # npm workspace root
+-- prek.toml                # Local hooks
+-- README.md
+-- tsconfig.base.json       # Shared TypeScript compiler options
```

## SDK Strategy

Each SDK is independently buildable and releasable while sharing one API
contract:

- Keep language-specific package metadata inside its SDK directory.
- Add SDK-specific unit tests next to each SDK.
- Use shared fixtures and contract tests for cross-language behavior.
- Treat live integration tests as opt-in and require explicit environment
  variables.

Both SDKs read the API key from **`OCTOGEN_PLATFORM_API_KEY`** — the same
variable the Octogen agent-onboarding skill and CLI use. `OCTO_API_KEY` is a
deprecated fallback that warns once and will be removed.

### Generated versus hand-written

**Hybrid: the types are generated, the method layer is hand-written, and CI
enforces coverage.** This was an open question in this README; it is settled.

| Layer                    | Where                                                                               | Who writes it                                       |
| ------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| Request/response types   | `sdks/typescript/src/generated/`, `sdks/python/src/octogen_ai_sdk/generated/`       | `npm run codegen`, committed so a change is a diff  |
| Routing table            | `sdks/typescript/src/operations.ts`, `sdks/python/src/octogen_ai_sdk/operations.py` | Hand-written, one entry per published `operationId` |
| Method layer             | each SDK's `client.ts` / `client.py`                                                | Hand-written                                        |
| Coverage of the contract | [`tests/contract/`](tests/contract/README.md)                                       | CI — a red build names the owner                    |

Generated code is a poor home for the things these SDKs do well: the four-field
lookup URL contract, `extra="forbid"` request bodies, typed error classes, and
the host normalization that keeps a `www.` product URL from reading as
uncovered. `lookupProduct(url, options)` is also a better API than a generated
`lookupProductProductsLookupPost(body)`. What generation _is_ good for is
never getting a field name or a path wrong, so that is exactly what it does
here.

**Responses** are generated in both languages, always. **Requests** are where
the two split, for concrete reasons rather than taste:

- TypeScript aliases the generated request types where they are usable as
  inputs, and derives from them where they are not. A contract field with a
  default is `required` in the generated shape, so
  `ProgrammaticProductLookupRequestBody` is
  `Partial<…> & { url: string }` — a caller must be able to omit `matchMode` and
  let the server pick. Derived, not re-declared, so a field rename in the
  contract still breaks it.
- Python keeps request models hand-written. They carry rules the contract cannot
  express (`extra="forbid"` catches a misspelled key, but not "exactly one of
  `url` or `uuid`"), and the generator turns a length-constrained string into a
  root-model alias that would not accept a plain `str`.

Neither divergence weakens the drift guard: coverage of the contract is enforced
on the routing table, which is one hand-written table per language and identical
in both.

### Codegen

```bash
npm run codegen
```

Reads the committed snapshot at `tests/fixtures/openapi/platform-v1.json` — not
the network — and emits both languages' types. Reproducible offline, and both
generators are pinned exactly (`openapi-typescript` in `package-lock.json`,
`datamodel-code-generator` in `uv.lock`) so two machines produce byte-identical
output. The equivalent without npm:

```bash
uv run --project sdks/python --frozen python tools/codegen/generate.py
```

Refresh the snapshot from `cdn.octogen.ai` and regenerate in one step:

```bash
npm run codegen -- --fetch
```

`npm run codegen:check` fails when the committed output is stale; CI runs it.

Package names and release targets are finalized: `@octogen-ai/sdk` on npm and
`octogen-ai-sdk` on PyPI. Publishing is gated on a human owning the
`@octogen-ai` npm organization and configuring 2FA and OIDC trusted publishing.

## Development

### JavaScript and TypeScript

The repository is one **npm workspace**. `sdks/typescript` is a member, and so
is `cli` once it exists. There is a single root `package-lock.json`, a single
root `eslint.config.mjs`, a single root `.prettierrc.json`, and a shared
`tsconfig.base.json` that each package extends. Install once at the root and
every workspace resolves the same toolchain:

```bash
npm install
```

Root scripts run across every workspace:

| Command                           | What it does                                                     |
| --------------------------------- | ---------------------------------------------------------------- |
| `npm run lint`                    | ESLint over the whole repository, one config                     |
| `npm run format`                  | Prettier check over the whole repository                         |
| `npm run typecheck`               | `tsc --noEmit` in each workspace, plus the root contract tests   |
| `npm run test`                    | Each workspace's test suite, then the contract conformance tests |
| `npm run build`                   | Each workspace's build                                           |
| `npm run check`                   | All of the above, in that order — what CI runs                   |
| `npm run codegen`                 | Regenerate committed types from the contract snapshot            |
| `npm run codegen:check`           | Fail if the committed generated types are stale                  |
| `npm run test:contract`           | Contract conformance only (hermetic)                             |
| `npm run test:published-contract` | The snapshot vs what `cdn.octogen.ai` serves right now (network) |

To work on one package, scope the script:

```bash
npm run test --workspace sdks/typescript
```

### Python

`sdks/python` is deliberately **not** an npm workspace member. It stays a
standalone `uv` project:

```bash
uv run --project sdks/python pytest -c sdks/python/pyproject.toml sdks/python/tests
```

### Hooks and CI

Install the repo hooks with `prek`:

```bash
uv run --project sdks/python prek install
```

Run all hooks manually:

```bash
uv run --project sdks/python prek run --all-files
```

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the same commands on
every pull request, across Node 20/22 and Python 3.11/3.12. Hooks protect only
the machines they are installed on; CI is what protects `main`.

## Skills Strategy

Skills should be organized by agent runtime because each tool has different packaging and instruction formats. Shared Octogen concepts should be documented in `docs/guides/` and referenced from each skill rather than duplicated extensively.

Recommended skill topics:

- Authentication and environment setup
- Catalog, product, inventory, pricing, cart, checkout, order, and customer workflows
- API troubleshooting and common error handling
- SDK usage patterns and examples
- Safe handling of credentials, customer data, and production operations

## Testing Strategy

Three layers:

- **SDK unit tests** inside `sdks/python` and `sdks/typescript`.
- **Contract conformance** under [`tests/contract`](tests/contract/README.md):
  both SDKs' routing tables held to the published `/v1` document, in both
  directions, with no allowlist. A published operation with no SDK method fails
  the build, and so does an SDK method calling a path the contract does not
  define. This is the check that would have caught `POST /products/recrawl`
  shipping in both SDKs against a route that does not exist.
- **Optional live integration tests** under `tests/integration`.

Live tests never run by default in CI unless configured with explicit sandbox
credentials.

## Security

Do not commit API keys, access tokens, customer data, production payload exports, or private credentials. Use local `.env` files for development and commit only sanitized `.env.example` files.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
