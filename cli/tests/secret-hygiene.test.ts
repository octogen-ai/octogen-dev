/**
 * The CI assertion the design asks for by name, in **both directions**:
 *
 * * the key's secret segment never appears in `status` output, on either
 *   stream; **and**
 * * `status --json` carries a well-formed `auth.keyPrefix`.
 *
 * The second half is not decoration. An absence-only test passes just as
 * happily when redaction has eaten the whole field, and a `status` that prints
 * `[redacted]` where its contract promises `auth.keyPrefix` is broken in a way
 * whose obvious fix is to weaken redaction — which is the wrong direction on
 * the one control keeping a credential out of an agent transcript.
 */

import { describe, expect, it } from "vitest";

import { ExitCode } from "../src/exit.js";
import {
  DOMAINS_BODY,
  ME_BODY,
  runCli,
  TEST_KEY,
  TEST_KEY_ID,
  TEST_KEY_PREFIX,
  TEST_SECRET,
} from "./harness.js";

const ROUTES = {
  "GET /domains": { body: DOMAINS_BODY, headers: { etag: '"v1"' } },
  "GET /me": { body: ME_BODY },
};

/** The shape `status` promises: `octo_live_` plus 10–32 hex, and no more. */
const KEY_PREFIX_SHAPE = /^octo_(?:live|test)_[0-9a-f]{10,32}$/;

describe("status output never carries key material", () => {
  it("keeps the secret segment out of both streams", async () => {
    const result = await runCli({
      argv: ["status", "--verbose"],
      env: { OCTOGEN_PLATFORM_API_KEY: TEST_KEY },
      routes: ROUTES,
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).not.toContain(TEST_SECRET);
    expect(result.stderr).not.toContain(TEST_SECRET);
    expect(result.stdout).not.toContain(TEST_KEY);
  });

  it("carries a well-formed auth.keyPrefix", async () => {
    const result = await runCli({
      argv: ["status"],
      env: { OCTOGEN_PLATFORM_API_KEY: TEST_KEY },
      routes: ROUTES,
    });
    const auth = result.json()["auth"] as Record<string, unknown>;
    expect(auth["keyPrefix"]).toBe(TEST_KEY_PREFIX);
    expect(String(auth["keyPrefix"])).toMatch(KEY_PREFIX_SHAPE);
    expect(auth["keyId"]).toBe(TEST_KEY_ID);
    expect(auth["source"]).toBe("env");
  });

  it("carries the prefix in human mode too", async () => {
    const result = await runCli({
      argv: ["status"],
      env: { OCTOGEN_PLATFORM_API_KEY: TEST_KEY },
      isTty: true,
      routes: ROUTES,
    });
    expect(result.stdout).toContain(TEST_KEY_PREFIX);
    expect(result.stdout).not.toContain(TEST_SECRET);
  });

  it("keeps the Authorization header out of --verbose header dumps", async () => {
    const result = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x", "--verbose"],
      env: { OCTOGEN_PLATFORM_API_KEY: TEST_KEY },
      routes: {
        "GET /domains": { body: { detail: "Invalid API key" }, status: 401 },
      },
    });
    // The failing request's headers are traced; the credential must not be.
    expect(result.stderr).not.toContain(TEST_SECRET);
    expect(result.stderr).not.toContain(TEST_KEY);
  });

  it("sends the credential but never echoes it", async () => {
    const result = await runCli({
      argv: ["status"],
      env: { OCTOGEN_PLATFORM_API_KEY: TEST_KEY },
      routes: ROUTES,
    });
    // It really was used — otherwise this test would pass on a CLI that simply
    // never authenticated.
    expect(result.requests[0]?.headers["authorization"]).toBe(`Bearer ${TEST_KEY}`);
    expect(result.stdout + result.stderr).not.toContain(TEST_SECRET);
  });

  it("keeps a leaked key out of an error message, degraded to its prefix", async () => {
    // A server that echoes the presented key back in an error body is exactly
    // the case a `[redacted]`-everything layer would render useless.
    const result = await runCli({
      argv: ["status"],
      env: { OCTOGEN_PLATFORM_API_KEY: TEST_KEY },
      routes: {
        "GET /me": { body: { detail: `Invalid API key: ${TEST_KEY}` }, status: 401 },
      },
    });
    expect(result.exitCode).toBe(ExitCode.NoCredential);
    expect(result.stdout).not.toContain(TEST_SECRET);
    expect(result.stdout).toContain(TEST_KEY_PREFIX);
  });
});

describe("there is no --api-key flag", () => {
  it("because argv is echoed verbatim into agent transcripts", async () => {
    const result = await runCli({ argv: ["status", "--api-key", TEST_KEY] });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["code"]).toBe("unknown_option");
    // And the refusal itself must not print what was passed.
    expect(result.stdout).not.toContain(TEST_SECRET);
  });
});

describe("credential resolution order", () => {
  it("prefers --api-key-stdin over the environment", async () => {
    const other = `octo_live_${"a".repeat(32)}_${TEST_SECRET}`;
    const result = await runCli({
      argv: ["status", "--api-key-stdin"],
      env: { OCTOGEN_PLATFORM_API_KEY: other },
      routes: ROUTES,
      stdin: `${TEST_KEY}\n`,
    });
    expect((result.json()["auth"] as Record<string, unknown>)["source"]).toBe("stdin");
    expect(result.requests[0]?.headers["authorization"]).toBe(`Bearer ${TEST_KEY}`);
  });

  it("prefers OCTOGEN_PLATFORM_API_KEY over the deprecated OCTO_API_KEY", async () => {
    const legacy = `octo_live_${"b".repeat(32)}_${TEST_SECRET}`;
    const result = await runCli({
      argv: ["status"],
      env: { OCTO_API_KEY: legacy, OCTOGEN_PLATFORM_API_KEY: TEST_KEY },
      routes: ROUTES,
    });
    expect((result.json()["auth"] as Record<string, unknown>)["source"]).toBe("env");
    expect(result.requests[0]?.headers["authorization"]).toBe(`Bearer ${TEST_KEY}`);
  });

  it("accepts OCTO_API_KEY with a deprecation notice", async () => {
    const result = await runCli({
      argv: ["status"],
      env: { OCTO_API_KEY: TEST_KEY },
      routes: ROUTES,
    });
    expect((result.json()["auth"] as Record<string, unknown>)["source"]).toBe(
      "env-deprecated",
    );
    expect(result.stderr).toMatch(/OCTO_API_KEY is deprecated/);
  });

  it("refuses a malformed key without spending a request", async () => {
    const result = await runCli({
      argv: ["status"],
      env: { OCTOGEN_PLATFORM_API_KEY: "not-a-key-at-all" },
      routes: ROUTES,
    });
    expect(result.exitCode).toBe(ExitCode.NoCredential);
    expect(result.json()["code"]).toBe("malformed_credential");
    expect(result.requests).toHaveLength(0);
    // Only the length, never the value: a non-minted string may still be a
    // secret of some other shape.
    expect(result.json()["message"]).toMatch(/16 characters/);
    expect(result.stdout).not.toContain("not-a-key-at-all");
  });
});
