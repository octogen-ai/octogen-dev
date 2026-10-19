# StoreRouter CLI migration and release

## Install and upgrade

Install `@storerouter/cli@next` (Node 20 or newer):

```bash
npm install -g @storerouter/cli@next
storerouter --version
storerouter status --offline
```

Both `storerouter` and `octogen` execute the same file. `octogen` scripts can
continue to run after migration. `parse` is an exact `lookup` alias, including
requests, JSON `command: "lookup"`, output, flags, and exit codes.

The existing `@octogen-ai/cli@next` 0.2.0 stays available, pinned to SDK 0.4.0.
It is not republished, unpublished, or automatically upgraded by this change.
The published StoreRouter 0.3.0 pins SDK 0.5.0. The next release candidate is
CLI 0.4.0 with SDK 0.6.0, including public-contract validation and customer
Voyage removal. Old installs do not gain the new defaults or aliases. Moving to
the new package is an explicit choice; an old-name forwarding package is not
part of this release.

For a global installation in the **same npm prefix**, remove the old package
before installing the new one:

```bash
npm ls -g --depth=0
npm uninstall -g @octogen-ai/cli
npm install -g @storerouter/cli@next
storerouter --version
octogen --version
```

Both packages own `octogen`. npm global installation rejects the second
package with `EEXIST`; do not use `--force`, delete the executable manually, or
overwrite links. The package smoke test checks both installation orders in
disposable prefixes, verifies the existing executable survives the failed
install, and tests uninstall-then-install migration. If installation of the new
package fails after uninstalling, reinstall `@octogen-ai/cli@next` to roll back.

For temporary side-by-side use, keep separate prefixes, and call the binaries
by absolute path. PATH order decides which `octogen` you run. Likewise, avoid
installing both packages in one project's `node_modules`: they share a bin name
and local npm installs can replace that link. A one-shot invocation selects the
new executable explicitly:

```bash
npm exec --yes --package=@storerouter/cli@next -- storerouter search "linen dress"
```

Keep existing API keys: `STOREROUTER_API_KEY` takes priority over
`OCTOGEN_PLATFORM_API_KEY`, then deprecated `OCTO_API_KEY`. Explicit stdin/file
options still win over all environment variables, and process environment wins
over `.env`. Within each `.env`, the same name order applies; nearer files win
over ancestors. Empty environment values are skipped. A malformed selected key
fails with exit 3 rather than falling back to a different credential. The key
format remains `octo_live_…`; no secret is rewritten or stored.

`auth.source` keeps its existing values (`env`, `dotenv`, etc.) for both primary
and compatibility names. Only `OCTO_API_KEY` produces a deprecation notice.

`--base-url` overrides `STOREROUTER_BASE_URL`, then `OCTOGEN_BASE_URL`, then
`https://api.storerouter.ai/v1`. The two base URL environment names are new CLI
conveniences; neither changes the SDK. Empty environment URLs are skipped.
Credentials are the only values read from `.env`.

`STOREROUTER_CACHE_DIR` overrides `OCTOGEN_CACHE_DIR`; empty or whitespace-only
StoreRouter cache values are ignored. Otherwise the existing
`${XDG_CACHE_HOME:-$HOME/.cache}/octogen` location stays in use. Cache filenames
include the base URL and key identifier: switching the default host does not
reuse coverage from another host. There is no persisted credential store or
credential migration. Search price units, `--facet`, JSON schema version,
canonical command names, and exit codes are unchanged. Color/size shortcuts,
`--ships-to`, and `--currency` are not introduced.

## Release owner checklist (publication requires separate authorization)

Read-only registry audit on 2026-10-16: `@storerouter/cli@next` is 0.3.0;
`latest` still points to the 0.0.0 reservation package. Always specify `@next`.
TypeScript `@octogen-ai/sdk` and Python `octogen-ai-sdk` are both at 0.5.0.
The published CLI still includes Voyage and lacks `dist/contract.js`; merging
source changes does not update that artifact. Do not reuse published versions.

1. Review and merge the release-preparation PR under normal repository policy.
   On the final release commit run `npm ci`, `npm run check`,
   `npm run codegen:check`, `npm run test:published-contract`, Python tests,
   `npm run test:cli-package`, and the migration smoke test below.
2. With explicit release authorization, publish TypeScript SDK 0.6.0 through
   `sdk-ts-v0.6.0`. Publish Python SDK 0.6.0 through `sdk-py-v0.6.0` as its
   separate release. The existing workflow checks tag/manifest agreement and
   retains the `npm` / `pypi` environment approval gates and trusted publishing.
   Verify the registry artifacts, versions, and retired Voyage surface.
3. After npm serves SDK 0.6.0, run `npm run test:cli-release` on the final
   release commit. This installs the CLI tarball with its exact **registry** SDK.
   A passing local-tarball test is not this gate; an unpublished SDK means this
   gate is blocked. Do not change the pin or waive the check to bypass it.
4. With separate CLI release authorization, tag `cli-v0.4.0`. The workflow
   publishes `@storerouter/cli` using public access, provenance, and `next`.
   Verify trusted-publisher configuration on this package for GitHub owner
   `octogen-ai`, repository `octogen-dev`, workflow `release.yml`, environment
   `npm`; private registry settings are not assumed to be configured.
5. Verify the published `@next` tarball in a disposable prefix: both binaries,
   version metadata, credential-free offline exit 3, configured-key status,
   migration, contract runtime presence, and Voyage command/file absence.
   Rerun packed request conformance against the registry artifact.
6. Promote to `latest` only with separate approval after verification. Keep the
   old package available; optional npm deprecation messaging is a separate owner
   action and must point to the uninstall/install instructions.

No publication, registry setting change, dist-tag promotion, merge, or deployment
is authorized by the preparation PR. Recheck version availability before tags;
if a candidate has since been published, prepare a fresh version and matching pin.

## Reproduce the package smoke test

From the repository root, after `npm ci` and `npm run build`:

```bash
pack_dir=$(mktemp -d)
npm pack --workspace @octogen-ai/sdk --pack-destination "$pack_dir"
npm pack --workspace @storerouter/cli --pack-destination "$pack_dir"
CLI_TARBALL="$pack_dir/storerouter-cli-0.4.0.tgz" \
SDK_TARBALL="$pack_dir/octogen-ai-sdk-0.6.0.tgz" \
bash cli/tests/package-smoke.sh
```

Use the filenames printed by `npm pack` if versions change. The test downloads
the published old 0.2.0 package and dependencies from npm; API requests use a
local HTTP fixture. The temporary installation prefixes are removed on exit.
