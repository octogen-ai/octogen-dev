#!/usr/bin/env node
/**
 * The only file that touches the process.
 *
 * Everything else returns an exit code, which is what makes the whole CLI
 * testable in-process against real argv. The handlers below exist because
 * Node's default report for an unhandled throw writes a stack straight to
 * stderr, bypassing the redaction layer — the one leak path a `--verbose`
 * allowlist cannot cover.
 */

import { ExitCode } from "./exit.js";
import { Redactor } from "./redact.js";
import { run } from "./run.js";

const redactor = new Redactor();

function fatal(error: unknown): never {
  const text =
    error instanceof Error
      ? (error.stack ?? `${error.name}: ${error.message}`)
      : String(error);
  process.stderr.write(`${redactor.redact(text)}\n`);
  process.exit(ExitCode.Unexpected);
}

process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);

// A closed stdout (`octogen search x | head -1`) is not an error worth a stack.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") {
    process.exit(ExitCode.Success);
  }
  fatal(error);
});

try {
  process.exitCode = await run({ argv: process.argv.slice(2) });
} catch (error) {
  fatal(error);
}
