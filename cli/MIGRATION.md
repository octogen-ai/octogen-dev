# StoreRouter CLI migration and release

## Install and upgrade

After the first release, install `@storerouter/cli@next` (Node 20 or newer):

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
The new package starts at 0.3.0 and pins the already released SDK 0.5.0. Old
installs remain usable but do not gain the new defaults or aliases. Moving to
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
npm exec --yes --package=@storerouter/cli@next -- storerouter domains
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

`STOREROUTER_CACHE_DIR` overrides `OCTOGEN_CACHE_DIR`. Otherwise the existing
`${XDG_CACHE_HOME:-$HOME/.cache}/octogen` location stays in use. Cache filenames
include the base URL and key identifier: switching the default host does not
reuse coverage from another host. There is no persisted credential store or
credential migration. Search price units, `--facet`, JSON schema version,
canonical command names, and exit codes are unchanged. Color/size shortcuts,
`--ships-to`, and `--currency` are not introduced.

## Release owner checklist (no publish performed by this PR)

Read-only audit on 2026-10-16: public npm reports `@octogen-ai/cli@next` 0.2.0
with SDK 0.4.0; `@storerouter/cli` returns 404. The existing GitHub `npm`
environment permits `cli-v*` and `sdk-ts-v*` tags. Its approval gate is retained.
The `storerouter` npm organization already exists; do not create another one.
The registry's private trusted-publisher and owner settings were not accessible
in this audit and are not assumed to be configured. See npm’s
[trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[provenance](https://docs.npmjs.com/generating-provenance-statements/) guidance.

1. Review and merge this PR under the repository's normal policy.
2. An npm owner with publish rights in the existing `storerouter` organization
   must arrange the **first** public `@storerouter/cli` publish. Follow npm's
   current first-package/trusted-publishing setup; if a bootstrap publish is
   required before the package settings exist, use the owner's authenticated
   release session with `--tag next`, never commit a token. Local bootstrap
   publishing cannot generate CI provenance: the owner must explicitly use
   `--provenance=false` for that one publish, or arrange a separately authorized
   CI bootstrap with provenance. Keep provenance enabled in the committed
   manifest and normal release workflow.
   Do not assume the old package's publisher grants rights to the new scope.
3. Configure/verify the trusted publisher **on `@storerouter/cli`** for GitHub
   owner `octogen-ai`, repository `octogen-dev`, workflow `release.yml`,
   environment `npm`. Allow `npm publish` for this workflow. Complete its first OIDC publish within
   two days of configuration (otherwise recreate the expired publisher).
   Leave SDK publishers unchanged. Verify organization
   security/2FA policy and the release environment's required reviewers.
4. Run `npm ci`, `npm run check`, `npm run codegen:check`, and the CLI tarball
   smoke test on the release commit. Confirm SDK 0.5.0 is available on npm
   before tagging. The workflow checks tag/manifest agreement and builds/tests
   the tagged commit. It publishes only `@storerouter/cli` for `cli-v*` tags,
   using the manifest's public/provenance/`next` configuration.
5. For workflow publishing after bootstrap, use a fresh matching version and
   `cli-v<version>` tag. Do not duplicate a bootstrap version already published
   or reuse `cli-v0.2.0`. Approve the `npm` environment only after reviewing the
   tagged artifact. No new tag naming scheme or environment policy is needed.
6. Verify the published `@next` tarball in a disposable prefix: both binaries,
   `--version`, keyless/offline exit 3, configured-key status, and migration.
   Promote to `latest` only under separate release approval after those checks.
   Keep the old package available; optional npm deprecation messaging on it is
   a separate owner action and must point to the uninstall/install instructions.

No package publication, npm permission change, credential change, dist-tag
promotion, merge, or deployment is authorized by this implementation PR.

## Reproduce the package smoke test

From the repository root, after `npm ci` and `npm run build`:

```bash
pack_dir=$(mktemp -d)
npm pack --workspace @octogen-ai/sdk --pack-destination "$pack_dir"
npm pack --workspace @storerouter/cli --pack-destination "$pack_dir"
CLI_TARBALL="$pack_dir/storerouter-cli-0.3.0.tgz" \
SDK_TARBALL="$pack_dir/octogen-ai-sdk-0.5.0.tgz" \
bash cli/tests/package-smoke.sh
```

Use the filenames printed by `npm pack` if versions change. The test downloads
the published old 0.2.0 package and dependencies from npm; API requests use a
local HTTP fixture. The temporary installation prefixes are removed on exit.
