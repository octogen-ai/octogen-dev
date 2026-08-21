/**
 * Credential resolution, D8, in one place.
 *
 * Precedence, highest first:
 *
 * 1. `--api-key-stdin` — one line from stdin.
 * 2. `--api-key-file <path>`.
 * 3. `OCTOGEN_PLATFORM_API_KEY` in the environment.
 * 4. `OCTO_API_KEY` in the environment, with a deprecation notice.
 * 5. `.env` at the project root, then ancestors up to the repo boundary
 *    (`.git`) — `OCTOGEN_PLATFORM_API_KEY` first, then `OCTO_API_KEY`. Read,
 *    never exported into the child environment.
 * 6. Nothing → keyless where the command supports it, otherwise exit `3`.
 *
 * **There is no `--api-key <value>` flag.** argv is visible to every process on
 * the box, lands in shell history, and — the reason that decides it — gets
 * echoed verbatim into agent transcripts. `--api-key-stdin` costs one pipe and
 * removes the whole class of leak.
 *
 * `status --json` reports which rung won as `auth.source`, so an agent
 * debugging a "wrong key" problem gets the answer in one call.
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { API_KEY_ENV_VAR, DEPRECATED_API_KEY_ENV_VAR } from "@octogen-ai/sdk";

import { CliError, ExitCode, usageError } from "./exit.js";
import { keyPrefixOf, looksLikeApiKey } from "./redact.js";

export { API_KEY_ENV_VAR, DEPRECATED_API_KEY_ENV_VAR };

/** Which rung of the precedence ladder produced the key. */
export type KeySource =
  | "stdin"
  | "file"
  | "env"
  | "env-deprecated"
  | "dotenv"
  | "dotenv-deprecated"
  | "keyless";

export interface ResolvedKey {
  apiKey: string | undefined;
  source: KeySource;
  /** The safe two-segment identifier, or `undefined` for a non-minted shape. */
  keyPrefix: string | undefined;
  /** The file a `dotenv`/`file` key came from, for `status` and diagnostics. */
  path: string | undefined;
  /** A deprecation or malformed-shape note for stderr. */
  notice: string | undefined;
}

export interface ResolveKeyOptions {
  apiKeyStdin?: boolean;
  apiKeyFile?: string | undefined;
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  /** Injected so the resolution ladder is testable without a real stdin. */
  readStdin?: () => string;
  readFile?: (path: string) => string;
}

/**
 * Find a key, or report that there is none.
 *
 * A malformed key is a *failure*, not a miss: it exits `3` here rather than
 * spending a request to be told `401`, and its value is never printed — only
 * its length, because a value that does not match the minting pattern might be
 * a secret of some other shape.
 */
export function resolveKey(options: ResolveKeyOptions = {}): ResolvedKey {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));

  if (options.apiKeyStdin === true) {
    const read = options.readStdin ?? readStdinLine;
    const value = read().trim();
    if (value.length === 0) {
      throw new CliError("No API key on stdin (--api-key-stdin).", {
        code: "no_credential",
        exitCode: ExitCode.NoCredential,
        remediation: { command: "octogen init" },
      });
    }
    return accept(value, "stdin", undefined);
  }

  if (options.apiKeyFile !== undefined) {
    const path = resolve(cwd, options.apiKeyFile);
    let contents: string;
    try {
      contents = readFile(path);
    } catch (error) {
      throw usageError(
        `Cannot read --api-key-file ${path}: ${describeIoError(error)}`,
        "unreadable_input",
      );
    }
    const value = firstNonEmptyLine(contents);
    if (value === undefined) {
      throw new CliError(`--api-key-file ${path} is empty.`, {
        code: "no_credential",
        exitCode: ExitCode.NoCredential,
        remediation: { command: "octogen init" },
      });
    }
    return accept(value, "file", path);
  }

  const primary = env[API_KEY_ENV_VAR]?.trim();
  if (primary !== undefined && primary.length > 0) {
    return accept(primary, "env", undefined);
  }

  const deprecated = env[DEPRECATED_API_KEY_ENV_VAR]?.trim();
  if (deprecated !== undefined && deprecated.length > 0) {
    return accept(
      deprecated,
      "env-deprecated",
      undefined,
      `${DEPRECATED_API_KEY_ENV_VAR} is deprecated; set ${API_KEY_ENV_VAR} instead.`,
    );
  }

  for (const file of dotenvCandidates(cwd)) {
    let contents: string;
    try {
      contents = readFile(file);
    } catch {
      continue;
    }
    const values = parseDotenv(contents);
    const fromDotenv = values.get(API_KEY_ENV_VAR);
    if (fromDotenv !== undefined && fromDotenv.length > 0) {
      return accept(fromDotenv, "dotenv", file);
    }
    const legacy = values.get(DEPRECATED_API_KEY_ENV_VAR);
    if (legacy !== undefined && legacy.length > 0) {
      return accept(
        legacy,
        "dotenv-deprecated",
        file,
        `${DEPRECATED_API_KEY_ENV_VAR} in ${file} is deprecated; rename it to ${API_KEY_ENV_VAR}.`,
      );
    }
  }

  return {
    apiKey: undefined,
    keyPrefix: undefined,
    notice: undefined,
    path: undefined,
    source: "keyless",
  };
}

function accept(
  value: string,
  source: KeySource,
  path: string | undefined,
  notice?: string,
): ResolvedKey {
  if (!looksLikeApiKey(value)) {
    // Never echo it. A value that is not a minted key might still be a secret,
    // and its length is the most that can be said safely.
    throw new CliError(
      `The API key from ${describeSource(source, path)} is malformed ` +
        `(${String(value.length)} characters; expected ` +
        `octo_live_<32 hex>_<secret>). Not sending it.`,
      {
        code: "malformed_credential",
        exitCode: ExitCode.NoCredential,
        remediation: { command: "octogen init" },
      },
    );
  }
  return {
    apiKey: value,
    keyPrefix: keyPrefixOf(value),
    notice,
    path,
    source,
  };
}

export function describeSource(source: KeySource, path: string | undefined): string {
  switch (source) {
    case "stdin":
      return "stdin";
    case "file":
      return path ?? "--api-key-file";
    case "env":
      return API_KEY_ENV_VAR;
    case "env-deprecated":
      return DEPRECATED_API_KEY_ENV_VAR;
    case "dotenv":
    case "dotenv-deprecated":
      return path ?? ".env";
    case "keyless":
      return "no credential";
  }
}

/**
 * `.env` files from `cwd` up to the repository boundary, nearest first.
 *
 * The walk stops at the directory holding `.git`, so a stray `~/.env` on a
 * developer's machine never silently authenticates a command run in an
 * unrelated checkout.
 */
export function dotenvCandidates(cwd: string): string[] {
  const files: string[] = [];
  let directory = resolve(cwd);
  for (;;) {
    files.push(join(directory, ".env"));
    if (existsQuiet(join(directory, ".git"))) {
      break;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  return files;
}

/**
 * Parse a `.env` file well enough to read one variable out of it.
 *
 * Deliberately narrow: `KEY=value`, optional `export `, optional matching
 * quotes, `#` comments. No interpolation and no multi-line values — this reads
 * a credential, it is not a dotenv runtime, and a surprising expansion here
 * would be a security bug rather than a feature.
 */
export function parseDotenv(contents: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null) {
      continue;
    }
    const name = match[1];
    let value = (match[2] ?? "").trim();
    if (name === undefined) {
      continue;
    }
    const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : undefined;
    if (quote !== undefined && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      // Only strip a trailing comment on an unquoted value: a `#` inside
      // quotes is part of the secret.
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values.set(name, value);
  }
  return values;
}

function firstNonEmptyLine(contents: string): string | undefined {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function readStdinLine(): string {
  try {
    return readFileSync(0, "utf8");
  } catch (error) {
    throw usageError(
      `Cannot read stdin: ${describeIoError(error)}`,
      "unreadable_input",
    );
  }
}

/** Does `path` exist? `.git` is a directory in a clone and a file in a worktree. */
function existsQuiet(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function describeIoError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
