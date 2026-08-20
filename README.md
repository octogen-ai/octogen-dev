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

Each SDK should be independently buildable and releasable while sharing API expectations:

- Keep language-specific package metadata inside its SDK directory.
- Keep generated code, handwritten clients, and test helpers clearly separated.
- Add SDK-specific unit tests next to each SDK.
- Use shared fixtures and contract tests for cross-language behavior.
- Treat live integration tests as opt-in and require explicit environment variables.

Planned package names and release targets should be finalized before the first public SDK release.

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

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run lint`      | ESLint over the whole repository, one config   |
| `npm run format`    | Prettier check over the whole repository       |
| `npm run typecheck` | `tsc --noEmit` in each workspace               |
| `npm run test`      | Each workspace's test suite                    |
| `npm run build`     | Each workspace's build                         |
| `npm run check`     | All of the above, in that order — what CI runs |

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

The repository should support three layers of testing:

- SDK unit tests inside `sdks/python` and `sdks/typescript`
- Shared contract tests under `tests/contract`
- Optional live integration tests under `tests/integration`

Live tests should never run by default in CI unless configured with explicit sandbox credentials.

## Security

Do not commit API keys, access tokens, customer data, production payload exports, or private credentials. Use local `.env` files for development and commit only sanitized `.env.example` files.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
