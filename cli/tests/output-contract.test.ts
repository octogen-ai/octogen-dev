/**
 * The output contract (D2), asserted against the real dispatcher.
 *
 * These are the properties an agent depends on without being able to check
 * them: that stdout is one parseable object, that `--verbose` and `--quiet`
 * cannot change it, and that a diagnostic never lands where a parser is looking.
 */

import { describe, expect, it } from "vitest";

import { ExitCode } from "../src/exit.js";
import { SCHEMA_VERSION } from "../src/output.js";
import {
  DOMAINS_BODY,
  ME_BODY,
  parseSingleObject,
  runCli,
  TEST_KEY,
} from "./harness.js";

const KEYED = { OCTOGEN_PLATFORM_API_KEY: TEST_KEY };
const ROUTES = {
  "GET /domains": { body: DOMAINS_BODY, headers: { etag: '"v1"' } },
  "GET /me": { body: ME_BODY },
};

describe("JSON by default when stdout is not a TTY", () => {
  it("gives an agent parseable output without asking for it", async () => {
    // Agents run without a TTY, so this is the default that matters.
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      isTty: false,
      routes: ROUTES,
    });
    const body = result.json();
    expect(Object.keys(body)[0]).toBe("schemaVersion");
    expect(body["schemaVersion"]).toBe(SCHEMA_VERSION);
    expect(body["ok"]).toBe(true);
    expect(body["command"]).toBe("status");
    expect(body["exitCode"]).toBe(ExitCode.Success);
  });

  it("prints human output on a TTY instead", async () => {
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      isTty: true,
      routes: ROUTES,
    });
    expect(result.stdout).toMatch(/^Octogen {2}cli /);
    expect(() => parseSingleObject(result.stdout)).toThrow();
  });

  it("honors --json on a TTY and --no-json off one", async () => {
    const forced = await runCli({
      argv: ["status", "--json"],
      env: KEYED,
      isTty: true,
      routes: ROUTES,
    });
    expect(forced.json()["ok"]).toBe(true);

    const human = await runCli({
      argv: ["status", "--no-json"],
      env: KEYED,
      isTty: false,
      routes: ROUTES,
    });
    expect(human.stdout).toMatch(/^Octogen {2}cli /);
  });
});

describe("stdout is exactly one object", () => {
  it("holds for a success", async () => {
    const result = await runCli({ argv: ["status"], env: KEYED, routes: ROUTES });
    expect(result.stdout.split("\n").filter((line) => line.length > 0)).toHaveLength(1);
  });

  it("holds for a failure", async () => {
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      routes: { "GET /me": { body: { detail: "Invalid API key" }, status: 401 } },
    });
    expect(result.exitCode).toBe(ExitCode.NoCredential);
    expect(result.json()["ok"]).toBe(false);
  });

  it("holds for a usage error, which never reaches the network", async () => {
    const result = await runCli({ argv: ["lookup"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["code"]).toBe("missing_argument");
    expect(result.requests).toHaveLength(0);
  });

  it("holds for an unknown command", async () => {
    const result = await runCli({ argv: ["teleport", "somewhere"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["code"]).toBe("unknown_command");
  });

  it("keeps help off stdout entirely", async () => {
    // `octogen lookup --help | jq` must not break, so help is a diagnostic.
    const result = await runCli({ argv: ["lookup", "--help"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/octogen lookup <url>/);
  });

  it("keeps the bare-invocation help off stdout too", async () => {
    const result = await runCli({ argv: [] });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/Usage: octogen <command>/);
  });
});

describe("--quiet and --verbose change stderr, never stdout", () => {
  it("produces byte-identical stdout across all three", async () => {
    const runs = await Promise.all(
      [[], ["--quiet"], ["--verbose"]].map((extra) =>
        runCli({
          argv: ["domains", "--check", "https://www.macys.com/x", ...extra],
          env: KEYED,
          routes: ROUTES,
        }),
      ),
    );
    const [plain, quiet, verbose] = runs;
    expect(quiet?.stdout).toBe(plain?.stdout);
    expect(verbose?.stdout).toBe(plain?.stdout);
  });

  it("silences diagnostics under --quiet", async () => {
    const noisy = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x"],
      routes: ROUTES,
    });
    // Keyless: the notice is a diagnostic and lands on stderr.
    expect(noisy.stderr).toMatch(/No API key found/);

    const quiet = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x", "--quiet"],
      routes: ROUTES,
    });
    expect(quiet.stderr).toBe("");
    expect(quiet.exitCode).toBe(ExitCode.Success);
  });

  it("adds timing under --verbose", async () => {
    const result = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x", "--verbose"],
      env: KEYED,
      routes: ROUTES,
    });
    expect(result.stderr).toMatch(/GET \/domains ok in \d+ms/);
  });
});

describe("problems[] ride the envelope", () => {
  it("so a caller that dropped stderr still learns what was wrong", async () => {
    const result = await runCli({
      argv: ["status"],
      // The deprecated variable: accepted, with a notice.
      env: { OCTO_API_KEY: TEST_KEY },
      routes: ROUTES,
    });
    const problems = result.json()["problems"] as { code: string }[];
    expect(problems.map((problem) => problem.code)).toContain("deprecated_env_var");
    expect(result.exitCode).toBe(ExitCode.Success);
  });
});

describe("--version", () => {
  it("reports the CLI and the exact SDK it is pinned to", async () => {
    const result = await runCli({ argv: ["--version"] });
    const cli = result.json()["cli"] as Record<string, string>;
    expect(cli["version"]).toMatch(/^\d+\.\d+\.\d+/);
    expect(cli["sdkVersion"]).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.exitCode).toBe(ExitCode.Success);
  });
});
