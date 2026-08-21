/**
 * The CLI's own version, and the SDK version it is pinned to.
 *
 * Both go into `--version`, into `octogen status`, and into every `--json`
 * envelope's `cli` block, so a bug report identifies both halves of the thing
 * that failed. That matters more than usual here: the CLI depends on an *exact*
 * SDK version, so "1.2.3 against 0.3.0" is a complete description of a build.
 *
 * Read from `package.json` at runtime rather than baked in by a build step,
 * because a version constant that a release forgets to bump is worse than no
 * constant — it makes a bug report point at the wrong code.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { SDK_VERSION } from "@octogen-ai/sdk";

interface Manifest {
  version?: unknown;
}

function readManifestVersion(): string {
  // `import.meta.url` is `dist/version.js` in the published package and
  // `src/version.ts` in development; `package.json` is one directory up from
  // both.
  const require = createRequire(import.meta.url);
  try {
    const path = require.resolve("../package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8")) as Manifest;
    return typeof manifest.version === "string" ? manifest.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const CLI_VERSION: string = readManifestVersion();
export const CLI_SDK_VERSION: string = SDK_VERSION;

export interface VersionBlock {
  version: string;
  sdkVersion: string;
  node: string;
}

export function versionBlock(): VersionBlock {
  return {
    node: process.versions.node,
    sdkVersion: CLI_SDK_VERSION,
    version: CLI_VERSION,
  };
}
