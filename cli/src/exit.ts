/**
 * The exit-code table for the whole CLI, and the only way to produce one.
 *
 * An agent branching on these must never have to parse a message, which makes
 * the table an interface: it is frozen within a major version, and every code
 * below has exactly one meaning.
 *
 * `NoResult` (6) is the load-bearing one. It means *the server answered and the
 * answer was empty* — a lookup miss, a host absent from a `200` coverage list,
 * an unknown `task_id`. It is never a throttle, never a refusal, and never an
 * error we could not classify, because the expensive mistake this product can
 * cause is an agent reading "you are out of quota" as "Octogen does not cover
 * this merchant" and abandoning a covered domain forever. Nothing errored, so
 * nothing tells it otherwise.
 *
 * That invariant is enforced three ways: `noResult()` is the only constructor
 * that yields 6 and it demands the evidence that the server answered;
 * `tests/exit-codes.test.ts` asserts no classified failure maps to 6; and
 * `tests/exit-code-invariants.test.ts` asserts no other module in `src/` even
 * names the constant.
 */

export const ExitCode = {
  /** The command did what it was asked. */
  Success: 0,
  /** Unexpected: a network failure, a 5xx after retries, an unhandled throw. */
  Unexpected: 1,
  /** Usage: bad flags, a missing argument, an unreadable input file. */
  Usage: 2,
  /** No usable credential: nothing resolved, or the key is invalid/revoked. */
  NoCredential: 3,
  /** Not entitled: a `403`, i.e. the organization is not a Developer org. */
  NotEntitled: 4,
  /** Throttled or out of quota: any `429`, including the keyless cap. */
  Throttled: 5,
  /** No result: the server answered, and the answer was empty. */
  NoResult: 6,
  /** Partial success: some targets accepted, some rejected. */
  Partial: 7,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/** Every code, for tests and `--help`. */
export const EXIT_CODES: readonly ExitCode[] = Object.freeze([
  ExitCode.Success,
  ExitCode.Unexpected,
  ExitCode.Usage,
  ExitCode.NoCredential,
  ExitCode.NotEntitled,
  ExitCode.Throttled,
  ExitCode.NoResult,
  ExitCode.Partial,
]);

/**
 * What a coverage-adjacent command knows about coverage.
 *
 * `"unknown"` is on **every** error body from such a command, so the field is
 * always there to read and never has to be inferred from its own absence.
 * `"covered"` and `"not_covered"` are reachable only from a coverage snapshot
 * the server confirmed; see `coverage.ts`.
 */
export type CoverageVerdict = "covered" | "not_covered" | "unknown";

/** A remediation an agent can actually run, attached to a failure. */
export interface Remediation {
  command?: string;
  url?: string;
}

export interface CliFailureOptions {
  /** A stable machine code, e.g. `no_credential`, `keyless_quota_exhausted`. */
  code: string;
  exitCode: ExitCode;
  /** The server's structured `detail`, when there was one. */
  detail?: unknown;
  /** `Retry-After`, in seconds, when the server sent one. */
  retryAfter?: number;
  remediation?: Remediation;
  /** Present on coverage-adjacent commands; always `"unknown"` on a failure. */
  coverage?: CoverageVerdict;
  /** HTTP status, when this came from a response. */
  status?: number;
  /**
   * Extra envelope fields for this failure.
   *
   * Exists so a *decided* answer that happens to be a failure can still carry
   * its answer: `domains --check` on an uncovered host exits `6` and must emit
   * `covered: false`, and routing that through the `noResult()` chokepoint is
   * better than letting the command emit its own envelope and bypass the one
   * constructor that can produce a `6`.
   */
  data?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * A failure with a decided exit code.
 *
 * Anything thrown that is not one of these is an unexpected failure and exits
 * `1`, so a forgotten classification degrades to "we do not know" rather than
 * to a confident wrong answer.
 */
export class CliError extends Error {
  readonly code: string;
  readonly exitCode: ExitCode;
  readonly detail: unknown;
  readonly retryAfter: number | undefined;
  readonly remediation: Remediation | undefined;
  readonly coverage: CoverageVerdict | undefined;
  readonly status: number | undefined;
  readonly data: Record<string, unknown> | undefined;

  constructor(message: string, options: CliFailureOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CliError";
    this.code = options.code;
    this.exitCode = options.exitCode;
    this.detail = options.detail;
    this.retryAfter = options.retryAfter;
    this.remediation = options.remediation;
    this.coverage = options.coverage;
    this.status = options.status;
    this.data = options.data;
  }
}

/** A usage error: exit `2`, and never a request. */
export function usageError(message: string, code = "usage"): CliError {
  return new CliError(message, { code, exitCode: ExitCode.Usage });
}

/**
 * The single constructor for exit `6`.
 *
 * `serverAnswered` is not decoration. It is required, it must be `true`, and
 * the call site has to name what answered — so "the server said nothing came
 * back" cannot be written by accident on a path where the server said nothing
 * at all.
 */
export function noResult(options: {
  message: string;
  code: string;
  /** Must be `true`: the evidence that this is a miss and not a refusal. */
  serverAnswered: true;
  /** What answered, e.g. `"200 POST /products/lookup"`. Kept for diagnostics. */
  answeredWith: string;
  detail?: unknown;
  coverage?: CoverageVerdict;
  remediation?: Remediation;
  data?: Record<string, unknown>;
}): CliError {
  // `serverAnswered: true` is not decoration: a call site that has no server
  // answer cannot write it, and TypeScript makes that a compile error rather
  // than a runtime check — which is why there is no runtime check here.
  const failure: CliFailureOptions = {
    code: options.code,
    exitCode: ExitCode.NoResult,
  };
  if (options.detail !== undefined) {
    failure.detail = options.detail;
  }
  if (options.coverage !== undefined) {
    failure.coverage = options.coverage;
  }
  if (options.remediation !== undefined) {
    failure.remediation = options.remediation;
  }
  if (options.data !== undefined) {
    failure.data = options.data;
  }
  return new CliError(options.message, failure);
}
