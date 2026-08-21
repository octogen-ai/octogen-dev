/**
 * The exit-code taxonomy, walked row by row.
 *
 * The load-bearing assertion is the negative one: **no classified failure ever
 * produces exit `6`.** `6` means the server answered and the answer was empty,
 * and the expensive mistake this product can cause is an agent reading a
 * throttle as "Octogen does not cover this merchant" and abandoning a covered
 * domain forever. Nothing errors when that happens, so the exit code is the
 * only thing that can prevent it.
 *
 * Every `(status, detail)` pair below was read off production on 2026-08-21 or
 * comes from `octogen.platform.keyless` in the monorepo, not invented.
 */

import {
  MissingAPIKeyError,
  OctogenAPIError,
  OctogenAuthenticationError,
  OctogenConnectionError,
  OctogenForbiddenError,
} from "@octogen-ai/sdk";
import { describe, expect, it } from "vitest";

import { classify, retryDecision } from "../src/classify.js";
import { CliError, ExitCode, noResult } from "../src/exit.js";

function apiError(
  status: number,
  detail: unknown,
  headers: Record<string, string> = {},
): OctogenAPIError {
  const response = new Response(JSON.stringify({ detail }), { headers, status });
  const message = typeof detail === "string" ? detail : "request failed";
  const Ctor =
    status === 401
      ? OctogenAuthenticationError
      : status === 403
        ? OctogenForbiddenError
        : OctogenAPIError;
  return new Ctor(message, { detail, response, statusCode: status });
}

function keylessDetail(code: string, message = "refused"): Record<string, unknown> {
  return {
    code,
    getApiKey: "https://platform.octogen.ai/agent-onboarding/SKILL.md",
    isCoverageAnswer: false,
    keylessTrial: { limit: 30, scope: "per client IP address", window: "24h" },
    message,
  };
}

interface Row {
  what: string;
  error: unknown;
  code: string;
  exit: ExitCode;
}

const ROWS: Row[] = [
  {
    code: "no_credential",
    error: new MissingAPIKeyError(),
    exit: ExitCode.NoCredential,
    what: "no key at all",
  },
  {
    code: "keyless_endpoint_not_included",
    error: apiError(401, keylessDetail("keyless_trial_endpoint_not_included")),
    exit: ExitCode.NoCredential,
    what: "no key on a key-required route",
  },
  {
    code: "keyless_capability_not_included",
    error: apiError(401, keylessDetail("keyless_trial_capability_not_included")),
    exit: ExitCode.NoCredential,
    what: "no key for an on-demand capability",
  },
  {
    code: "credential_invalid",
    error: apiError(401, "Invalid API key"),
    exit: ExitCode.NoCredential,
    what: "an invalid key",
  },
  {
    code: "credential_revoked",
    error: apiError(401, "API key revoked"),
    exit: ExitCode.NoCredential,
    what: "a revoked key (distinguishable since P3)",
  },
  {
    code: "not_entitled",
    error: apiError(403, "programmatic_access_forbidden"),
    exit: ExitCode.NotEntitled,
    what: "a merchant organization on /v1",
  },
  {
    code: "rate_limit_exceeded",
    error: apiError(429, { code: "rate_limit_exceeded" }, { "Retry-After": "2" }),
    exit: ExitCode.Throttled,
    what: "the per-key rate limit",
  },
  {
    code: "concurrency_limit_exceeded",
    error: apiError(
      429,
      { code: "concurrency_limit_exceeded" },
      { "Retry-After": "1" },
    ),
    exit: ExitCode.Throttled,
    what: "the in-flight allowance",
  },
  {
    code: "product_resolution_rate_limited",
    error: apiError(429, { code: "product_resolution_rate_limited" }),
    exit: ExitCode.Throttled,
    what: "a saturated resolver",
  },
  {
    code: "voyage_quota_exceeded",
    error: apiError(429, { code: "voyage_quota_exceeded", violations: [] }),
    exit: ExitCode.Throttled,
    what: "voyage quota",
  },
  {
    code: "keyless_quota_exhausted",
    error: apiError(429, keylessDetail("keyless_trial_exhausted"), {
      "Retry-After": "2880",
    }),
    exit: ExitCode.Throttled,
    what: "the keyless cap",
  },
  {
    code: "keyless_busy",
    error: apiError(429, keylessDetail("keyless_trial_busy"), { "Retry-After": "1" }),
    exit: ExitCode.Throttled,
    what: "keyless back-pressure",
  },
  {
    code: "keyless_unavailable",
    error: apiError(503, keylessDetail("keyless_trial_unavailable")),
    exit: ExitCode.Unexpected,
    what: "keyless metering down",
  },
  {
    code: "product_not_found",
    error: apiError(404, "product_not_found"),
    exit: ExitCode.Unexpected,
    what: "a 404 a command did not claim as a miss",
  },
  {
    code: "connection_failed",
    error: new OctogenConnectionError("fetch failed"),
    exit: ExitCode.Unexpected,
    what: "a network failure",
  },
  {
    // FastAPI's own 500 body. Prose, not an identifier, so it is not read as a
    // machine code — which is the distinction `detailCode` is drawing.
    code: "api_error",
    error: apiError(500, "Internal Server Error"),
    exit: ExitCode.Unexpected,
    what: "a 5xx",
  },
  {
    code: "invalid_request",
    error: apiError(422, { detail: [{ loc: ["body", "q"], msg: "required" }] }),
    exit: ExitCode.Usage,
    what: "a rejected request body",
  },
  {
    code: "unexpected",
    error: new TypeError("something we did not plan for"),
    exit: ExitCode.Unexpected,
    what: "an unrecognized throw",
  },
];

describe("classify", () => {
  for (const row of ROWS) {
    it(`maps ${row.what} to ${row.code} / exit ${String(row.exit)}`, () => {
      const failure = classify(row.error);
      expect(failure.code).toBe(row.code);
      expect(failure.exitCode).toBe(row.exit);
    });
  }

  it("NEVER produces exit 6 for anything", () => {
    // The invariant. `6` is not "an error we could not classify" and not "a
    // throttle" — it is only ever a command deciding, from a 200, that the
    // answer was empty.
    for (const row of ROWS) {
      const failure = classify(row.error);
      expect(
        failure.exitCode,
        `${row.what} must not exit 6: ${failure.code} is not an empty answer`,
      ).not.toBe(ExitCode.NoResult);
    }
  });

  it("never produces exit 6 for a throttle in particular", () => {
    const throttles = ROWS.filter((row) => row.exit === ExitCode.Throttled);
    expect(throttles.length).toBeGreaterThan(4);
    for (const row of throttles) {
      expect(classify(row.error).exitCode).toBe(ExitCode.Throttled);
    }
  });

  it("passes an already-classified failure through untouched", () => {
    const miss = noResult({
      answeredWith: "200 with an empty items[]",
      code: "no_matches",
      message: "nothing matched",
      serverAnswered: true,
    });
    expect(classify(miss)).toBe(miss);
    expect(classify(miss).exitCode).toBe(ExitCode.NoResult);
  });

  it("marks every coverage-adjacent failure `coverage: unknown`", () => {
    // So an agent reading a failure from `domains`, `lookup`, or `search` always
    // has the field to read, and never has to infer coverage from its absence.
    for (const row of ROWS) {
      const failure = classify(row.error, { coverageAdjacent: true });
      expect(failure.coverage, `${row.what} should report unknown coverage`).toBe(
        "unknown",
      );
    }
  });

  it("says nothing about coverage when the command is not coverage-adjacent", () => {
    for (const row of ROWS) {
      expect(classify(row.error).coverage).toBeUndefined();
    }
  });

  it("carries Retry-After through when the server sends one", () => {
    const failure = classify(
      apiError(429, keylessDetail("keyless_trial_exhausted"), {
        "Retry-After": "2880",
      }),
    );
    expect(failure.retryAfter).toBe(2880);
  });

  it("says 'invalid or revoked' apart, never guessing between them", () => {
    expect(classify(apiError(401, "API key revoked")).message).toMatch(/was revoked/);
    expect(classify(apiError(401, "Invalid API key")).message).toMatch(/as invalid/);
  });

  it("tells an agent the keyless refusal is not a coverage answer", () => {
    const failure = classify(apiError(429, keylessDetail("keyless_trial_exhausted")), {
      coverageAdjacent: true,
    });
    expect(failure.message).toMatch(/says nothing about whether Octogen covers/);
    expect(failure.coverage).toBe("unknown");
    expect(failure.exitCode).toBe(ExitCode.Throttled);
  });
});

describe("retry policy", () => {
  const deterministic = { random: () => 0.5 };

  it("honors Retry-After on a rate limit, twice", () => {
    const failure = classify(
      apiError(429, { code: "rate_limit_exceeded" }, { "Retry-After": "3" }),
    );
    expect(retryDecision(failure, 1, deterministic)).toEqual({
      delayMs: 3000,
      retry: true,
    });
    expect(retryDecision(failure, 2, deterministic).retry).toBe(true);
    expect(retryDecision(failure, 3, deterministic).retry).toBe(false);
  });

  it("retries a concurrency 429 three times", () => {
    const failure = classify(
      apiError(429, { code: "concurrency_limit_exceeded" }, { "Retry-After": "1" }),
    );
    expect(retryDecision(failure, 3, deterministic).retry).toBe(true);
    expect(retryDecision(failure, 4, deterministic).retry).toBe(false);
  });

  it("never retries an exhausted keyless quota", () => {
    const failure = classify(
      apiError(429, keylessDetail("keyless_trial_exhausted"), { "Retry-After": "60" }),
    );
    // Retrying would burn the caller's wall-clock to be refused again: the
    // allowance refills over hours, not seconds.
    expect(retryDecision(failure, 1, deterministic).retry).toBe(false);
  });

  it("never retries voyage quota", () => {
    const failure = classify(apiError(429, { code: "voyage_quota_exceeded" }));
    expect(retryDecision(failure, 1, deterministic).retry).toBe(false);
  });

  it("never retries 401, 403, 404, or 422", () => {
    for (const status of [401, 403, 404, 422]) {
      const failure = classify(apiError(status, "no"));
      expect(
        retryDecision(failure, 1, deterministic).retry,
        `${String(status)} must not be retried`,
      ).toBe(false);
    }
  });

  it("retries a network failure with jittered exponential backoff", () => {
    const failure = classify(new OctogenConnectionError("socket hang up"));
    expect(retryDecision(failure, 1, deterministic)).toEqual({
      delayMs: 250,
      retry: true,
    });
    expect(retryDecision(failure, 2, deterministic)).toEqual({
      delayMs: 500,
      retry: true,
    });
    expect(retryDecision(failure, 3, deterministic).retry).toBe(false);
  });

  it("retries nothing at all under --no-retry", () => {
    // An agent measuring latency needs one request to be one request.
    for (const row of ROWS) {
      expect(
        retryDecision(classify(row.error), 1, { noRetry: true }).retry,
        `${row.what} must not be retried under --no-retry`,
      ).toBe(false);
    }
  });
});

describe("noResult", () => {
  it("is the only way to get exit 6, and demands the server answered", () => {
    const miss = noResult({
      answeredWith: "404 product_not_found from POST /products/lookup",
      code: "product_not_found",
      message: "no product",
      serverAnswered: true,
    });
    expect(miss.exitCode).toBe(ExitCode.NoResult);
    expect(miss).toBeInstanceOf(CliError);
  });

  it("carries coverage and remediation through to the envelope", () => {
    const miss = noResult({
      answeredWith: "api snapshot of GET /domains",
      code: "host_not_covered",
      coverage: "not_covered",
      data: { covered: false },
      message: "not covered",
      remediation: { command: "octogen voyage example.com" },
      serverAnswered: true,
    });
    expect(miss.coverage).toBe("not_covered");
    expect(miss.data).toEqual({ covered: false });
    expect(miss.remediation?.command).toBe("octogen voyage example.com");
  });
});
