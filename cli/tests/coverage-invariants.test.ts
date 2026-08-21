/**
 * The coverage invariant, which is the most expensive thing in the CLI to get
 * wrong.
 *
 * `GET /v1/domains` returns hosts normalized — lowercased, leading `www.`
 * stripped — so it reports `macys.com` and never `www.macys.com`. Zero of the
 * 416 live entries carry `www.`; real product URLs overwhelmingly do. A raw
 * comparison therefore reports "not covered" for a covered merchant, and
 * nothing errors: the agent just abandons a domain that would have answered.
 * That bug shipped in the live `SKILL.md`.
 *
 * Two invariants, both asserted here against the real dispatcher:
 *
 * 1. a `www.` product URL matches an apex-only list;
 * 2. `covered: false` and the words "not covered" appear **only** when the
 *    answer came from a coverage snapshot the server confirmed. Every other
 *    path — exhaustion, `401`, `403`, a timeout — says `coverage: "unknown"`.
 */

import { describe, expect, it } from "vitest";

import { ExitCode } from "../src/exit.js";
import { DOMAINS_BODY, runCli, TEST_KEY } from "./harness.js";

const KEYED = { OCTOGEN_PLATFORM_API_KEY: TEST_KEY };
const DOMAINS_OK = {
  "GET /domains": { body: DOMAINS_BODY, headers: { etag: '"v1"' } },
};

describe("octogen domains --check", () => {
  it("reports a www. product URL as covered against an apex-only list", async () => {
    // The regression test for the shipped bug. Every one of these is covered,
    // and a client comparing raw hosts would call all of them uncovered.
    for (const url of [
      "https://www.macys.com/shop/product/some-dress?ID=1",
      "https://www.etro.com/us-en/cashmere-overshirt-MRBA008599TU2K3F0257.html",
      "https://www.jcrew.com/p/mens/categories/clothing/pajamas-and-loungewear/robes/fleece-robe/BM002",
    ]) {
      const result = await runCli({
        argv: ["domains", "--check", url],
        env: KEYED,
        routes: DOMAINS_OK,
      });
      expect(result.exitCode, `${url} should be covered`).toBe(ExitCode.Success);
      expect(result.json()["covered"]).toBe(true);
      expect(result.json()["coverage"]).toBe("covered");
    }
  });

  it("reports every catalog claiming a host, because two can", async () => {
    // `lagence.com` is claimed by both `lagence` and `myshopify` in production.
    const result = await runCli({
      argv: [
        "domains",
        "--check",
        "https://lagence.com/products/akiya-satin-maxi-dress",
      ],
      env: KEYED,
      routes: DOMAINS_OK,
    });
    expect(result.json()["catalogs"]).toEqual(["lagence", "myshopify"]);
  });

  it("exits 6 — and only 6 — for a host the server's list does not carry", async () => {
    const result = await runCli({
      argv: ["domains", "--check", "https://www.not-a-merchant-we-cover.example/p/1"],
      env: KEYED,
      routes: DOMAINS_OK,
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    const body = result.json();
    expect(body["covered"]).toBe(false);
    expect(body["coverage"]).toBe("not_covered");
    expect(body["code"]).toBe("host_not_covered");
  });

  it("never says 'not covered' when the request was refused", async () => {
    // The whole point. Exhaustion, no credential, not entitled, a 5xx: each is
    // a different exit code, and none of them is a coverage answer.
    const refusals = [
      {
        exit: ExitCode.Throttled,
        route: {
          body: {
            code: "keyless_trial_exhausted",
            isCoverageAnswer: false,
            message: "quota exhausted",
          },
          headers: { "retry-after": "2880" },
          status: 429,
        },
        what: "keyless exhaustion",
        withKey: false,
      },
      {
        exit: ExitCode.NoCredential,
        route: { body: { detail: "Invalid API key" }, status: 401 },
        what: "an invalid key",
        withKey: true,
      },
      {
        exit: ExitCode.NotEntitled,
        route: { body: { detail: "forbidden" }, status: 403 },
        what: "a merchant organization",
        withKey: true,
      },
      {
        exit: ExitCode.Unexpected,
        route: { body: { detail: "Internal Server Error" }, status: 500 },
        what: "a 5xx",
        withKey: true,
      },
    ];

    for (const refusal of refusals) {
      const result = await runCli({
        argv: ["domains", "--check", "https://www.macys.com/shop/product/x"],
        ...(refusal.withKey ? { env: KEYED } : {}),
        routes: { "GET /domains": refusal.route },
      });
      expect(result.exitCode, refusal.what).toBe(refusal.exit);
      const body = result.json();
      expect(body["coverage"], refusal.what).toBe("unknown");
      expect(body).not.toHaveProperty("covered");
      // Neither stream may contain the phrase, because an agent reading stderr
      // could act on it just as readily as one parsing stdout.
      expect(result.stdout, refusal.what).not.toMatch(/not covered/i);
      expect(result.stderr, refusal.what).not.toMatch(/not covered/i);
    }
  });

  it("tells an agent that an exhausted quota is not a coverage answer", async () => {
    const result = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x", "--no-json"],
      isTty: true,
      routes: {
        "GET /domains": {
          body: { code: "keyless_trial_exhausted", message: "exhausted" },
          headers: { "retry-after": "3600" },
          status: 429,
        },
      },
    });
    expect(result.exitCode).toBe(ExitCode.Throttled);
    expect(result.stdout).toMatch(/says nothing about whether Octogen covers/);
    expect(result.stdout).toMatch(/Coverage is unknown/);
    expect(result.stdout).toMatch(/octogen init/);
  });

  it("caches with the ETag and revalidates with If-None-Match", async () => {
    // Two runs in one temp cache dir: the second must send the ETag. Run
    // separately because each `runCli` gets a fresh cache by design, so this
    // one shares a directory on purpose.
    const first = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x", "--verbose"],
      env: KEYED,
      routes: DOMAINS_OK,
    });
    expect(first.exitCode).toBe(ExitCode.Success);
    expect(first.json()["source"]).toBe("api");
    expect(first.requests[0]?.headers["if-none-match"]).toBeUndefined();
  });

  it("re-fetches rather than trusting a corrupt cache", async () => {
    const result = await runCli({
      argv: ["domains", "--check", "https://www.macys.com/x", "--no-cache"],
      env: KEYED,
      routes: DOMAINS_OK,
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests).toHaveLength(1);
  });

  it("lists hosts normalized, with their catalogs", async () => {
    const result = await runCli({
      argv: ["domains"],
      env: KEYED,
      routes: DOMAINS_OK,
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const body = result.json();
    expect(body["hosts"]).toEqual([
      "etro.com",
      "jcrew.com",
      "lagence.com",
      "macys.com",
    ]);
    expect(body["hostCount"]).toBe(4);
    expect(body["catalogCount"]).toBe(5);
  });

  it("refuses a positional and points at --check", async () => {
    const result = await runCli({
      argv: ["domains", "https://www.macys.com/x"],
      env: KEYED,
    });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["message"]).toMatch(/did you mean --check/);
    // Nothing was requested: a usage error must not spend a request.
    expect(result.requests).toHaveLength(0);
  });
});
