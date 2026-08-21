/**
 * The output contract, which is the same in every command.
 *
 * * **Human-readable when stdout is a TTY; JSON when it is not.** Agents run
 *   without a TTY, so they get parseable output by default without having to
 *   know to ask for it. `--json` and `--no-json` force either way.
 * * JSON is **one object on stdout, one line, `schemaVersion` first**.
 * * Diagnostics go to stderr. Nothing else is ever written to stdout.
 * * No prompts, spinners, colors, or pagers when not a TTY.
 * * `--quiet` suppresses stderr diagnostics; `--verbose` adds request timing
 *   and redacted headers. **Neither changes stdout**, so a script can turn
 *   either on without reparsing.
 *
 * Everything written by either stream passes through {@link Redactor} first.
 */

import type { CliError, CoverageVerdict, ExitCode } from "./exit.js";
import { Redactor } from "./redact.js";

/** Bumped only on a breaking change to the envelope. New fields are a minor. */
export const SCHEMA_VERSION = 1;

/** Header values `--verbose` is allowed to print, per D8. */
export const VERBOSE_HEADER_ALLOWLIST: readonly string[] = Object.freeze([
  "etag",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-request-id",
]);

export interface Problem {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  /** A runnable command or a URL. This is what makes a problem actionable. */
  fix?: string;
}

export interface WriterOptions {
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  redactor?: Redactor;
}

/**
 * Resolve the output mode.
 *
 * The default is the one an agent needs and a human does not have to think
 * about: a pipe, a file, or a captured subprocess gets JSON.
 */
export function resolveJsonMode(options: {
  json?: boolean | undefined;
  isTty: boolean;
}): boolean {
  return options.json ?? !options.isTty;
}

export class Writer {
  readonly json: boolean;
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly redactor: Redactor;
  private readonly writeOut: (text: string) => void;
  private readonly writeErr: (text: string) => void;
  private readonly problems: Problem[] = [];
  private emitted = false;

  constructor(options: WriterOptions) {
    this.json = options.json;
    this.quiet = options.quiet;
    this.verbose = options.verbose;
    this.redactor = options.redactor ?? new Redactor();
    this.writeOut =
      options.stdout ??
      ((text: string) => {
        process.stdout.write(text);
      });
    this.writeErr =
      options.stderr ??
      ((text: string) => {
        process.stderr.write(text);
      });
  }

  /** A diagnostic. stderr, suppressed by `--quiet`, never on stdout. */
  diagnostic(message: string): void {
    if (this.quiet) {
      return;
    }
    this.writeErr(`${this.redactor.redact(message)}\n`);
  }

  /** Timing and redacted headers. stderr, only under `--verbose`. */
  trace(message: string): void {
    if (!this.verbose) {
      return;
    }
    this.writeErr(`${this.redactor.redact(message)}\n`);
  }

  /**
   * Record a problem.
   *
   * Problems ride the envelope rather than only the stream, so a caller that
   * captured stdout and dropped stderr still learns what was wrong.
   */
  problem(problem: Problem): void {
    this.problems.push(problem);
    const fix = problem.fix === undefined ? "" : ` → ${problem.fix}`;
    this.diagnostic(`${problem.severity}: ${problem.message}${fix}`);
  }

  get recordedProblems(): readonly Problem[] {
    return this.problems;
  }

  /** Has the single stdout write already happened? */
  get hasEmitted(): boolean {
    return this.emitted;
  }

  /**
   * The one stdout write of the process.
   *
   * In JSON mode this is the envelope, one line. In TTY mode it is the
   * human rendering. Either way it happens exactly once, which is what makes
   * "one object on stdout" a property of the code rather than a convention.
   */
  emit(result: {
    command: string;
    ok: boolean;
    exitCode: ExitCode;
    /** Everything command-specific. Merged into the envelope. */
    data: Record<string, unknown>;
    /** The human rendering, used only when stdout is a TTY and not `--json`. */
    human: () => string;
  }): void {
    if (this.emitted) {
      throw new Error("stdout has already been written; emit() is once-only");
    }
    this.emitted = true;

    if (!this.json) {
      const text = this.redactor.redact(result.human());
      this.writeOut(text.endsWith("\n") ? text : `${text}\n`);
      return;
    }

    // `schemaVersion` first, because an agent reading a truncated line should
    // learn the shape before anything else. Insertion order is preserved by
    // `JSON.stringify`.
    const envelope: Record<string, unknown> = {
      schemaVersion: SCHEMA_VERSION,
      ok: result.ok,
      command: result.command,
    };
    for (const [key, value] of Object.entries(result.data)) {
      envelope[key] = value;
    }
    envelope["problems"] = this.problems;
    envelope["exitCode"] = result.exitCode;
    this.writeOut(`${this.redactor.redact(JSON.stringify(envelope))}\n`);
  }

  /**
   * Render a failure and return its exit code.
   *
   * The failure envelope has the same shape as a success envelope, so an agent
   * parses one thing. `coverage` is carried through when the command is
   * coverage-adjacent, so `"unknown"` is always present to read rather than
   * having to be inferred from a missing field.
   */
  fail(command: string, error: CliError): ExitCode {
    const data: Record<string, unknown> = { code: error.code };
    if (error.status !== undefined) {
      data["status"] = error.status;
    }
    data["message"] = error.message;
    if (error.coverage !== undefined) {
      data["coverage"] = error.coverage satisfies CoverageVerdict;
    }
    if (error.retryAfter !== undefined) {
      data["retryAfter"] = error.retryAfter;
    }
    if (error.detail !== undefined) {
      data["detail"] = this.redactor.redactValue(error.detail);
    }
    if (error.remediation !== undefined) {
      data["remediation"] = error.remediation;
    }
    for (const [key, value] of Object.entries(error.data ?? {})) {
      data[key] = value;
    }

    this.emit({
      command,
      data,
      exitCode: error.exitCode,
      human: () => humanFailure(error),
      ok: false,
    });
    return error.exitCode;
  }
}

function humanFailure(error: CliError): string {
  const lines = [error.message];
  if (error.coverage === "unknown") {
    lines.push("Coverage is unknown: no catalog was consulted.");
  }
  if (error.retryAfter !== undefined) {
    lines.push(`Retry after ${String(error.retryAfter)}s.`);
  }
  if (error.remediation?.command !== undefined) {
    lines.push(`Try: ${error.remediation.command}`);
  }
  if (error.remediation?.url !== undefined) {
    lines.push(error.remediation.url);
  }
  return lines.join("\n");
}
