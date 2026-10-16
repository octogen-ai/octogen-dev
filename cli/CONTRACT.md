# Public contract and CLI delivery

The public API source is `octogen.platform.main:programmatic_app` in the API
monorepo. Its normalized snapshot is covered by
`apps/octogen-platform/tests/test_programmatic_openapi_snapshot.py`.
`prod/k8s/platform-api/deploy.sh` publishes it to
`https://cdn.storerouter.ai/openapi/platform/v1/openapi.json`. The full/admin
`merchant_app` schema is published separately to private storage. Never generate
customer commands from the full/admin schema.

In this repository, `npm run codegen -- --fetch` refreshes
`tests/fixtures/openapi/platform-v1.json`. Review that diff before committing.
`npm run codegen` regenerates both SDK type mirrors, the CLI runtime projection,
and [the complete help reference](REFERENCE.md). The projection records the API
version and SHA-256 of canonical snapshot JSON. An API version alone does not
identify the contract: field constraints can change without a version bump.

## What is generated

`cli/src/generated/contract.ts` contains public operation IDs, methods, paths,
resolved request body schemas and path/query parameters, including nested
properties, requiredness, enums, numeric/string/array bounds, defaults and help
text. CLI flags and request validation use this projection at runtime. Unknown
schema validation keywords fail generation until the validator supports them.
SDK types continue through the existing TypeScript/Python generation chain;
the SDK method and operation registry remain hand-written and checked against
the public contract.

`cli/src/fields.ts` is presentation metadata: flag and positional spellings,
repeatability, placeholders, facet/custom/singleton codecs, SDK camel-case
parameter names, and explicit field exclusions. Operation exclusions remain in
`cli/src/registry.ts`. Every operation is mapped or excluded; every field of a
mapped operation is bound or excluded, including query/path parameters. An
operation exclusion covers its request fields because no first-class command
issues that operation. Exclusions must have substantive reasons and cannot
name removed operations or fields. The generic `api` command remains low-level.

Custom handlers retain positional semantics, domain normalization and ETag
caching, HTML file/stdin reading with a byte cap, source URL/UUID selection,
facet merging, cross-field constraints, output formatting, and workflow polling.
`cli/src/contract.ts` performs no IO; a future browser runtime can reuse it.
Transport remains entirely through SDK methods. There is no new HTTP client.

Exposed-field defaults are passed to the SDK explicitly. Excluded fields stay
omitted by the CLI (the SDK may supply its existing defaults). A future SDK
serializer that drops a newly exposed field must be updated before release.
Generated shape validation does not replace server business rules or SDK
cross-field validation.

## Documentation

The public CLI overview lives in `octogen-ai/mintlify-docs`, at
`cli/overview.mdx`, and links to this repository's CLI directory for the complete
command reference. This change makes [that linked reference](REFERENCE.md)
generated from the actual help renderer. The overview remains editorial.
Local README shell examples are checked against the actual command parser.

## Verification and release order

1. Refresh the public snapshot only after the intended API contract is
   published. Update SDK methods/metadata deliberately for any contract changes.
2. Run `npm ci`, `npm run codegen:check`, `npm run check`, Python checks, and
   `npm run test:published-contract`. CI compares the entire CDN document,
   so request-schema drift under an unchanged version fails too.
3. Run `npm run test:cli-package` after building. This installs both local
   tarballs in an isolated directory and exercises real CLI dispatch and SDK
   serialization, including lookup/parse equivalence, search facets/prices,
   similarity include/exclude facets, and HTML stdin. Existing executable,
   migration and stdout/exit smoke tests remain in place.
4. If the SDK changed, release it first via its existing `sdk-ts-v*` workflow.
   Update the exact CLI dependency pin/version under the normal release policy.
5. Run `npm run test:cli-release`. It installs the CLI tarball with its **actual
   exact registry dependency**, checks both versions, and repeats request
   conformance. It fails if the pinned SDK is absent or incompatible. CLI tag
   verification runs this check and requires the CDN contract to be reachable
   and current. Source aliases and local SDK tarballs cannot mask registry drift.
6. With separate release authorization, publish the CLI tag, smoke the installed
   published version and both executable names, then promote its dist-tag only
   under the existing migration/release policy. PR merge is not publication.

Customer Voyage operations and CLI bindings are retired together in this
snapshot. Deploy the companion Platform API and publish its OpenAPI before
releasing these packages; the published-contract check remains a rollout gate.
Stale mappings intentionally fail and must not be suppressed.

Negative tests mutate operations, fields, requiredness, types, enums, bounds,
defaults and descriptions. They also verify that unsupported schema keywords
fail generation. `codegen:check` byte-compares generated files and the rendered
reference. Keep these behavioral assertions when changing the projection.
