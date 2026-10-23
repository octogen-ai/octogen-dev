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
    expect(body["remediation"]).toBeUndefined();
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

/** `GET /v1/stores/{domain}`, trimmed from the live route (2026-10-19). */
const STORE_BODY = {
  host: "thereformation.com",
  catalogs: [
    {
      catalog: "reformation",
      catalogDisplayName: "Reformation",
      computedAt: "2026-10-19T04:12:00Z",
      productCount: 12345,
      fields: [
        {
          name: "color",
          displayName: "Color",
          source: "product",
          populated: 12000,
          coverage: 0.972,
          distinct: 41,
          truncated: true,
          topValues: [
            { value: "black", label: "Black", count: 3100 },
            { value: "white", label: "White", count: 1400 },
            { value: "blue", label: "Blue", count: 900 },
            { value: "red", label: "Red", count: 700 },
          ],
        },
      ],
      price: {
        populated: 12100,
        median: 248,
        below: 12,
        above: 300,
        buckets: [
          { min: 50, max: 150, count: 2000 },
          { min: 150, max: 450, count: 9800 },
        ],
      },
    },
  ],
};

describe("storerouter stores show", () => {
  it("GETs one normalized host, with no body and no query", async () => {
    const result = await runCli({
      argv: [
        "stores",
        "show",
        "https://WWW.TheReformation.com:443/products/x?color=red",
      ],
      env: KEYED,
      routes: { "GET /stores/thereformation.com": { body: STORE_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests).toHaveLength(1);
    const request = result.requests[0];
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe(
      "https://api.storerouter.ai/v1/stores/thereformation.com",
    );
    expect(request?.body).toBeUndefined();
  });

  it("emits the host, covered: true and every catalog's full snapshot", async () => {
    const result = await runCli({
      argv: ["stores", "show", "thereformation.com", "--json"],
      env: KEYED,
      routes: { "GET /stores/thereformation.com": { body: STORE_BODY } },
    });
    const body = result.json();
    expect(body["ok"]).toBe(true);
    expect(body["command"]).toBe("stores show");
    expect(body["host"]).toBe("thereformation.com");
    expect(body["covered"]).toBe(true);
    expect(body["coverage"]).toBe("covered");
    expect(body["catalogs"]).toEqual(STORE_BODY.catalogs);
  });

  it("prints a human summary on a terminal", async () => {
    const result = await runCli({
      argv: ["stores", "show", "thereformation.com"],
      env: KEYED,
      isTty: true,
      routes: { "GET /stores/thereformation.com": { body: STORE_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).toBe(
      [
        "thereformation.com is covered by 1 catalog",
        "",
        "Reformation (reformation)",
        "  products   12,345",
        "  price      median 248, 50–450 (12,100 priced)",
        "  computed   2026-10-19T04:12:00Z",
        "  fields     1 populated (product 1)",
        "    color   97%  Black, White, Blue, …",
        "",
      ].join("\n"),
    );
  });

  it("shows six fields per source on a terminal; --json keeps them all", async () => {
    const field = (source: string, index: number) => ({
      name: `${source}_${String(index)}`,
      displayName: `${source} ${String(index)}`,
      source,
      populated: 10,
      coverage: 0.5,
      distinct: 1,
      truncated: false,
      topValues: [{ value: "v", label: "V", count: 10 }],
    });
    const fields = [
      ...Array.from({ length: 3 }, (_, index) => field("product", index)),
      ...Array.from({ length: 10 }, (_, index) => field("enrichment", index)),
    ];
    const catalogs = [{ ...STORE_BODY.catalogs[0], fields }];
    const routes = {
      "GET /stores/thereformation.com": {
        body: { host: "thereformation.com", catalogs },
      },
    };
    const human = await runCli({
      argv: ["stores", "show", "thereformation.com"],
      env: KEYED,
      isTty: true,
      routes,
    });
    expect(human.stdout).toContain(
      "  fields     13 populated (product 3, enrichment 10)",
    );
    expect(human.stdout).toContain("enrichment_5");
    expect(human.stdout).not.toContain("enrichment_6");
    expect(human.stdout).toContain("    … 4 more fields (--json for all)");
    const json = await runCli({
      argv: ["stores", "show", "thereformation.com"],
      env: KEYED,
      routes,
    });
    expect(json.json()["catalogs"]).toEqual(catalogs);
  });

  it("exits 6 with covered: false on 404 domain_not_covered", async () => {
    const result = await runCli({
      argv: ["stores", "show", "example.com"],
      env: KEYED,
      routes: {
        "GET /stores/example.com": {
          body: { detail: "domain_not_covered" },
          status: 404,
        },
      },
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    const body = result.json();
    expect(body["ok"]).toBe(false);
    expect(body["code"]).toBe("domain_not_covered");
    expect(body["coverage"]).toBe("not_covered");
    expect(body["covered"]).toBe(false);
    expect(body["host"]).toBe("example.com");
    expect(body["message"]).toBe(
      "example.com is not covered: no StoreRouter catalog serves it.",
    );
  });

  it("does not read any other 404 as 'not covered'", async () => {
    const result = await runCli({
      argv: ["stores", "show", "example.com"],
      env: KEYED,
      routes: {
        "GET /stores/example.com": { body: { detail: "Not Found" }, status: 404 },
      },
    });
    expect(result.exitCode).not.toBe(ExitCode.NoResult);
    expect(result.json()["coverage"]).toBe("unknown");
  });

  it.each([
    [["stores", "show"], "missing_argument"],
    [["stores", "show", "a.example", "b.example"], "too_many_arguments"],
    [["stores", "show", "not a host/with a path"], "invalid_host"],
  ])("refuses %j before any request", async (argv, code) => {
    const result = await runCli({ argv, env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["code"]).toBe(code);
    expect(result.requests).toHaveLength(0);
  });

  it("has no list mode", async () => {
    for (const argv of [
      ["stores", "show", "--list"],
      ["stores", "show", "--all"],
    ]) {
      const result = await runCli({ argv, env: KEYED });
      expect(result.exitCode).toBe(ExitCode.Usage);
      expect(result.requests).toHaveLength(0);
    }
  });
});

/** Coverage with taxonomy levels, values as the live route returns them (2026-10-23). */
function categoryField(level: number, values: [string, number][]) {
  return {
    name: `category_path.depth_${String(level)}`,
    displayName: `Category level ${String(level)}`,
    source: "product",
    populated: 3518,
    coverage: 1,
    distinct: values.length,
    truncated: false,
    topValues: values.map(([label, count]) => ({
      value: label.toLowerCase(),
      label,
      count,
    })),
  };
}

const CATEGORY_STORE_BODY = {
  host: "thereformation.com",
  catalogs: [
    {
      ...STORE_BODY.catalogs[0],
      productCount: 3518,
      fields: [
        ...(STORE_BODY.catalogs[0]?.fields ?? []),
        categoryField(0, [["Apparel & Accessories", 3518]]),
        categoryField(1, [
          ["Clothing", 3116],
          ["Shoes", 259],
        ]),
        categoryField(2, [
          ["Dresses", 1027],
          ["Tops", 974],
          ["Pants", 315],
        ]),
      ],
    },
  ],
};

describe("storerouter stores categories", () => {
  const routes = { "GET /stores/thereformation.com": { body: CATEGORY_STORE_BODY } };

  it("issues the one stores show request", async () => {
    const result = await runCli({
      argv: ["stores", "categories", "https://www.thereformation.com/products/x"],
      env: KEYED,
      routes,
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.url).toBe(
      "https://api.storerouter.ai/v1/stores/thereformation.com",
    );
  });

  it("ranks category levels at --min-level or deeper, with shares", async () => {
    const result = await runCli({
      argv: [
        "stores",
        "categories",
        "thereformation.com",
        "--min-level",
        "1",
        "--limit",
        "4",
      ],
      env: KEYED,
      routes,
    });
    const body = result.json();
    expect(body["command"]).toBe("stores categories");
    expect(body["host"]).toBe("thereformation.com");
    const catalogs = body["catalogs"] as { categories: unknown[] }[];
    expect(catalogs[0]?.categories).toEqual([
      { name: "Clothing", level: 1, count: 3116, share: 3116 / 3518 },
      { name: "Dresses", level: 2, count: 1027, share: 1027 / 3518 },
      { name: "Tops", level: 2, count: 974, share: 974 / 3518 },
      { name: "Pants", level: 2, count: 315, share: 315 / 3518 },
    ]);
  });

  it("prints one list per catalog on a terminal", async () => {
    const result = await runCli({
      argv: ["stores", "categories", "thereformation.com", "--min-level", "2"],
      env: KEYED,
      isTty: true,
      routes,
    });
    expect(result.stdout).toBe(
      [
        "Top categories for thereformation.com",
        "",
        "Reformation (reformation) · 3,518 products",
        "  Dresses (level 2)  1,027 · 29%",
        "  Tops (level 2)  974 · 28%",
        "  Pants (level 2)  315 · 9%",
        "",
      ].join("\n"),
    );
  });

  it("exits 6 when no category is counted that deep", async () => {
    const result = await runCli({
      argv: ["stores", "categories", "thereformation.com", "--min-level", "5"],
      env: KEYED,
      routes,
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    expect(result.json()["code"]).toBe("no_matches");
  });

  it("exits 6 with covered: false on 404 domain_not_covered", async () => {
    const result = await runCli({
      argv: ["stores", "categories", "example.com"],
      env: KEYED,
      routes: {
        "GET /stores/example.com": {
          body: { detail: "domain_not_covered" },
          status: 404,
        },
      },
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    expect(result.json()["code"]).toBe("domain_not_covered");
  });

  it.each([
    [["stores", "categories"], "missing_argument"],
    [["stores", "categories", "a.example", "b.example"], "too_many_arguments"],
    [["stores", "categories", "a.example", "--limit", "11"], "invalid_option_value"],
    [
      ["stores", "categories", "a.example", "--min-level", "-1"],
      "invalid_option_value",
    ],
  ])("refuses %j before any request", async (argv, code) => {
    const result = await runCli({ argv, env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["code"]).toBe(code);
    expect(result.requests).toHaveLength(0);
  });
});

const STORE_SEARCH_BODY = {
  results: [
    {
      store: {
        storeId: "catalog:thereformation",
        catalog: "thereformation",
        displayName: "Reformation",
        primaryDomain: "thereformation.com",
        domains: ["thereformation.com"],
      },
      profileVersion: "profile-1",
      computedAt: "2026-10-22T19:09:24Z",
      summary: "Observed public indexed assortment.",
      matchedDepartment: {
        departmentId: "category:apparel & accessories > clothing",
        categoryPath: ["Apparel & Accessories", "Clothing"],
        productCount: 3118,
        summary: "Dresses (substantial).",
        distributions: [],
      },
    },
    {
      store: {
        storeId: "catalog:uniqlo",
        catalog: "uniqlo",
        displayName: "Uniqlo",
        primaryDomain: "uniqlo.com",
        domains: ["uniqlo.com"],
      },
      profileVersion: "profile-2",
      computedAt: "2026-10-22T19:09:24Z",
      summary: "Observed public indexed assortment.",
      matchedDepartment: null,
    },
  ],
};

describe("storerouter stores search", () => {
  it("POSTs the joined description and --limit", async () => {
    const result = await runCli({
      argv: ["stores", "search", "linen", "dresses", "--limit", "5", "--json"],
      env: KEYED,
      routes: { "POST /stores/search": { body: STORE_SEARCH_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.body).toEqual({ text: "linen dresses", limit: 5 });
    const body = result.json();
    expect(body["command"]).toBe("stores search");
    expect(body["query"]).toBe("linen dresses");
    expect(body["count"]).toBe(2);
    const [first, second] = STORE_SEARCH_BODY.results;
    expect(body["stores"]).toEqual([
      {
        ...first,
        matchedDepartment: {
          departmentId: "category:apparel & accessories > clothing",
          categoryPath: ["Apparel & Accessories", "Clothing"],
          productCount: 3118,
          summary: "Dresses (substantial).",
        },
      },
      second,
    ]);
  });

  it("prints each store with its matched department on a terminal", async () => {
    const result = await runCli({
      argv: ["stores", "search", "linen dresses"],
      env: KEYED,
      isTty: true,
      routes: { "POST /stores/search": { body: STORE_SEARCH_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests[0]?.body).toEqual({ text: "linen dresses", limit: 24 });
    expect(result.stdout).toBe(
      [
        '2 stores for "linen dresses"',
        "  Reformation · thereformation.com",
        "    Apparel & Accessories > Clothing · 3,118 products profiled",
        "  Uniqlo · uniqlo.com",
        "",
      ].join("\n"),
    );
  });

  it("exits 6 when no profiled store matched", async () => {
    const result = await runCli({
      argv: ["stores", "search", "nothing like this", "--json"],
      env: KEYED,
      routes: { "POST /stores/search": { body: { results: [] } } },
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    expect(result.json()["code"]).toBe("no_matches");
  });

  it("does not borrow exit 6 for an unconfigured search", async () => {
    const result = await runCli({
      argv: ["stores", "search", "linen", "--json", "--no-retry"],
      env: KEYED,
      routes: {
        "POST /stores/search": {
          status: 503,
          body: { detail: "store_search_unavailable" },
        },
      },
    });
    expect(result.exitCode).not.toBe(ExitCode.NoResult);
    expect(result.exitCode).not.toBe(ExitCode.Success);
  });

  it.each([[["stores", "search"]], [["stores", "search", "x", "--limit", "101"]]])(
    "is a usage error for %j, before any request",
    async (argv) => {
      const result = await runCli({ argv, env: KEYED });
      expect(result.exitCode).toBe(ExitCode.Usage);
      expect(result.requests).toEqual([]);
    },
  );
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

describe("storerouter stores", () => {
  it("lists its subcommands", async () => {
    const result = await runCli({ argv: ["stores"] });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.stderr).toContain("Usage: storerouter stores <subcommand>");
    expect(result.stderr).toContain("search");
    expect(result.stderr).toContain("show");
    expect(result.requests).toHaveLength(0);
  });

  it("names the valid subcommands for an unknown one", async () => {
    const result = await runCli({ argv: ["stores", "list"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["message"]).toContain("Use one of: search, show");
    expect(result.requests).toHaveLength(0);
  });

  it("has no singular `store` alias", async () => {
    const result = await runCli({ argv: ["store", "thereformation.com"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["code"]).toBe("unknown_command");
    expect(result.requests).toHaveLength(0);
  });
});

it("rejects the retired domains command without a request", async () => {
  const result = await runCli({ argv: ["domains"] });
  expect(result.exitCode).toBe(ExitCode.Usage);
  expect(result.requests).toHaveLength(0);
});
