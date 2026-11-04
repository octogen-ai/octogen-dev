# Brand serving SDK release

Candidates: Python `octogen-ai-sdk` 0.16.0, TypeScript `@octogen-ai/sdk` 0.14.0,
and `@storerouter/cli` 0.6.0 (`next`; leave `latest` unchanged).

The deployed API separates directory, lightweight profile and coverage.
`get_brand_details` / `getBrandDetails` now decode `BrandDetailsView`.
Use `get_brand_coverage` / `getBrandCoverage` for the approximate snapshot.
The CLI exposes `brands directory`, `brands show` and `brands coverage`.
Browse continuation is server `nextOffset`, through projected gaps, with a
maximum start offset of 11976. The browser runtime uses the same methods and
policy, including distinct coverage and directory routes.

## Release order

1. Review and merge the contract change with explicit authority. Package
   generation, local builds and tags alone do not prove publication.
2. Use `.github/workflows/release.yml`: push `sdk-ts-v0.14.0` and
   `sdk-py-v0.16.0` tags on the reviewed commit. The workflow verifies the
   contract and artifacts, then publishes through trusted OIDC identities.
3. Verify npm/PyPI metadata, provenance and fresh installs of both versions.
4. Run `npm run test:cli-release` against the actual registry SDK 0.14.0.
   Push `cli-v0.6.0`; verify `@storerouter/cli@next` and a fresh install.
   Do not move `latest`, which remains the reservation package.
5. Refresh Cosimo's registry lock to Python 0.16.0 and Website's runtime pin
   to this reviewed commit. Merge/deploy those consumers only with rollout
   authority. Merge the public Mintlify documentation after package release.
6. Verify directory, canonical profiles/articles/navigation, optional coverage,
   top categories and all numbered browsing through the customer identity.
   Catalog connection retirement remains the separate Slice 5.

Local tarball tests and wheel installs are prepublication validation. They
must be reported separately from the release workflow, registry verification,
consumer deployment and production acceptance.
