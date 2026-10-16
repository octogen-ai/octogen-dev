import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveKey } from "../src/auth.js";
import { cachePath } from "../src/coverage.js";
import { DOMAINS_BODY, ME_BODY, runCli, TEST_KEY, TEST_SECRET } from "./harness.js";

const other = `octo_live_${"a".repeat(32)}_${TEST_SECRET}`;

describe("StoreRouter configuration compatibility", () => {
  it.each([
    [{ STOREROUTER_API_KEY: TEST_KEY, OCTOGEN_PLATFORM_API_KEY: other }, TEST_KEY],
    [{ STOREROUTER_API_KEY: " ", OCTOGEN_PLATFORM_API_KEY: TEST_KEY }, TEST_KEY],
    [{ OCTOGEN_PLATFORM_API_KEY: TEST_KEY, OCTO_API_KEY: other }, TEST_KEY],
    [{ OCTO_API_KEY: TEST_KEY }, TEST_KEY],
  ])("selects one credential without changing auth.source", async (env, key) => {
    const result = await runCli({
      argv: ["status"],
      env,
      routes: { "GET /me": { body: ME_BODY } },
    });
    expect(result.exitCode).toBe(0);
    expect(result.requests[0]?.headers["authorization"]).toBe(`Bearer ${key}`);
    expect(result.stdout + result.stderr).not.toContain(TEST_SECRET);
    expect((result.json()["auth"] as Record<string, unknown>)["source"]).toBe(
      "OCTO_API_KEY" in env && env.OCTO_API_KEY === TEST_KEY ? "env-deprecated" : "env",
    );
  });

  it("keeps stdin and file above process env, and process env above dotenv", () => {
    const env = { STOREROUTER_API_KEY: other };
    expect(
      resolveKey({ apiKeyStdin: true, env, readStdin: () => TEST_KEY }).apiKey,
    ).toBe(TEST_KEY);
    expect(
      resolveKey({ apiKeyFile: "key", env, readFile: () => TEST_KEY }).apiKey,
    ).toBe(TEST_KEY);
    expect(
      resolveKey({
        env: { OCTOGEN_PLATFORM_API_KEY: TEST_KEY },
        readFile: () => `STOREROUTER_API_KEY=${other}`,
      }).apiKey,
    ).toBe(TEST_KEY);
  });

  it("uses name order within dotenv, nearest file first, and stops at .git", () => {
    const root = mkdtempSync(join(tmpdir(), "storerouter-env-"));
    try {
      const child = join(root, "child");
      mkdirSync(child);
      writeFileSync(join(root, ".git"), "gitdir: test\n");
      writeFileSync(join(root, ".env"), `STOREROUTER_API_KEY=${other}\n`);
      writeFileSync(join(child, ".env"), `OCTOGEN_PLATFORM_API_KEY=${TEST_KEY}\n`);
      expect(resolveKey({ cwd: child, env: {} }).apiKey).toBe(TEST_KEY);
      writeFileSync(
        join(child, ".env"),
        `OCTO_API_KEY=${other}\nOCTOGEN_PLATFORM_API_KEY=${other}\nSTOREROUTER_API_KEY=${TEST_KEY}\n`,
      );
      expect(resolveKey({ cwd: child, env: {} }).apiKey).toBe(TEST_KEY);
      const readPaths: string[] = [];
      expect(
        resolveKey({
          cwd: root,
          env: {},
          readFile: (file) => {
            readPaths.push(file);
            return "";
          },
        }).source,
      ).toBe("keyless");
      expect(readPaths).toEqual([join(root, ".env")]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("fails on the selected malformed primary key instead of using a legacy key", async () => {
    const result = await runCli({
      argv: ["status"],
      env: { STOREROUTER_API_KEY: "invalid", OCTOGEN_PLATFORM_API_KEY: TEST_KEY },
    });
    expect(result.exitCode).toBe(3);
    expect(result.requests).toHaveLength(0);
    expect(result.json()["message"]).toContain("STOREROUTER_API_KEY");
  });

  it.each([
    [[], {}, "https://api.storerouter.ai/v1"],
    [
      [],
      {
        STOREROUTER_BASE_URL: "https://primary.example/v1",
        OCTOGEN_BASE_URL: "https://legacy.example/v1",
      },
      "https://primary.example/v1",
    ],
    [
      [],
      { STOREROUTER_BASE_URL: " ", OCTOGEN_BASE_URL: "https://legacy.example/v1" },
      "https://legacy.example/v1",
    ],
    [
      ["--base-url", "https://flag.example/v1"],
      { STOREROUTER_BASE_URL: "https://primary.example/v1" },
      "https://flag.example/v1",
    ],
  ])(
    "uses the same base URL for requests, status, and coverage",
    async (flags, env, base) => {
      const status = await runCli({
        argv: ["status", ...flags],
        env: { ...env, STOREROUTER_API_KEY: TEST_KEY },
        routes: { "GET /me": { body: ME_BODY } },
      });
      expect(status.requests[0]?.url).toBe(`${base}/me`);
      expect((status.json()["api"] as Record<string, unknown>)["baseUrl"]).toBe(base);
      const domains = await runCli({
        argv: ["domains", ...flags],
        env,
        routes: { "GET /domains": { body: DOMAINS_BODY } },
      });
      expect(domains.requests[0]?.url).toBe(`${base}/domains`);
    },
  );

  it.each(["", " ", "\t"])("ignores a blank StoreRouter cache directory", (value) => {
    const options = { baseUrl: "https://api.storerouter.ai/v1", keyPrefix: undefined };
    expect(
      cachePath({
        ...options,
        env: { STOREROUTER_CACHE_DIR: value, OCTOGEN_CACHE_DIR: "/legacy" },
      }),
    ).toBe(cachePath({ ...options, env: { OCTOGEN_CACHE_DIR: "/legacy" } }));
    expect(
      cachePath({
        ...options,
        env: { STOREROUTER_CACHE_DIR: value, XDG_CACHE_HOME: "/xdg" },
      }),
    ).toContain("/xdg/octogen/domains/");
  });

  it("preserves the default cache root and credential/base URL isolation", () => {
    const options = { baseUrl: "https://api.storerouter.ai/v1", keyPrefix: undefined };
    const legacy = cachePath({ ...options, env: { OCTOGEN_CACHE_DIR: "/legacy" } });
    expect(
      cachePath({
        ...options,
        env: { STOREROUTER_CACHE_DIR: "/new", OCTOGEN_CACHE_DIR: "/legacy" },
      }),
    ).toBe(legacy.replace("/legacy/", "/new/"));
    expect(cachePath({ ...options, env: { XDG_CACHE_HOME: "/xdg" } })).toContain(
      "/xdg/octogen/domains/",
    );
    expect(
      cachePath({
        ...options,
        baseUrl: "https://api.octogen.ai/v1",
        env: { OCTOGEN_CACHE_DIR: "/legacy" },
      }),
    ).not.toBe(legacy);
    expect(
      cachePath({
        ...options,
        keyPrefix: "another",
        env: { OCTOGEN_CACHE_DIR: "/legacy" },
      }),
    ).not.toBe(legacy);
  });
});

describe("parse is exactly lookup", () => {
  it.each([
    [[], {}, 2],
    [
      [
        "https://example.com/p",
        "--resolution-mode",
        "index_only",
        "--on-demand-cache-policy",
        "prefer_cache",
      ],
      {
        status: 200,
        body: {
          product: { title: "Product", images: [], variants: [] },
          catalogKey: "example",
          requestedUrl: "https://example.com/p",
          canonicalUrl: "https://example.com/p",
          matchedVia: "normalized_alias",
          source: "indexed",
          warnings: [],
        },
      },
      0,
    ],
    [
      ["https://example.com/p"],
      { status: 404, body: { detail: "product_not_found" } },
      6,
    ],
    [
      ["https://example.com/p", "--match-mode", "strict"],
      { status: 429, body: { detail: "Throttled" } },
      5,
    ],
    [["--help"], {}, 0],
    [["https://example.com/p", "--ships-to", "US"], {}, 2],
    [["https://example.com/p", "--currency", "USD"], {}, 2],
  ] as const)(
    "preserves requests, output and exit codes",
    async (args, response, code) => {
      const invoke = (command: string) =>
        runCli({
          argv: [command, ...args],
          routes: { "POST /products/lookup": response },
        });
      const lookup = await invoke("lookup");
      const parse = await invoke("parse");
      expect(parse.exitCode).toBe(code);
      expect(parse.exitCode).toBe(lookup.exitCode);
      expect(parse.stdout).toBe(lookup.stdout);
      expect(parse.stderr).toBe(lookup.stderr);
      expect(parse.requests).toEqual(lookup.requests);
    },
  );
});
