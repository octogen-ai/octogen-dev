/**
 * The CLI's one path to `api.octogen.ai/v1`: `@octogen-ai/sdk`, exact-pinned.
 *
 * D4, and not a stylistic choice. A thin private `/v1` client inside the CLI is
 * tempting whenever the SDK is missing something, and it would create two
 * places where a `/v1` change has to be noticed. The CLI is the surface
 * exercised against production every day, so making it the SDK's most
 * demanding customer is how a `POST /products/recrawl`-class bug — a route that
 * never existed, shipped in both SDKs — gets found in an afternoon instead of
 * by a partner.
 *
 * This module adds what a *client* needs and a library deliberately does not
 * decide for you: retry policy, rate-limit surfacing, timing for `--verbose`,
 * and the keyless preflight.
 */

import {
  KEYLESS_TRIAL_OPERATIONS,
  OctogenClient,
  SDK_VERSION,
  type OctogenClientOptions,
  type OperationId,
} from "@octogen-ai/sdk";

import { classify, retryDecision } from "./classify.js";
import type { CliError } from "./exit.js";
import type { Writer } from "./output.js";
import { VERBOSE_HEADER_ALLOWLIST } from "./output.js";
import type { ResolvedKey } from "./auth.js";

export { SDK_VERSION };

export interface ApiContext {
  client: OctogenClient;
  key: ResolvedKey;
  keyless: boolean;
  writer: Writer;
  noRetry: boolean;
  /** Set once the keyless notice has been printed. */
  announcedKeyless: boolean;
  /** Injected in tests so retry backoff does not actually sleep. */
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

export interface BuildClientOptions {
  key: ResolvedKey;
  writer: Writer;
  baseUrl?: string | undefined;
  timeoutSeconds?: number | undefined;
  noRetry?: boolean;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/**
 * Build the API context for one command run.
 *
 * A key that resolved is registered with the redactor *before* any request, so
 * a leak through an unexpected stack trace is already covered rather than
 * covered as soon as somebody remembers.
 */
export function buildContext(options: BuildClientOptions): ApiContext {
  const { key, writer } = options;
  writer.redactor.register(key.apiKey);
  if (key.notice !== undefined) {
    writer.problem({
      code: "deprecated_env_var",
      message: key.notice,
      severity: "warning",
    });
  }

  const clientOptions: OctogenClientOptions = { allowKeyless: true };
  if (key.apiKey !== undefined) {
    clientOptions.apiKey = key.apiKey;
  }
  if (options.baseUrl !== undefined) {
    clientOptions.baseUrl = options.baseUrl;
  }
  if (options.timeoutSeconds !== undefined) {
    clientOptions.timeoutMs = Math.round(options.timeoutSeconds * 1000);
  }
  if (options.fetch !== undefined) {
    clientOptions.fetch = options.fetch;
  }

  return {
    announcedKeyless: false,
    client: new OctogenClient(clientOptions),
    key,
    keyless: key.apiKey === undefined,
    noRetry: options.noRetry ?? false,
    random: options.random ?? Math.random,
    sleep: options.sleep ?? defaultSleep,
    writer,
  };
}

/**
 * The keyless notice, on stderr, once, before any request.
 *
 * Stated up front rather than inferred from a later refusal: an agent that
 * knows it is on a 30-a-day allowance can budget, and one that finds out by
 * being refused has already spent requests learning it.
 *
 * It deliberately does **not** refuse a key-required command locally, even
 * though {@link KEYLESS_TRIAL_OPERATIONS} would let it. The server owns that
 * route table; a local copy of it can only ever be stale, and a stale copy
 * would refuse something the server would happily have answered — a wrong
 * answer produced to save one round trip. The server's own refusal
 * (`401 keyless_trial_endpoint_not_included`) is authoritative, and its body is
 * better written than anything guessed here would be. The constant is used to
 * *name* the eligible routes, so the wording cannot drift from the SDK's list.
 */
function announceKeyless(context: ApiContext): void {
  if (!context.keyless || context.announcedKeyless) {
    return;
  }
  context.announcedKeyless = true;
  context.writer.diagnostic(
    `No API key found. ${KEYLESS_ROUTES} answer without one (keyless trial: 30 ` +
      "requests per IP per day, full payloads); everything else on /v1 needs a " +
      "key. Run `octogen init` to get one.",
  );
}

/** `domains, lookup and search`, derived from the SDK's own route list. */
const KEYLESS_ROUTES: string = humanList(KEYLESS_TRIAL_OPERATIONS.map(commandNameOf));

function commandNameOf(operation: OperationId): string {
  switch (operation) {
    case "listDomains":
      return "domains";
    case "lookupProduct":
      return "lookup";
    case "searchProducts":
      return "search";
    default:
      return operation;
  }
}

function humanList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "no commands";
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

/**
 * Run one API call with the retry policy, timing, and error classification.
 *
 * `label` is what `--verbose` prints and what an error says was being done, so
 * it should read like the request: `"POST /products/lookup"`.
 */
export async function call<T>(
  context: ApiContext,
  label: string,
  invoke: () => Promise<T>,
  options: { coverageAdjacent?: boolean } = {},
): Promise<T> {
  announceKeyless(context);
  for (let attempt = 1; ; attempt += 1) {
    const startedAt = performance.now();
    try {
      const result = await invoke();
      context.writer.trace(
        `${label} ok in ${elapsed(startedAt)}${attempt > 1 ? ` (attempt ${String(attempt)})` : ""}`,
      );
      return result;
    } catch (error) {
      const failure = classify(error, {
        keyless: context.keyless,
        ...(options.coverageAdjacent === true ? { coverageAdjacent: true } : {}),
      });
      context.writer.trace(
        `${label} ${describeStatus(failure)} in ${elapsed(startedAt)} — ${failure.code}`,
      );
      traceHeaders(context, error);

      const decision = retryDecision(failure, attempt, {
        noRetry: context.noRetry,
        random: context.random,
      });
      if (!decision.retry) {
        throw failure;
      }
      context.writer.diagnostic(
        `${label} failed (${failure.code}); retrying in ${String(
          Math.round(decision.delayMs / 100) / 10,
        )}s`,
      );
      await context.sleep(decision.delayMs);
    }
  }
}

/** The rate-limit posture of the last response, for `status` and `--verbose`. */
export interface RateLimitSnapshot {
  limit: number | undefined;
  remaining: number | undefined;
  resetAt: string | undefined;
}

export function rateLimitFromHeaders(
  headers: Readonly<Record<string, string>>,
): RateLimitSnapshot {
  const reset = numeric(headers["x-ratelimit-reset"]);
  return {
    limit: numeric(headers["x-ratelimit-limit"]),
    remaining: numeric(headers["x-ratelimit-remaining"]),
    // `X-RateLimit-Reset` is a unix epoch, unlike `/v1/me`'s RFC 3339
    // `resetAt`. Normalized here so the envelope has one shape.
    resetAt: reset === undefined ? undefined : new Date(reset * 1000).toISOString(),
  };
}

function numeric(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * `--verbose` header output: names always, values only for the allowlist.
 *
 * The allowlist is the point. A blanket header dump is how an `Authorization`
 * value reaches a transcript, and the redactor is a second line of defense, not
 * a licence to print everything.
 */
function traceHeaders(context: ApiContext, error: unknown): void {
  if (!context.writer.verbose) {
    return;
  }
  const response = responseOf(error);
  if (response === undefined) {
    return;
  }
  const parts: string[] = [];
  for (const [name, value] of response.headers) {
    const lower = name.toLowerCase();
    parts.push(
      VERBOSE_HEADER_ALLOWLIST.includes(lower) ? `${lower}=${value}` : `${lower}=…`,
    );
  }
  context.writer.trace(`  headers: ${parts.sort().join(" ")}`);
}

function responseOf(error: unknown): Response | undefined {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response: unknown = (error as { response?: unknown }).response;
    return response instanceof Response ? response : undefined;
  }
  return undefined;
}

function describeStatus(failure: CliError): string {
  return failure.status === undefined ? "failed" : String(failure.status);
}

function elapsed(startedAt: number): string {
  return `${String(Math.round(performance.now() - startedAt))}ms`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
