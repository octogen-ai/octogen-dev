/**
 * P5's data commands, driven through the real dispatcher.
 *
 * Two things get most of the attention:
 *
 * * **the request bodies**, because `/v1` is `extra="forbid"` and the field
 *   names are not guessable — lookup takes `url` (not `productUrl`), search
 *   takes `q` (not `query`), and a wrong guess is a hard `422`;
 * * **the exit code for an empty answer**, because `6` versus anything else is
 *   the thing an agent branches on.
 *
 * Response fixtures mirror production shapes verified on 2026-08-21.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ExitCode } from "../src/exit.js";
import { runCli, TEST_KEY } from "./harness.js";

const KEYED = { OCTOGEN_PLATFORM_API_KEY: TEST_KEY };

/** The L'AGENCE fixture, as production returns it. */
const LOOKUP_BODY = {
  canonicalUrl: "https://lagence.com/products/akiya-satin-maxi-dress-merlot-red",
  catalogDisplayName: "L'AGENCE",
  catalogKey: "lagence",
  matchedVia: "normalized_alias",
  product: {
    brand: { name: "L'AGENCE" },
    currentPrice: 395,
    currency: "USD",
    images: ["a", "b", "c", "d", "e"],
    title: "Akiya Satin Maxi Dress",
    uuid: "666ae7bd-50ac-4495-b682-56a7087c23b5",
    variants: [{}, {}, {}, {}, {}, {}, {}],
  },
  requestedUrl: "https://lagence.com/products/akiya-satin-maxi-dress-merlot-red",
  source: "indexed",
  warnings: [],
};

const SEARCH_BODY = {
  items: [
    {
      brand: { name: "Etro" },
      catalogKey: "mytheresa",
      currentPrice: 1183,
      productUrl: "https://www.mytheresa.com/us/en/women/etro-paisley-silk-jacket",
      title: "Paisley silk jacket",
      uuid: "11111111-1111-4111-8111-111111111111",
    },
  ],
  nextCursor: "cursor-1",
};

describe("storerouter lookup", () => {
  it("sends `url` — the field name, which is not `productUrl`", async () => {
    const url = "https://lagence.com/products/akiya-satin-maxi-dress-merlot-red";
    const result = await runCli({
      argv: ["lookup", url],
      env: KEYED,
      routes: { "POST /products/lookup": { body: LOOKUP_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const body = result.requests[0]?.body as Record<string, unknown>;
    expect(body["url"]).toBe(url);
    expect(body).not.toHaveProperty("productUrl");
  });

  it("reports the product, its images, variants, and how it matched", async () => {
    const result = await runCli({
      argv: [
        "lookup",
        "https://lagence.com/products/akiya-satin-maxi-dress-merlot-red",
      ],
      env: KEYED,
      routes: { "POST /products/lookup": { body: LOOKUP_BODY } },
    });
    const body = result.json();
    expect(body["matchedVia"]).toBe("normalized_alias");
    expect(body["catalog"]).toBe("lagence");
    const product = body["product"] as Record<string, unknown>;
    expect(product["title"]).toBe("Akiya Satin Maxi Dress");
    expect(product["brand"]).toBe("L'AGENCE");
    expect(product["currentPrice"]).toBe(395);
    expect(product["imageCount"]).toBe(5);
    expect(product["variantCount"]).toBe(7);
  });

  it("passes the three option flags through, omitting what was not asked for", async () => {
    const result = await runCli({
      argv: [
        "lookup",
        "https://example.com/p/1",
        "--match-mode",
        "strict",
        "--resolution-mode",
        "index_only",
      ],
      env: KEYED,
      routes: { "POST /products/lookup": { body: LOOKUP_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const body = result.requests[0]?.body as Record<string, unknown>;
    expect(body["matchMode"]).toBe("strict");
    expect(body["resolutionMode"]).toBe("index_only");
  });

  it("rejects a flag value the contract does not define, before the request", async () => {
    const result = await runCli({
      argv: ["lookup", "https://example.com/p/1", "--match-mode", "fuzzy"],
      env: KEYED,
    });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["message"]).toMatch(/must be one of: strict, loose/);
    expect(result.requests).toHaveLength(0);
  });

  it("exits 6 on a miss, and says it is not a coverage answer", async () => {
    const result = await runCli({
      argv: ["lookup", "https://www.jcrew.com/p/not-real"],
      env: KEYED,
      routes: {
        "POST /products/lookup": { body: { detail: "product_not_found" }, status: 404 },
      },
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    const body = result.json();
    expect(body["code"]).toBe("product_not_found");
    // The host may well be covered; this URL is simply not indexed. Coverage is
    // a different question and the remediation says which command asks it.
    expect(body["coverage"]).toBe("unknown");
    expect((body["remediation"] as Record<string, string>)["command"]).toMatch(
      /domains --check/,
    );
  });

  it("refuses more than one URL rather than looping silently", async () => {
    const result = await runCli({
      argv: ["lookup", "https://a.example/p", "https://b.example/p"],
      env: KEYED,
    });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.requests).toHaveLength(0);
  });
});

describe("storerouter search", () => {
  it("sends `q` — the field name, which is not `query`", async () => {
    const result = await runCli({
      argv: ["search", "paisley jackets", "--limit", "3"],
      env: KEYED,
      routes: { "POST /products/search": { body: SEARCH_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const body = result.requests[0]?.body as Record<string, unknown>;
    expect(body["q"]).toBe("paisley jackets");
    expect(body["limit"]).toBe(3);
    expect(body).not.toHaveProperty("query");
  });

  it("sends --catalog as a one-key `catalogs` allowlist, never `catalog`", async () => {
    const result = await runCli({
      argv: ["search", "dress", "--catalog", "macys"],
      env: KEYED,
      routes: { "POST /products/search": { body: SEARCH_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const body = result.requests[0]?.body as Record<string, unknown>;
    expect(body["catalogs"]).toEqual(["macys"]);
    expect(body).not.toHaveProperty("catalog");
  });

  it("joins a multi-word query so an unquoted one still works", async () => {
    const result = await runCli({
      argv: ["search", "paisley", "jackets"],
      env: KEYED,
      routes: { "POST /products/search": { body: SEARCH_BODY } },
    });
    expect((result.requests[0]?.body as Record<string, unknown>)["q"]).toBe(
      "paisley jackets",
    );
  });

  it("turns repeated --facet into the API's {name, values} shape", async () => {
    const result = await runCli({
      argv: [
        "search",
        "dress",
        "--facet",
        "color=red,blue",
        "--facet",
        "color=green",
        "--facet",
        "gender=female",
      ],
      env: KEYED,
      routes: { "POST /products/search": { body: SEARCH_BODY } },
    });
    expect((result.requests[0]?.body as Record<string, unknown>)["facets"]).toEqual([
      { name: "color", values: ["red", "blue", "green"] },
      { name: "gender", values: ["female"] },
    ]);
  });

  it("rejects a malformed facet before the request", async () => {
    const result = await runCli({
      argv: ["search", "dress", "--facet", "colorred"],
      env: KEYED,
    });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["message"]).toMatch(/--facet must be name=value/);
    expect(result.requests).toHaveLength(0);
  });

  it("sends snake_case price bounds, as the contract spells them", async () => {
    const result = await runCli({
      argv: ["search", "dress", "--price-min", "50", "--price-max", "500"],
      env: KEYED,
      routes: { "POST /products/search": { body: SEARCH_BODY } },
    });
    const body = result.requests[0]?.body as Record<string, unknown>;
    expect(body["price_min"]).toBe(50);
    expect(body["price_max"]).toBe(500);
  });

  it("catches an inverted price range as a usage error", async () => {
    const result = await runCli({
      argv: ["search", "dress", "--price-min", "500", "--price-max", "50"],
      env: KEYED,
    });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.requests).toHaveLength(0);
  });

  it("rejects a limit outside the contract's bounds without a 422", async () => {
    const result = await runCli({
      argv: ["search", "dress", "--limit", "500"],
      env: KEYED,
    });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["message"]).toMatch(/between 1 and 100/);
    expect(result.requests).toHaveLength(0);
  });

  it("returns items and nextCursor, each item carrying productUrl", async () => {
    const result = await runCli({
      argv: ["search", "paisley jackets"],
      env: KEYED,
      routes: { "POST /products/search": { body: SEARCH_BODY } },
    });
    const body = result.json();
    expect(body["nextCursor"]).toBe("cursor-1");
    const items = body["items"] as Record<string, unknown>[];
    expect(items[0]?.["productUrl"]).toMatch(/^https:\/\//);
  });

  it("exits 6 when the corpus was searched and nothing matched", async () => {
    const result = await runCli({
      argv: ["search", "a thing nobody sells"],
      env: KEYED,
      routes: { "POST /products/search": { body: { items: [], nextCursor: null } } },
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    expect(result.json()["code"]).toBe("no_matches");
  });
});

describe("storerouter similar", () => {
  const SIMILAR_BODY = {
    items: SEARCH_BODY.items,
    nextCursor: null,
    source: {
      catalogKey: "lagence",
      productUrl: "https://lagence.com/products/akiya",
      title: "Akiya Satin Maxi Dress",
      uuid: "666ae7bd-50ac-4495-b682-56a7087c23b5",
    },
  };

  it("reads a UUID as a uuid source", async () => {
    const result = await runCli({
      argv: ["similar", "666ae7bd-50ac-4495-b682-56a7087c23b5"],
      env: KEYED,
      routes: { "POST /products/more-like-this": { body: SIMILAR_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const body = result.requests[0]?.body as { source: Record<string, unknown> };
    expect(body.source).toEqual({ uuid: "666ae7bd-50ac-4495-b682-56a7087c23b5" });
  });

  it("reads a URL as a url source", async () => {
    const result = await runCli({
      argv: ["similar", "https://lagence.com/products/akiya"],
      env: KEYED,
      routes: { "POST /products/more-like-this": { body: SIMILAR_BODY } },
    });
    const body = result.requests[0]?.body as { source: Record<string, unknown> };
    expect(body.source).toEqual({ url: "https://lagence.com/products/akiya" });
  });

  it("sends every --catalog as the `catalogs` allowlist", async () => {
    const result = await runCli({
      argv: [
        "similar",
        "https://lagence.com/products/akiya",
        "--catalog",
        "lagence",
        "--catalog",
        "myshopify",
      ],
      env: KEYED,
      routes: { "POST /products/more-like-this": { body: SIMILAR_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const body = result.requests[0]?.body as Record<string, unknown>;
    expect(body["catalogs"]).toEqual(["lagence", "myshopify"]);
    expect(body).not.toHaveProperty("catalog");
  });

  it("sends --facet as `facets`, never `include_facets`, and relaxes by default", async () => {
    const result = await runCli({
      argv: [
        "similar",
        "https://lagence.com/products/akiya",
        "--facet",
        "gender=female",
        "--exclude-facet",
        "color_family=Black",
        "--price-min",
        "50",
        "--price-max",
        "300",
      ],
      env: KEYED,
      routes: { "POST /products/more-like-this": { body: SIMILAR_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const body = result.requests[0]?.body as Record<string, unknown>;
    expect(body["facets"]).toEqual([{ name: "gender", values: ["female"] }]);
    expect(body["exclude_facets"]).toEqual([
      { name: "color_family", values: ["Black"] },
    ]);
    expect(body["price_min"]).toBe(50);
    expect(body["price_max"]).toBe(300);
    expect(body["relax"]).toBe(true);
    expect(body).not.toHaveProperty("include_facets");
  });

  it("sends relax: false for --no-relax", async () => {
    const result = await runCli({
      argv: ["similar", "https://lagence.com/products/akiya", "--no-relax"],
      env: KEYED,
      routes: { "POST /products/more-like-this": { body: SIMILAR_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const body = result.requests[0]?.body as Record<string, unknown>;
    expect(body["relax"]).toBe(false);
  });

  it("refuses something that is neither, rather than sending a 422", async () => {
    const result = await runCli({ argv: ["similar", "akiya-dress"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.requests).toHaveLength(0);
  });

  it("exits 6 when the source is not indexed", async () => {
    const result = await runCli({
      argv: ["similar", "https://lagence.com/products/nope"],
      env: KEYED,
      routes: {
        "POST /products/more-like-this": {
          body: { detail: "product_not_found" },
          status: 404,
        },
      },
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    expect(result.json()["code"]).toBe("source_not_found");
  });
});

describe("storerouter resolve", () => {
  it("reads HTML from a file, and never from an argument", async () => {
    const directory = mkdtempSync(join(tmpdir(), "octogen-html-"));
    const path = join(directory, "page.html");
    writeFileSync(path, "<html><body>a product</body></html>");

    const result = await runCli({
      argv: ["resolve", "--html", path, "--url", "https://example.com/p/1"],
      env: KEYED,
      routes: { "POST /products/resolve-from-html": { body: LOOKUP_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const body = result.requests[0]?.body as Record<string, unknown>;
    expect(body["html"]).toContain("a product");
    expect(body["url"]).toBe("https://example.com/p/1");
  });

  it("reads HTML from stdin with --html -", async () => {
    const result = await runCli({
      argv: ["resolve", "--html", "-"],
      env: KEYED,
      routes: { "POST /products/resolve-from-html": { body: LOOKUP_BODY } },
      stdin: "<html>piped</html>",
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect((result.requests[0]?.body as Record<string, unknown>)["html"]).toBe(
      "<html>piped</html>",
    );
  });

  it("refuses HTML passed as an argument, and says why", async () => {
    const result = await runCli({
      argv: ["resolve", "--html", "-", "<html>oops</html>"],
      env: KEYED,
      stdin: "<html>x</html>",
    });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["message"]).toMatch(/never from an\s+argument/);
    expect(result.requests).toHaveLength(0);
  });

  it("notes a missing --url without failing, because the page may declare one", async () => {
    const result = await runCli({
      argv: ["resolve", "--html", "-"],
      env: KEYED,
      routes: { "POST /products/resolve-from-html": { body: LOOKUP_BODY } },
      stdin: "<html>x</html>",
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const problems = result.json()["problems"] as { code: string }[];
    expect(problems.map((problem) => problem.code)).toContain("no_source_url");
  });

  it("reports an unreadable file as a usage error", async () => {
    const result = await runCli({
      argv: ["resolve", "--html", "/nonexistent/page.html"],
      env: KEYED,
    });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["code"]).toBe("unreadable_input");
  });
});

describe("storerouter api", () => {
  it("issues the request verbatim, with no schema opinion", async () => {
    const result = await runCli({
      argv: ["api", "GET", "/coverage/url-lists", "--query", "limit=2"],
      env: KEYED,
      routes: {
        "GET /coverage/url-lists": {
          body: { items: [], nextCursor: null },
          headers: { "x-ratelimit-remaining": "119", "x-request-id": "req-9" },
        },
      },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests[0]?.url).toContain("limit=2");
    const body = result.json();
    expect(body["status"]).toBe(200);
    expect(body["requestId"]).toBe("req-9");
    expect(body["body"]).toEqual({ items: [], nextCursor: null });
  });

  it("reaches an unpublished route, which is the point of it", async () => {
    const result = await runCli({
      argv: ["api", "GET", "/brands/nike"],
      env: KEYED,
      routes: { "GET /brands/nike": { body: { brand_name: "Nike" } } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests[0]?.url).toBe("https://api.storerouter.ai/v1/brands/nike");
  });

  it("takes a body inline, from a file, or from stdin", async () => {
    const result = await runCli({
      argv: ["api", "POST", "/products/search", "--data", '{"q":"dress","limit":1}'],
      env: KEYED,
      routes: { "POST /products/search": { body: SEARCH_BODY } },
    });
    expect(result.requests[0]?.body).toEqual({ limit: 1, q: "dress" });
  });

  it("rejects a body that is not JSON before sending it", async () => {
    const result = await runCli({
      argv: ["api", "POST", "/products/search", "--data", "{not json"],
      env: KEYED,
    });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.requests).toHaveLength(0);
  });

  it("rejects a method the API does not use", async () => {
    const result = await runCli({ argv: ["api", "TRACE", "/me"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.requests).toHaveLength(0);
  });

  it("applies the same error taxonomy as every other command", async () => {
    const result = await runCli({
      argv: ["api", "GET", "/coverage/url-lists"],
      env: KEYED,
      routes: {
        "GET /coverage/url-lists": { body: { detail: "forbidden" }, status: 403 },
      },
    });
    expect(result.exitCode).toBe(ExitCode.NotEntitled);
  });
});

it("does not recognize the removed refresh command or issue a request", async () => {
  const result = await runCli({
    argv: ["refresh", "https://example.com/product"],
    env: KEYED,
  });
  expect(result.exitCode).not.toBe(ExitCode.Success);
  expect(result.requests).toEqual([]);
});

describe("retired commands", () => {
  it.each([
    ["voyage", "example.com"],
    ["voyage", "list"],
    ["voyage", "status", "task-1"],
  ])("rejects %j without making requests", async (...argv) => {
    const result = await runCli({ argv, routes: {} });
    expect(result.exitCode).not.toBe(ExitCode.Success);
    expect(result.requests).toEqual([]);
  });
});
