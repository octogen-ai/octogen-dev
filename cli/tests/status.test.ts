/**
 * `octogen status`, whose output is a contract because an agent parses it to
 * decide whether onboarding worked.
 *
 * The load-bearing test is the probe one. `GET /v1/domains` now answers `200`
 * with **no credential at all**, so a `status` built on it would report a
 * healthy install to a caller with no key — the exact false positive the keyless
 * trial introduced. `status` must probe a key-required route.
 */

import { describe, expect, it } from "vitest";

import { ExitCode } from "../src/exit.js";
import { DOMAINS_BODY, ME_BODY, runCli, TEST_KEY, TEST_KEY_PREFIX } from "./harness.js";

const KEYED = { OCTOGEN_PLATFORM_API_KEY: TEST_KEY };

describe("the auth probe", () => {
  it("is GET /me, a key-required route — never GET /domains", async () => {
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      routes: { "GET /me": { body: ME_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    // One request, and it is the identity question. `/domains` would answer 200
    // for a caller with no key at all, which is why it is not this.
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.url).toBe("https://api.octogen.ai/v1/me");
    expect((result.json()["api"] as Record<string, unknown>)["probe"]).toBe("GET /me");
  });

  it("never calls /domains, even though the coverage cache would like it to", async () => {
    // `status` mutates nothing, including the coverage cache: it is the one
    // command safe to run in a loop.
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      routes: { "GET /domains": { body: DOMAINS_BODY }, "GET /me": { body: ME_BODY } },
    });
    expect(result.requests.map((request) => request.url)).toEqual([
      "https://api.octogen.ai/v1/me",
    ]);
  });

  it("falls back to GET /voyage?limit=1 when /me is not deployed", async () => {
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      routes: {
        "GET /me": { body: { detail: "Not Found" }, status: 404 },
        "GET /voyage": {
          body: {
            items: [],
            quotas: {
              concurrent: { limit: 2, used: 0 },
              monthly: { limit: 25, used: 1 },
            },
          },
        },
      },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect((result.json()["api"] as Record<string, unknown>)["probe"]).toBe(
      "GET /voyage?limit=1",
    );
    const problems = result.json()["problems"] as { code: string }[];
    expect(problems.map((problem) => problem.code)).toContain("me_unavailable");
    // Quota still comes back: it rides that same response.
    expect(result.json()["quota"]).toMatchObject({
      voyage: { monthly: { limit: 25, used: 1 } },
    });
  });

  it("does not fall back for a real failure — only for a 404", async () => {
    const result = await runCli({
      // --no-retry so this is one request rather than the three a 5xx earns.
      argv: ["status", "--no-retry"],
      env: KEYED,
      routes: { "GET /me": { body: { detail: "Internal Server Error" }, status: 500 } },
    });
    expect(result.exitCode).toBe(ExitCode.Unexpected);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.url).toBe("https://api.octogen.ai/v1/me");
  });

  it("retries a 5xx three times before giving up", async () => {
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      routes: { "GET /me": { body: { detail: "Internal Server Error" }, status: 500 } },
    });
    expect(result.exitCode).toBe(ExitCode.Unexpected);
    expect(result.requests).toHaveLength(3);
  });
});

describe("the status envelope", () => {
  it("fills every block from one round trip", async () => {
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      routes: { "GET /me": { body: ME_BODY } },
    });
    const body = result.json();

    expect(body["ok"]).toBe(true);
    expect(body["exitCode"]).toBe(ExitCode.Success);

    const cli = body["cli"] as Record<string, string>;
    expect(cli["version"]).toMatch(/^\d+\.\d+\.\d+/);
    expect(cli["sdkVersion"]).toMatch(/^\d+\.\d+\.\d+/);
    expect(cli["node"]).toBe(process.versions.node);

    expect(body["auth"]).toEqual({
      keyId: "3f9c1a2b4d5e6f708192a3b4c5d6e7f8",
      keyPrefix: TEST_KEY_PREFIX,
      // Omitted (not null) by the server until the parent plan's Phase 2 adds
      // the column; an absent field reads as unknown, which is `null` here.
      keySource: null,
      path: null,
      source: "env",
      state: "ok",
    });

    expect(body["org"]).toEqual({
      name: "Acme Co",
      principal: "api_key",
      slug: "acme-co",
      source: "api",
      type: "catalog_partner",
      typeLabel: "Developer",
    });

    expect(body["quota"]).toEqual({
      rateLimit: { limit: 120, remaining: 118, resetAt: "2026-08-21T14:31:00Z" },
      voyage: {
        concurrent: { limit: 2, used: 0 },
        monthly: { limit: 25, resetsAt: "2026-09-01T00:00:00Z", used: 3 },
      },
    });

    expect(body["keyless"]).toEqual({ active: false, remaining: null });
    expect(body["problems"]).toEqual([]);
  });

  it("reports every field even when it cannot fill them", async () => {
    // An agent must never have to tell "absent" from "we could not tell".
    const result = await runCli({ argv: ["status"], routes: {} });
    expect(result.exitCode).toBe(ExitCode.NoCredential);
    const body = result.json();
    for (const key of ["cli", "auth", "org", "api", "quota", "keyless"]) {
      expect(body, `${key} must always be present`).toHaveProperty(key);
    }
    expect((body["org"] as Record<string, unknown>)["slug"]).toBeNull();
  });

  it("exits 4 and says so for an organization that is not a Developer org", async () => {
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      routes: {
        "GET /me": {
          body: {
            ...ME_BODY,
            organization: { ...ME_BODY.organization, type: "merchant" },
          },
        },
      },
    });
    expect(result.exitCode).toBe(ExitCode.NotEntitled);
    const body = result.json();
    expect(body["ok"]).toBe(false);
    expect((body["org"] as Record<string, unknown>)["typeLabel"]).toBe("Merchant");
    const problems = body["problems"] as { code: string }[];
    expect(problems.map((problem) => problem.code)).toContain("not_entitled");
  });

  it("handles a super-admin bearer, which is org-less by construction", async () => {
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      routes: {
        "GET /me": {
          body: {
            key: null,
            organization: null,
            principal: "super_admin",
            quotas: null,
            rateLimit: null,
          },
        },
      },
    });
    // Not a failure: `principal` says which case this is, and a null org is not
    // an unentitled one.
    expect(result.exitCode).toBe(ExitCode.Success);
    expect((result.json()["org"] as Record<string, unknown>)["principal"]).toBe(
      "super_admin",
    );
  });

  it("exits 3 with no key, and never spends a keyless request to find out", async () => {
    const result = await runCli({ argv: ["status"], routes: {} });
    expect(result.exitCode).toBe(ExitCode.NoCredential);
    expect(result.requests).toHaveLength(0);
    expect((result.json()["keyless"] as Record<string, unknown>)["active"]).toBe(true);
  });

  it("exits 3 with no key under --offline too", async () => {
    // Same answer to "am I onboarded?" whether or not the network was consulted.
    const result = await runCli({ argv: ["status", "--offline"], routes: {} });
    expect(result.exitCode).toBe(ExitCode.NoCredential);
    expect(result.json()["offline"]).toBe(true);
  });

  it("reports a key without verifying it under --offline", async () => {
    const result = await runCli({
      argv: ["status", "--offline"],
      env: KEYED,
      routes: {},
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests).toHaveLength(0);
    const auth = result.json()["auth"] as Record<string, unknown>;
    expect(auth["state"]).toBe("unknown");
    expect(auth["keyPrefix"]).toBe(TEST_KEY_PREFIX);
  });

  it("distinguishes revoked from invalid, since P3 made that possible", async () => {
    const revoked = await runCli({
      argv: ["status"],
      env: KEYED,
      routes: { "GET /me": { body: { detail: "API key revoked" }, status: 401 } },
    });
    expect(revoked.exitCode).toBe(ExitCode.NoCredential);
    expect(revoked.json()["code"]).toBe("credential_revoked");

    const invalid = await runCli({
      argv: ["status"],
      env: KEYED,
      routes: { "GET /me": { body: { detail: "Invalid API key" }, status: 401 } },
    });
    expect(invalid.json()["code"]).toBe("credential_invalid");
  });

  it("exits 5 when throttled, so a retry loop can back off", async () => {
    const result = await runCli({
      argv: ["status", "--no-retry"],
      env: KEYED,
      routes: {
        "GET /me": {
          body: { code: "rate_limit_exceeded" },
          headers: { "retry-after": "30" },
          status: 429,
        },
      },
    });
    expect(result.exitCode).toBe(ExitCode.Throttled);
    expect(result.json()["retryAfter"]).toBe(30);
  });

  it("exits 1 when the API is unreachable", async () => {
    // No scripted route: the harness throws, which is what a network failure
    // looks like from inside the SDK.
    const result = await runCli({
      argv: ["status", "--no-retry"],
      env: KEYED,
      routes: {},
    });
    expect(result.exitCode).toBe(ExitCode.Unexpected);
    expect(result.json()["code"]).toBe("connection_failed");
  });

  it("points at the Python CLI for coverage URL lists", async () => {
    // The eight excluded operations have a first-class CLI; `status` says where.
    const result = await runCli({
      argv: ["status"],
      env: KEYED,
      isTty: true,
      routes: { "GET /me": { body: ME_BODY } },
    });
    expect(result.stdout).toMatch(/octogen-url-lists/);
  });
});
