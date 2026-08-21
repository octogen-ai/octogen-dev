/**
 * The structural invariant behind exit `6`.
 *
 * `tests/exit-codes.test.ts` proves no *classified failure* produces `6`. That
 * leaves one hole: a command could reach for `ExitCode.NoResult` directly and
 * exit `6` for a reason nobody vetted. So this test reads the source and asserts
 * that the constant is named only where it belongs — in the table that defines
 * it, in the one constructor that can produce it, and in the small set of places
 * that *branch* on a `6` that already exists.
 *
 * A source-reading test is unusual, and it is the right tool here: the property
 * is "no future call site invents a `6`", which is a property of the code rather
 * than of any single behaviour. Adding a legitimate new use means adding one
 * line to `ALLOWED` and defending it in review, which is exactly the
 * conversation that should happen.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EXIT_CODES, ExitCode } from "../src/exit.js";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/**
 * Files allowed to name `ExitCode.NoResult`, and why.
 *
 * `exit.ts` defines it and `noResult()` is its only constructor; `help.ts`
 * prints the table; `refresh.ts` alone *computes* a verdict of `6` (its
 * per-target table can decide "every target was a miss") and immediately routes
 * it through `noResult()`, so the evidence is still recorded. Nothing else may
 * name it at all.
 */
const ALLOWED = new Map<string, string>([
  ["exit.ts", "defines the table and the noResult() constructor"],
  ["help.ts", "prints the exit-code table in --help"],
  ["commands/refresh.ts", "branches on the decideExit() table's own verdict"],
]);

function sourceFiles(directory: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path, `${prefix}${entry}/`));
    } else if (entry.endsWith(".ts")) {
      files.push(`${prefix}${entry}`);
    }
  }
  return files;
}

describe("exit 6 has exactly one constructor", () => {
  it("is named only in files that are allowed to name it", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const contents = readFileSync(join(SRC, file), "utf8");
      if (!contents.includes("ExitCode.NoResult")) {
        continue;
      }
      if (!ALLOWED.has(file)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      "These files name ExitCode.NoResult directly. Exit 6 means the server " +
        "answered and the answer was empty — go through noResult(), which " +
        "requires the evidence, or add the file to ALLOWED with a reason:\n  " +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("is reached by every command through noResult()", () => {
    // Each command that can legitimately answer "empty" calls the constructor,
    // so the `serverAnswered` evidence is recorded at every one of those sites.
    const callers = sourceFiles(SRC)
      .filter((file) => file.startsWith("commands/"))
      .filter((file) => readFileSync(join(SRC, file), "utf8").includes("noResult("));
    expect(callers.sort()).toEqual([
      "commands/domains.ts",
      "commands/lookup.ts",
      "commands/refresh.ts",
      "commands/resolve.ts",
      "commands/search.ts",
      "commands/similar.ts",
      "commands/voyage.ts",
    ]);
  });

  it("requires `serverAnswered: true` at every call site", () => {
    for (const file of sourceFiles(SRC)) {
      const contents = readFileSync(join(SRC, file), "utf8");
      const calls = contents.split("noResult({").length - 1;
      if (calls === 0) {
        continue;
      }
      // The type already enforces this; the count catches a call site that was
      // added by copy-paste from something that is not `noResult`.
      expect(
        contents.split("serverAnswered: true").length - 1,
        `${file} has ${String(calls)} noResult() calls`,
      ).toBeGreaterThanOrEqual(calls);
    }
  });
});

describe("the exit-code table", () => {
  it("is 0–7 with no gaps and no duplicates, so nothing is unassigned", () => {
    expect([...EXIT_CODES].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(EXIT_CODES).size).toBe(EXIT_CODES.length);
  });

  it("pins each code to its documented meaning", () => {
    // Frozen within a major: an agent branching on these must never have to
    // parse a message, so renumbering is a breaking change to the interface.
    expect(ExitCode.Success).toBe(0);
    expect(ExitCode.Unexpected).toBe(1);
    expect(ExitCode.Usage).toBe(2);
    expect(ExitCode.NoCredential).toBe(3);
    expect(ExitCode.NotEntitled).toBe(4);
    expect(ExitCode.Throttled).toBe(5);
    expect(ExitCode.NoResult).toBe(6);
    expect(ExitCode.Partial).toBe(7);
  });
});
