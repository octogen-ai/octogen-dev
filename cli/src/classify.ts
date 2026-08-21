/**
 * Turning an SDK error into an exit code, and deciding whether to retry.
 *
 * One function, one table, no per-command opinions — the whole point of the
 * taxonomy is that `lookup` and `voyage` fail the same way. The mapping is
 * pinned by `tests/exit-codes.test.ts`, which walks every row and asserts, most
 * importantly, that **nothing here ever produces exit `6`**. `6` means the
 * server answered and the answer was empty; a command decides that from a
 * `200`, never from an error.
 *
 * Statuses and `detail.code` values below were read off production on
 * 2026-08-21, not assumed:
 *
 * | Status | `detail.code`                          | Meaning                          |
 * | ------ | -------------------------------------- | -------------------------------- |
 * | 401    | `keyless_trial_endpoint_not_included`  | no key, and this route needs one |
 * | 401    | `keyless_trial_capability_not_included`| no key, and this *option* needs one |
 * | 401    | `"API key revoked"` (string detail)    | the key was turned off           |
 * | 401    | `"Invalid API key"`                    | not a key we know                |
 * | 403    | —                                      | not a Developer organization     |
 * | 404    | `product_not_found` / `voyage_not_found` | a genuine miss                 |
 * | 429    | `rate_limit_exceeded`                  | per-key rate limit               |
 * | 429    | `concurrency_limit_exceeded`           | in-flight allowance              |
 * | 429    | `product_resolution_rate_limited`      | resolver saturated               |
 * | 429    | `voyage_quota_exceeded`                | monthly/concurrent voyage quota  |
 * | 429    | `keyless_trial_exhausted`              | 30/IP/day spent                  |
 * | 429    | `keyless_trial_busy`                   | free-lane back-pressure          |
 * | 503    | `keyless_trial_unavailable`            | the meter is down; trial closed  |
 */

import {
  MissingAPIKeyError,
  OctogenAPIError,
  OctogenAuthenticationError,
  OctogenConnectionError,
  OctogenForbiddenError,
} from "@octogen-ai/sdk";

import { CliError, ExitCode, type CoverageVerdict } from "./exit.js";

/** Where an agent is told to go when it has no usable credential. */
export const ONBOARDING_URL = "https://platform.octogen.ai/agent-onboarding/SKILL.md";

const NEVER_RETRY_429 = new Set(["keyless_trial_exhausted", "voyage_quota_exceeded"]);

export interface ClassifyOptions {
  /**
   * `true` for commands whose answer an agent could mistake for a coverage
   * verdict. Adds `coverage: "unknown"` to every failure, so the field is
   * always present to read.
   */
  coverageAdjacent?: boolean;
  /** True when this request carried no credential (the keyless trial). */
  keyless?: boolean;
}

/**
 * Map anything thrown by a `/v1` call onto the exit-code table.
 *
 * Already-classified `CliError`s pass through: a command that decided "this is
 * a miss" has more context than this function does.
 */
export function classify(error: unknown, options: ClassifyOptions = {}): CliError {
  if (error instanceof CliError) {
    return error;
  }
  const coverage: CoverageVerdict | undefined =
    options.coverageAdjacent === true ? "unknown" : undefined;

  if (error instanceof MissingAPIKeyError) {
    return noCredential(
      "No Octogen API key found. Run `octogen init` to authorize one.",
      "no_credential",
      coverage,
    );
  }

  if (error instanceof OctogenConnectionError) {
    return new CliError(`Could not reach the Octogen API: ${error.message}`, {
      code: "connection_failed",
      exitCode: ExitCode.Unexpected,
      ...(coverage === undefined ? {} : { coverage }),
      cause: error,
    });
  }

  if (error instanceof OctogenAPIError) {
    return classifyApiError(error, coverage, options.keyless === true);
  }

  return new CliError(unexpectedMessage(error), {
    cause: error,
    code: "unexpected",
    exitCode: ExitCode.Unexpected,
    ...(coverage === undefined ? {} : { coverage }),
  });
}

function classifyApiError(
  error: OctogenAPIError,
  coverage: CoverageVerdict | undefined,
  keyless: boolean,
): CliError {
  const status = error.statusCode;
  const code = detailCode(error.detail);
  const message = detailMessage(error.detail) ?? error.message;
  const retryAfter = retryAfterSeconds(error.response);
  const base = {
    ...(coverage === undefined ? {} : { coverage }),
    cause: error,
    detail: error.detail,
    ...(status === undefined ? {} : { status }),
    ...(retryAfter === undefined ? {} : { retryAfter }),
  };

  if (status === 401 || error instanceof OctogenAuthenticationError) {
    // The keyless refusals are not "your key is bad" — there was no key. Say
    // so, because "invalid credential" would send an agent looking for a
    // credential problem it does not have.
    if (code === "keyless_trial_endpoint_not_included") {
      return new CliError(
        `${message} (This command needs an API key; the keyless trial covers ` +
          `only domains, lookup, and search.)`,
        {
          ...base,
          code: "keyless_endpoint_not_included",
          exitCode: ExitCode.NoCredential,
          remediation: { command: "octogen init", url: ONBOARDING_URL },
        },
      );
    }
    if (code === "keyless_trial_capability_not_included") {
      return new CliError(message, {
        ...base,
        code: "keyless_capability_not_included",
        exitCode: ExitCode.NoCredential,
        remediation: { command: "octogen init", url: ONBOARDING_URL },
      });
    }
    // Platform-api distinguishes these as of P3: a revoked key that resolved
    // gets its own `detail`. Before that they were the same body, and the CLI
    // said "invalid or revoked" and guessed at nothing.
    if (/revoked/i.test(message)) {
      return new CliError(
        "This API key was revoked. Ask whoever revoked it, or run " +
          "`octogen init` to authorize a new one.",
        {
          ...base,
          code: "credential_revoked",
          exitCode: ExitCode.NoCredential,
          remediation: { command: "octogen init" },
        },
      );
    }
    return new CliError(`The Octogen API rejected this key as invalid: ${message}`, {
      ...base,
      code: "credential_invalid",
      exitCode: ExitCode.NoCredential,
      remediation: { command: "octogen init" },
    });
  }

  if (status === 403 || error instanceof OctogenForbiddenError) {
    return new CliError(
      `${message} This organization is not a Developer organization, so ` +
        `/v1 is closed to it. Retrying will not help.`,
      {
        ...base,
        code: "not_entitled",
        exitCode: ExitCode.NotEntitled,
        remediation: { url: "https://platform.octogen.ai" },
      },
    );
  }

  if (status === 429) {
    if (code === "keyless_trial_exhausted") {
      return new CliError(keylessExhaustedMessage(retryAfter), {
        ...base,
        code: "keyless_quota_exhausted",
        exitCode: ExitCode.Throttled,
        remediation: { command: "octogen init", url: ONBOARDING_URL },
      });
    }
    if (code === "keyless_trial_busy") {
      return new CliError(
        `${message} (Free-lane back-pressure, not a coverage answer.)`,
        {
          ...base,
          code: "keyless_busy",
          exitCode: ExitCode.Throttled,
          ...(keyless
            ? { remediation: { command: "octogen init", url: ONBOARDING_URL } }
            : {}),
        },
      );
    }
    return new CliError(message, {
      ...base,
      code: code ?? "throttled",
      exitCode: ExitCode.Throttled,
    });
  }

  if (status === 503 && code === "keyless_trial_unavailable") {
    return new CliError(message, {
      ...base,
      code: "keyless_unavailable",
      exitCode: ExitCode.Unexpected,
      remediation: { command: "octogen init", url: ONBOARDING_URL },
    });
  }

  if (status === 422) {
    return new CliError(`The Octogen API rejected the request: ${message}`, {
      ...base,
      code: code ?? "invalid_request",
      exitCode: ExitCode.Usage,
    });
  }

  // Everything left — 404s a command did not claim as a miss, 5xx after
  // retries, an unrecognized shape. Deliberately `1`: an unclassified error
  // must not borrow a code that means something specific, least of all `6`.
  return new CliError(message, {
    ...base,
    code: code ?? "api_error",
    exitCode: ExitCode.Unexpected,
  });
}

/**
 * The exhaustion message, in full, because this is the one an agent is most
 * likely to misread.
 *
 * The server's own body says the same thing; the CLI restates it in its own
 * voice so the message survives a caller that only reads the CLI's text.
 */
function keylessExhaustedMessage(retryAfter: number | undefined): string {
  const retry =
    retryAfter === undefined
      ? "The allowance refills continuously over 24 hours."
      : `The allowance refills continuously; retry in ~${String(retryAfter)}s.`;
  return [
    "Keyless trial exhausted: 30 requests per IP per day.",
    "This says nothing about whether Octogen covers this merchant — the",
    "request was refused before any catalog was consulted. Coverage is unknown.",
    retry,
    "Get a key (free, one browser click): octogen init",
  ].join("\n");
}

function noCredential(
  message: string,
  code: string,
  coverage: CoverageVerdict | undefined,
): CliError {
  return new CliError(message, {
    code,
    exitCode: ExitCode.NoCredential,
    ...(coverage === undefined ? {} : { coverage }),
    remediation: { command: "octogen init", url: ONBOARDING_URL },
  });
}

/** Is this failure worth trying again, and after how long? */
export function retryDecision(
  error: CliError,
  attempt: number,
  options: { noRetry?: boolean; random?: () => number } = {},
): { retry: boolean; delayMs: number } {
  if (options.noRetry === true) {
    return { delayMs: 0, retry: false };
  }
  const random = options.random ?? Math.random;

  if (error.exitCode === ExitCode.Throttled) {
    if (NEVER_RETRY_429.has(serverCode(error))) {
      return { delayMs: 0, retry: false };
    }
    const limit = error.code === "concurrency_limit_exceeded" ? 3 : 2;
    if (attempt > limit) {
      return { delayMs: 0, retry: false };
    }
    // Honor `Retry-After` when the server sent one; it knows its own bucket.
    const seconds = error.retryAfter ?? attempt;
    return { delayMs: Math.min(seconds, 30) * 1000, retry: true };
  }

  const transient =
    error.code === "connection_failed" ||
    error.code === "keyless_unavailable" ||
    (error.status !== undefined && error.status >= 500);
  if (!transient || attempt > 2) {
    return { delayMs: 0, retry: false };
  }
  // Exponential backoff, full jitter: 0–500ms, then 0–1000ms.
  const ceiling = 500 * 2 ** (attempt - 1);
  return { delayMs: Math.floor(random() * ceiling), retry: true };
}

function serverCode(error: CliError): string {
  const code = detailCode(error.detail);
  return code ?? error.code;
}

/**
 * The machine code in an error body, whichever shape it came in.
 *
 * `/v1` uses two: a structured `{code, message, …}` (the keyless refusals, the
 * voyage quota) and a bare string (`{"detail": "product_not_found"}`, which is
 * what a lookup miss actually returns — verified against production
 * 2026-08-21). Both are codes, so both are read as one, and a `detail` that is
 * prose rather than an identifier is left alone.
 */
export function detailCode(detail: unknown): string | undefined {
  if (typeof detail === "string") {
    return /^[a-z][a-z0-9_]{2,63}$/.test(detail) ? detail : undefined;
  }
  if (typeof detail === "object" && detail !== null && "code" in detail) {
    const code: unknown = (detail as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

export function detailMessage(detail: unknown): string | undefined {
  if (typeof detail === "string" && detail.length > 0) {
    return detail;
  }
  if (typeof detail === "object" && detail !== null && "message" in detail) {
    const message: unknown = (detail as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}

function retryAfterSeconds(response: Response | undefined): number | undefined {
  const header = response?.headers.get("Retry-After");
  if (header === null || header === undefined) {
    return undefined;
  }
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function unexpectedMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.length > 0 ? error.message : error.name;
  }
  return `Unexpected failure: ${String(error)}`;
}
