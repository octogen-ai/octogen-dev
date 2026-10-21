/**
 * `storerouter brands …` against scripted `/v1/brands` routes: the request each
 * subcommand sends, the envelope it emits, and when it exits `6`.
 */

import { describe, expect, it } from "vitest";

import { ExitCode } from "../src/exit.js";
import { runCli, TEST_KEY } from "./harness.js";

const KEYED = { OCTOGEN_PLATFORM_API_KEY: TEST_KEY };
const API = "https://api.storerouter.ai/v1";

const REFORMATION = {
  brandUuid: "6f1c2c47-8f2e-4d8e-9a4f-3c1f0c9b2a11",
  brandName: "Reformation",
  brandSlug: "reformation",
  domain: "thereformation.com",
  brandDescription: "Sustainable women's clothing.",
  directorySubheading: null,
};
const BRANDS_BODY = { results: [REFORMATION], totalFound: 1 };
const NOT_FOUND = { status: 404, body: { detail: "brand_not_found" } };

describe("storerouter brands search", () => {
  it("POSTs the description, --like brands and facets", async () => {
    const result = await runCli({
      argv: [
        "brands",
        "search",
        "sustainable",
        "dresses",
        "--like",
        "Everlane",
        "--like",
        "Aritzia",
        "--facet",
        "facet_price_tier=premium",
        "--limit",
        "5",
        "--json",
      ],
      env: KEYED,
      routes: { "POST /brands/search": { body: BRANDS_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests[0]?.body).toEqual({
      text: "sustainable dresses",
      referenceBrands: ["Everlane", "Aritzia"],
      facets: [{ name: "facet_price_tier", values: ["premium"] }],
      limit: 5,
    });
    const body = result.json();
    expect(body["command"]).toBe("brands search");
    expect(body["query"]).toBe("sustainable dresses");
    expect(body["like"]).toEqual(["Everlane", "Aritzia"]);
    expect(body["brands"]).toEqual([
      {
        uuid: REFORMATION.brandUuid,
        name: "Reformation",
        slug: "reformation",
        domain: "thereformation.com",
        description: "Sustainable women's clothing.",
      },
    ]);
  });

  it("exits 6 when no brand matched", async () => {
    const result = await runCli({
      argv: ["brands", "search", "nothing like this", "--json"],
      env: KEYED,
      routes: { "POST /brands/search": { body: { results: [], totalFound: 0 } } },
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    expect(result.json()["code"]).toBe("no_matches");
  });

  it("is a usage error without a description, before any request", async () => {
    const result = await runCli({ argv: ["brands", "search"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.requests).toEqual([]);
  });
});

describe("storerouter brands similar", () => {
  it("sends each positional as one source brand", async () => {
    const result = await runCli({
      argv: [
        "brands",
        "similar",
        "Free People",
        "Reformation",
        "--exclude-facet",
        "facet_genders=men",
      ],
      env: KEYED,
      routes: { "POST /brands/similar": { body: BRANDS_BODY } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests[0]?.body).toEqual({
      brands: ["Free People", "Reformation"],
      exclusionFacets: [{ name: "facet_genders", values: ["men"] }],
      limit: 24,
    });
  });

  it("exits 6 with brand_not_found when a source brand is unknown", async () => {
    const result = await runCli({
      argv: ["brands", "similar", "Nope", "--json"],
      env: KEYED,
      routes: { "POST /brands/similar": NOT_FOUND },
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    expect(result.json()["code"]).toBe("brand_not_found");
  });
});

describe("storerouter brands prefix", () => {
  it("GETs the prefix as a query and lists the names", async () => {
    const result = await runCli({
      argv: ["brands", "prefix", "Re", "--limit", "2", "--json"],
      env: KEYED,
      routes: { "GET /brands/prefix": { body: ["Reformation", "Rebecca Taylor"] } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests[0]?.url).toBe(`${API}/brands/prefix?prefix=Re&limit=2`);
    expect(result.json()["brands"]).toEqual(["Reformation", "Rebecca Taylor"]);
  });
});

describe("storerouter brands show", () => {
  it("GETs one brand by name, with no body", async () => {
    const result = await runCli({
      argv: ["brands", "show", "Free People", "--json"],
      env: KEYED,
      routes: { "GET /brands/Free%20People": { body: REFORMATION } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const request = result.requests[0];
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe(`${API}/brands/Free%20People`);
    expect(request?.body).toBeUndefined();
    expect(result.json()["brand"]).toEqual(REFORMATION);
  });

  it("exits 6 with brand_not_found for an unknown brand", async () => {
    const result = await runCli({
      argv: ["brands", "show", "nope", "--json"],
      env: KEYED,
      routes: { "GET /brands/nope": NOT_FOUND },
    });
    expect(result.exitCode).toBe(ExitCode.NoResult);
    const body = result.json();
    expect(body["code"]).toBe("brand_not_found");
    expect(body["brand"]).toBe("nope");
  });
});

describe("storerouter brands products", () => {
  const PAGE = {
    brandName: "Reformation",
    brandSlug: "reformation",
    total: 340,
    limit: 2,
    offset: 10,
    hasMore: true,
    products: [
      {
        uuid: "11111111-1111-4111-8111-111111111111",
        catalogKey: "reformation",
        title: "Juliette Linen Dress",
        currentPrice: 248,
        productUrl: "https://www.thereformation.com/products/juliette",
      },
    ],
  };

  it("pages with --limit and --offset and reports nextOffset", async () => {
    const result = await runCli({
      argv: ["brands", "products", "reformation", "--limit", "2", "--offset", "10"],
      env: KEYED,
      routes: { "GET /brands/reformation/products": { body: PAGE } },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests[0]?.url).toBe(
      `${API}/brands/reformation/products?limit=2&offset=10`,
    );
    const body = result.json();
    expect(body["total"]).toBe(340);
    expect(body["nextOffset"]).toBe(11);
    expect(body["items"]).toEqual([
      {
        uuid: PAGE.products[0]?.uuid,
        catalog: "reformation",
        title: "Juliette Linen Dress",
        currentPrice: 248,
        productUrl: "https://www.thereformation.com/products/juliette",
      },
    ]);
  });

  it("rejects an offset past the contract's ceiling before any request", async () => {
    const result = await runCli({
      argv: ["brands", "products", "reformation", "--offset", "10001"],
      env: KEYED,
    });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.requests).toEqual([]);
  });
});

describe("storerouter brands categories", () => {
  it("sends --min-level as minLevel and lists categories", async () => {
    const result = await runCli({
      argv: ["brands", "categories", "reformation", "--min-level", "2", "--json"],
      env: KEYED,
      routes: {
        "GET /brands/reformation/top-categories": {
          body: {
            brandName: "Reformation",
            topCategories: [{ categoryName: "Dresses", categoryLevel: 2 }],
          },
        },
      },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.requests[0]?.url).toBe(
      `${API}/brands/reformation/top-categories?minLevel=2&limit=3`,
    );
    expect(result.json()["categories"]).toEqual([{ name: "Dresses", level: 2 }]);
  });
});

describe("storerouter brands, the group", () => {
  it("lists its subcommands on stderr when none is given", async () => {
    const result = await runCli({ argv: ["brands"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.stdout).toBe("");
    for (const subcommand of [
      "search",
      "similar",
      "show",
      "products",
      "categories",
      "prefix",
    ])
      expect(result.stderr).toContain(`  ${subcommand} `);
    expect(result.requests).toEqual([]);
  });

  it("exits 0 for brands --help", async () => {
    const result = await runCli({ argv: ["brands", "--help"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stderr).toContain("Usage: storerouter brands <subcommand>");
  });

  it("names the valid subcommands for an unknown one", async () => {
    const result = await runCli({ argv: ["brands", "nope", "--json"], env: KEYED });
    expect(result.exitCode).toBe(ExitCode.Usage);
    expect(result.json()["message"]).toBe(
      "Unknown brands subcommand: nope. Use one of: search, similar, show, products, categories, prefix.",
    );
  });
});

describe("brands listings on a terminal", () => {
  it("show one line of each description", async () => {
    const long = `${"Founded in Paris. ".repeat(10)}\n\nA second paragraph.`;
    const result = await runCli({
      argv: ["brands", "similar", "Everlane"],
      env: KEYED,
      isTty: true,
      routes: {
        "POST /brands/similar": {
          body: {
            results: [{ ...REFORMATION, brandDescription: long }],
            totalFound: 1,
          },
        },
      },
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]?.length).toBeLessThanOrEqual(104);
    expect(lines[2]?.endsWith("…")).toBe(true);
  });
});
