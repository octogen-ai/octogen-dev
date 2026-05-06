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
|   +-- contract/            # Shared API contract tests used by SDKs
|   +-- fixtures/            # Stable mocked API payloads and commerce scenarios
|   +-- integration/         # Live or sandbox integration tests
+-- .gitignore
+-- LICENSE
+-- README.md
```

## SDK Strategy

Each SDK should be independently buildable and releasable while sharing API expectations:

- Keep language-specific package metadata inside its SDK directory.
- Keep generated code, handwritten clients, and test helpers clearly separated.
- Add SDK-specific unit tests next to each SDK.
- Use shared fixtures and contract tests for cross-language behavior.
- Treat live integration tests as opt-in and require explicit environment variables.

Planned package names and release targets should be finalized before the first public SDK release.

The Python SDK is initialized in `sdks/python` as an async `uv` project using
`httpx` and Pydantic. Run its tests with:

```bash
cd sdks/python
uv run pytest
```

The TypeScript SDK is initialized in `sdks/typescript` as an ESM package using
the platform `fetch`, strict TypeScript, ESLint, Prettier, and Vitest. Run its
quality suite with:

```bash
npm --prefix sdks/typescript install
npm --prefix sdks/typescript run check
```

Install the repo hooks with `prek`:

```bash
uv run --project sdks/python prek install
```

Run all hooks manually:

```bash
uv run --project sdks/python prek run --all-files
```

## Skills Strategy

Skills should be organized by agent runtime because each tool has different packaging and instruction formats. Shared Octogen concepts should be documented in `docs/guides/` and referenced from each skill rather than duplicated extensively.

Recommended skill topics:

- Authentication and environment setup
- Catalog, product, inventory, pricing, cart, checkout, order, and customer workflows
- API troubleshooting and common error handling
- SDK usage patterns and examples
- Safe handling of credentials, customer data, and production operations

## Testing Strategy

The repository should support three layers of testing:

- SDK unit tests inside `sdks/python` and `sdks/typescript`
- Shared contract tests under `tests/contract`
- Optional live integration tests under `tests/integration`

Live tests should never run by default in CI unless configured with explicit sandbox credentials.

## Security

Do not commit API keys, access tokens, customer data, production payload exports, or private credentials. Use local `.env` files for development and commit only sanitized `.env.example` files.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
