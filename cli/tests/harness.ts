/**
 * The test harness: run the real CLI, in-process, against a scripted API.
 *
 * Every behavioural test drives `run()` with real argv and asserts on the real
 * envelope, the real streams, and the real exit code. There is no partial
 * assembly of the CLI here — the point is that "one object on stdout" and "exit
 * 6 only for an empty answer" are properties of the shipped dispatcher, not of
 * a test double of it.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExitCode } from "../src/exit.js";
import { run } from "../src/run.js";

/** A key of the exact minted shape, for tests that need one to resolve. */
export const TEST_KEY_ID = "3f9c1a2b4d5e6f708192a3b4c5d6e7f8";
export const TEST_SECRET = "sZ9wQ1x-Yv3TbN7mK2pRdL4gH6jF8cA0eU5iO1yW3qE";
export const TEST_KEY = `octo_live_${TEST_KEY_ID}_${TEST_SECRET}`;
export const TEST_KEY_PREFIX = `octo_live_${TEST_KEY_ID}`;

export interface ScriptedResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface RecordedRequest {
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

export interface CliRun {
  exitCode: ExitCode;
  stdout: string;
  stderr: string;
  /** The single stdout line, parsed. Throws when stdout is not one JSON object. */
  json: () => Record<string, unknown>;
  requests: RecordedRequest[];
}

export interface RunCliOptions {
  argv: readonly string[];
  /** `"METHOD /path"` → response, or a function for per-call behavior. */
  routes?: Record<string, ScriptedResponse | ScriptedResponse[]>;
  env?: Record<string, string | undefined>;
  isTty?: boolean;
  cwd?: string;
  stdin?: string;
}

/**
 * Run the CLI once.
 *
 * The cache directory is a fresh temp dir per run, so the coverage cache cannot
 * leak between tests — and so a test asserting "this came from the network"
 * means it.
 */
export async function runCli(options: RunCliOptions): Promise<CliRun> {
  const cacheDir = mkdtempSync(join(tmpdir(), "octogen-cli-test-"));
  const requests: RecordedRequest[] = [];
  const remaining = new Map<string, ScriptedResponse[]>();
  for (const [key, value] of Object.entries(options.routes ?? {})) {
    remaining.set(key, Array.isArray(value) ? [...value] : [value]);
  }

  let stdout = "";
  let stderr = "";

  const fetchImpl: typeof globalThis.fetch = (input, init) => {
    // The SDK only ever passes a string; `fetch`'s signature is wider, so all
    // three shapes are read explicitly rather than stringified.
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = new URL(url).pathname.replace(/^\/v1/, "");
    const key = `${method} ${path}`;
    requests.push({
      body: parseBody(init?.body),
      headers: headerRecord(init?.headers),
      method,
      url,
    });

    const queue = remaining.get(key);
    const scripted = queue?.length === 1 ? queue[0] : queue?.shift();
    if (scripted === undefined) {
      // What a network failure looks like from inside the SDK, which is also
      // what an unscripted route should look like: a test that forgot a route
      // and a test that means "unreachable" get the same treatment.
      return Promise.reject(
        new Error(
          `No scripted response for ${key}. Scripted: ${[...remaining.keys()].join(", ")}`,
        ),
      );
    }
    const status = scripted.status ?? 200;
    const body =
      status === 204 || status === 304 ? null : JSON.stringify(scripted.body ?? {});
    return Promise.resolve(
      new Response(body, {
        headers: { "content-type": "application/json", ...scripted.headers },
        status,
      }),
    );
  };

  try {
    const exitCode = await run({
      argv: options.argv,
      cwd: options.cwd ?? cacheDir,
      env: {
        // Isolated: no ambient key, no shared cache, no `.env` from the machine
        // the tests happen to run on.
        OCTOGEN_CACHE_DIR: cacheDir,
        ...options.env,
      },
      fetch: fetchImpl,
      isTty: options.isTty ?? false,
      random: () => 0.5,
      readStdin: () => options.stdin ?? "",
      sleep: () => Promise.resolve(),
      stderr: (text) => {
        stderr += text;
      },
      stdout: (text) => {
        stdout += text;
      },
    });

    return {
      exitCode,
      json: () => parseSingleObject(stdout),
      requests,
      stderr,
      stdout,
    };
  } finally {
    rmSync(cacheDir, { force: true, recursive: true });
  }
}

/**
 * Parse stdout, asserting the output contract while doing it: exactly one line,
 * exactly one JSON object, `schemaVersion` first.
 */
export function parseSingleObject(stdout: string): Record<string, unknown> {
  const lines = stdout.split("\n").filter((line) => line.length > 0);
  if (lines.length !== 1) {
    throw new Error(
      `stdout must be exactly one line; got ${String(lines.length)}:\n${stdout}`,
    );
  }
  const line = lines[0] ?? "";
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`stdout must be one JSON object; got ${line}`);
  }
  const first = Object.keys(parsed)[0];
  if (first !== "schemaVersion") {
    throw new Error(`schemaVersion must come first; got ${String(first)}`);
  }
  return parsed as Record<string, unknown>;
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [name, value] of new Headers(headers)) {
    record[name] = value;
  }
  return record;
}

/** The apex-only shape `GET /v1/domains` actually returns. */
export const DOMAINS_BODY = {
  domains: [
    { catalog: "macys", catalogDisplayName: "Macys", host: "macys.com" },
    { catalog: "etro", catalogDisplayName: "Etro", host: "etro.com" },
    { catalog: "jcrew", catalogDisplayName: "J.Crew", host: "jcrew.com" },
    { catalog: "lagence", catalogDisplayName: "L'AGENCE", host: "lagence.com" },
    { catalog: "myshopify", catalogDisplayName: "Myshopify", host: "lagence.com" },
  ],
};

export const ME_BODY = {
  key: { id: TEST_KEY_ID, prefix: "octo_live_3f9c1a2b4d" },
  organization: {
    id: "8f1c0f4e-3b1a-4f2c-9d6e-7a8b9c0d1e2f",
    name: "Acme Co",
    slug: "acme-co",
    type: "catalog_partner",
  },
  principal: "api_key",
  quotas: {
    voyage: {
      concurrent: { limit: 2, used: 0 },
      monthly: { limit: 25, resetsAt: "2026-09-01T00:00:00Z", used: 3 },
    },
  },
  rateLimit: { limit: 120, remaining: 118, resetAt: "2026-08-21T14:31:00Z" },
};
