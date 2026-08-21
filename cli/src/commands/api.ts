/**
 * `octogen api <METHOD> <path>` — the escape hatch. **Unstable by construction:
 * you own the request body.**
 *
 * It exists for three jobs, all of which are load-bearing:
 *
 * 1. a `/v1` route published tomorrow is reachable today, without a release;
 * 2. surfaces that are live but deliberately outside the published contract
 *    (the `/brands/*` routes, say) stay usable without a first-class command
 *    implying a stability promise the contract does not make;
 * 3. the eight `coverage/url-lists` operations that belong to the Python
 *    `octogen-url-lists` CLI stay reachable from here without duplicating its
 *    mutating surface with a second, differently-shaped one.
 *
 * What it keeps from the rest of the CLI: key resolution, retry and backoff,
 * rate-limit surfacing, the error taxonomy, and redaction. What it drops: any
 * opinion about the schema. It goes through the SDK like everything else — D4
 * has no exception for it, which is why `fetchRaw` exists there rather than a
 * second HTTP client here.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import type { HttpMethod, RawResponse } from "@octogen-ai/sdk";

import { call } from "../client.js";
import type { CommandContext } from "../context.js";
import { ExitCode, usageError } from "../exit.js";
import type { CommandSpec } from "../registry.js";

const METHODS: readonly HttpMethod[] = ["DELETE", "GET", "PATCH", "POST", "PUT"];

async function runApi(context: CommandContext): Promise<ExitCode> {
  const { args, writer } = context;
  const [rawMethod, rawPath] = context.positionals;
  if (rawMethod === undefined || rawPath === undefined) {
    throw usageError(
      "octogen api <METHOD> <path> — e.g. octogen api GET /coverage/url-lists",
      "missing_argument",
    );
  }
  const method = rawMethod.toUpperCase();
  if (!isMethod(method)) {
    throw usageError(
      `Unsupported method ${rawMethod}; one of ${METHODS.join(", ")}.`,
      "invalid_argument",
    );
  }

  const body = readBody(args.string("data"), context.cwd, context.readStdin);
  const query = parseQuery(args.strings("query"));

  const api = context.api();
  const response: RawResponse = await call(api, `${method} ${rawPath}`, () =>
    api.client.fetchRaw(method, rawPath, {
      ...(body === undefined ? {} : { body }),
      ...(Object.keys(query).length === 0 ? {} : { query }),
    }),
  );

  writer.emit({
    command: context.command,
    data: {
      request: { method, path: rawPath, query, hasBody: body !== undefined },
      status: response.status,
      // Only the allow-listed headers, and only under --verbose, are values
      // worth carrying: the rest are noise, and one of them is a credential.
      rateLimit: {
        limit: response.headers["x-ratelimit-limit"] ?? null,
        remaining: response.headers["x-ratelimit-remaining"] ?? null,
      },
      requestId: response.headers["x-request-id"] ?? null,
      body: writer.redactor.redactValue(response.data),
    },
    exitCode: ExitCode.Success,
    human: () =>
      `${String(response.status)} ${method} ${rawPath}\n${JSON.stringify(
        response.data,
        null,
        2,
      )}`,
    ok: true,
  });
  return ExitCode.Success;
}

function isMethod(value: string): value is HttpMethod {
  return (METHODS as readonly string[]).includes(value);
}

/**
 * `--data` accepts inline JSON, `@file`, or `-` for stdin.
 *
 * Inline is allowed here and nowhere else, because an ad-hoc body is usually
 * small and typed by hand. `resolve --html` is the counter-example and it is
 * the reason the distinction is deliberate: a 5 MiB document has no business
 * in argv.
 */
function readBody(
  source: string | undefined,
  cwd: string,
  readStdin: () => string,
): unknown {
  if (source === undefined) {
    return undefined;
  }
  const text =
    source === "-"
      ? readStdin()
      : source.startsWith("@")
        ? readFileOrFail(resolvePath(cwd, source.slice(1)))
        : source;
  if (text.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw usageError(
      `--data is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      "invalid_option_value",
    );
  }
}

function readFileOrFail(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw usageError(
      `Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      "unreadable_input",
    );
  }
}

function parseQuery(entries: readonly string[]): Record<string, string> {
  const query: Record<string, string> = {};
  for (const entry of entries) {
    const equals = entry.indexOf("=");
    if (equals <= 0) {
      throw usageError(`--query must be k=v (got ${entry})`, "invalid_option_value");
    }
    query[entry.slice(0, equals)] = entry.slice(equals + 1);
  }
  return query;
}

export const apiCommand = {
  flags: {
    data: {
      describe: "Request body: inline JSON, @file, or - for stdin.",
      kind: "string",
      placeholder: "json|@file|-",
    },
    query: {
      describe: "Query parameter as k=v (repeatable).",
      kind: "string",
      multiple: true,
      placeholder: "k=v",
    },
  },
  name: "api",
  notes: [
    "UNSTABLE BY CONSTRUCTION: you own the request body. No request or response",
    "types, no defaults, and no promise the route exists — every other command",
    "names an operationId that is checked against the published contract, and",
    "this one takes the path from you.",
    "",
    "You still get key resolution, retry, rate-limit surfacing, the exit-code",
    "taxonomy, and redaction.",
    "",
    "This is how the eight coverage/url-lists operations stay reachable — their",
    "first-class CLI is `octogen-url-lists` in the Python SDK, whose mutations",
    "are dry-run-by-default behind --apply.",
  ],
  // Deliberately empty: this command names no operation, which is the whole
  // point of it and why the coverage check cannot be satisfied by adding it
  // here.
  operations: [] as const,
  run: runApi,
  summary: "Raw authenticated /v1 request (unstable by construction)",
  usage: "api <METHOD> <path> [--data @file|-|<json>] [--query k=v]…",
} satisfies CommandSpec;
