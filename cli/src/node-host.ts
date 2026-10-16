import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { usageError } from "./exit.js";
import type { CliHost } from "./host.js";
import { versionBlock } from "./version.js";

export const nodeHost: CliHost = {
  utf8ByteLength: (text) => Buffer.byteLength(text, "utf8"),
  readFile: (path) => readFileSync(path, "utf8"),
  writeCache(path, contents) {
    mkdirSync(dirname(path), { mode: 0o700, recursive: true });
    writeFileSync(path, contents, { mode: 0o600 });
    chmodSync(path, 0o600);
  },
  exists(path) {
    try {
      statSync(path);
      return true;
    } catch {
      return false;
    }
  },
  resolve,
  dirname,
  join,
  homedir,
  sha256: (text) => createHash("sha256").update(text).digest("hex"),
  version: versionBlock(),
};

/** Credential stdin has always classified host I/O failure as usage error. */
export function readKeyStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch (error) {
    throw usageError(
      `Cannot read stdin: ${error instanceof Error ? error.message : String(error)}`,
      "unreadable_input",
    );
  }
}
