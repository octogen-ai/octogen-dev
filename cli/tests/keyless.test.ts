/**
 * Keyless behaviour (D9), now that the metered trial is live.
 *
 * `GET /v1/domains`, `POST /v1/products/lookup`, and `POST /v1/products/search`
 * answer with no credential at all, capped at 30 requests per IP per day, with
 * complete untruncated payloads. Everything else on `/v1` refuses.
 *
 * The risk the parent plan names directly: an agent must not read exhaustion as
 * "this merchant is not covered" and abandon a domain we cover. Shared egress
 * makes that common rather than exotic — CI runners, corporate NAT, and cloud
 * sandboxes collide on one address, so the *first* keyless request an agent
 * makes may already be over the cap. The message has to be correct in the case
 * where the agent has done nothing wrong.
 */

import { describe, expect, it } from "vitest";

import { ExitCode } from "../src/exit.js";
import { DOMAINS_BODY, runCli } from "./harness.js";

const EXHAUSTED = {
  body: {
    code: "keyless_trial_exhausted",
    getApiKey: "https://platform.octogen.ai/agent-onboarding/SKILL.md",
    isCoverageAnswer: false,
    keylessTrial: {
      endpoints: [
        "GET /v1/domains",
        "POST /v1/products/lookup",
        "POST /v1/products/search",
      ],
      limit: 30,
      scope: "per client IP address",
      window: "24h",
    },
    message: "Keyless free-trial quota exhausted",
  },
  headers: { "retry-after": "2880" },
  status: 429,
};

describe("the keyless trial", () => {
  it("runs domains, lookup, and search with no credential", async () => {
    const cases: { argv: string[]; route: string; body: unknown }[] = [
      { argv: ["domains"], body: DOMAINS_BODY, route: "GET /domains" },
      {
        argv: ["lookup", "https://lagence.com/products/x"],
        body: { product: { title: "A dress", uuid: "u" }, source: "indexed" },
        route: "POST /products/lookup",
      },
      {
        argv: ["search", "dress"],
        body: { items: [{ productUrl: "https://x.example/p", uuid: "u" }] },
        route: "POST /products/search",
      },
    ];

    for (const scenario of cases) {
      const result = await runCli({
        argv: scenario.argv,
        routes: { [scenario.route]: { body: scenario.body } },
      });
      expect(result.exitCode, scenario.route).toBe(ExitCode.Success);
      // No credential presented — not a blank one, which would earn a 401.
      expect(result.requests[0]?.headers["authorization"]).toBeUndefined();
    }
  });

  it("states the allowance up front, so an agent can budget", async () => {
    const result = await runCli({
      argv: ["domains"],
      routes: { "GET /domains": { body: DOMAINS_BODY } },
    });
    expect(result.stderr).toMatch(/30\s+requests per IP per day/);
    expect(result.stderr).toMatch(/domains, lookup and search/);
    // A diagnostic, not output: stdout stays the one parseable object.
    expect(result.json()["hostCount"]).toBe(4);
  });

  it("does not refuse a key-required command locally", async () => {
    // The server owns the keyless route table. A local copy of it could only
    // ever be stale, and a stale copy would refuse something the server would
    // have answered — a wrong answer produced to save one round trip.
    const result = await runCli({
      argv: ["similar", "https://lagence.com/products/x"],
      routes: {
        "POST /products/more-like-this": {
          body: { code: "keyless_trial_endpoint_not_included", message: "needs a key" },
          status: 401,
        },
      },
    });
    expect(result.requests).toHaveLength(1);
    expect(result.exitCode).toBe(ExitCode.NoCredential);
    expect(result.json()["code"]).toBe("keyless_endpoint_not_included");
  });

  it("exits 5 on exhaustion — never 6", async () => {
    // Mechanism 1 of three. An agent branching on exit codes cannot confuse a
    // throttle with an empty answer, whatever the message says.
    const result = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x"],
      routes: { "GET /domains": EXHAUSTED },
    });
    expect(result.exitCode).toBe(ExitCode.Throttled);
    expect(result.exitCode).not.toBe(ExitCode.NoResult);
  });

  it("reports coverage as unknown, in a field that is always there", async () => {
    // Mechanism 2. `coverage` is on every error body from a coverage-adjacent
    // command, so it never has to be inferred from its own absence.
    const result = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x"],
      routes: { "GET /domains": EXHAUSTED },
    });
    const body = result.json();
    expect(body["coverage"]).toBe("unknown");
    expect(body["code"]).toBe("keyless_quota_exhausted");
    expect(body["retryAfter"]).toBe(2880);
    expect((body["remediation"] as Record<string, string>)["command"]).toBe(
      "octogen init",
    );
  });

  it("says in words that this is not a coverage answer", async () => {
    // Mechanism 3, because an exit code alone does not survive a summary an
    // agent writes for its human.
    const result = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x"],
      routes: { "GET /domains": EXHAUSTED },
    });
    const message = String(result.json()["message"]);
    expect(message).toMatch(/Keyless trial exhausted: 30 requests per IP per day/);
    expect(message).toMatch(/says nothing about whether Octogen covers this merchant/);
    expect(message).toMatch(/Coverage is unknown/);
    expect(message).toMatch(/octogen init/);
    expect(message).not.toMatch(/not covered/i);
  });

  it("never retries an exhausted quota", async () => {
    // The allowance refills over hours. Retrying would spend wall-clock to be
    // refused again.
    const result = await runCli({
      argv: ["domains"],
      routes: { "GET /domains": EXHAUSTED },
    });
    expect(result.requests).toHaveLength(1);
  });

  it("retries free-lane back-pressure, which is transient", async () => {
    const busy = {
      body: { code: "keyless_trial_busy", message: "at the concurrency allowance" },
      headers: { "retry-after": "1" },
      status: 429,
    };
    const result = await runCli({
      argv: ["domains"],
      routes: { "GET /domains": [busy, { body: DOMAINS_BODY }] },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests).toHaveLength(2);
  });

  it("closes the trial rather than opening it when metering is down", async () => {
    const result = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x", "--no-retry"],
      routes: {
        "GET /domains": {
          body: { code: "keyless_trial_unavailable", message: "cannot meter" },
          status: 503,
        },
      },
    });
    // Not a coverage answer either, and not a throttle: the meter is broken.
    expect(result.exitCode).toBe(ExitCode.Unexpected);
    expect(result.json()["coverage"]).toBe("unknown");
    expect(result.stdout).not.toMatch(/not covered/i);
  });

  it("reports keyless.active on status without spending a request", async () => {
    const result = await runCli({ argv: ["status"], routes: {} });
    expect((result.json()["keyless"] as Record<string, unknown>)["active"]).toBe(true);
    // Remaining budget is per-IP and shared across processes behind one egress,
    // so it is only ever reported from the server — never counted locally.
    expect(
      (result.json()["keyless"] as Record<string, unknown>)["remaining"],
    ).toBeNull();
    expect(result.requests).toHaveLength(0);
  });
});
