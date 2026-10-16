#!/usr/bin/env bash
# RELEASE_GATE=1 deliberately resolves the exact registry SDK instead of the local tarball.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
npm pack --workspace @storerouter/cli --pack-destination "$scratch" --silent > "$scratch/cli-name"
cli="$scratch/$(cat "$scratch/cli-name")"
if [ "${RELEASE_GATE:-0}" = 1 ]; then
  npm install --prefix "$scratch" --ignore-scripts --no-audit --no-fund "$cli"
else
  npm pack --workspace @octogen-ai/sdk --pack-destination "$scratch" --silent > "$scratch/sdk-name"
  npm install --prefix "$scratch" --ignore-scripts --no-audit --no-fund "$scratch/$(cat "$scratch/sdk-name")" "$cli"
fi
"$root/node_modules/.bin/tsx" --tsconfig "$root/cli/tsconfig.json" "$root/cli/tools/packed-contract.ts" "$scratch"
