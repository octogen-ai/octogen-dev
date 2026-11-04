import { describe, expect, expectTypeOf, it } from "vitest";

import { OctogenClient, OctogenNotFoundError, type FetchLike } from "../src/index.js";

const BASE_URL = "https://api.storerouter.ai/v1";

const REFORMATION = {
  brandUuid: "6f1c2c47-8f2e-4d8e-9a4f-3c1f0c9b2a11",
  brandName: "Reformation",
  brandSlug: "reformation",
  domain: "thereformation.com",
  brandDescription: "Sustainable women's clothing.",
  directorySubheading: null,
};

interface FetchCall {
  input: string;
  init: RequestInit | undefined;
}

function fetchReturning(
  body: unknown,
  status = 200,
): { calls: FetchCall[]; fetchMock: FetchLike } {
  const calls: FetchCall[] = [];
  const fetchMock: FetchLike = (input, init) => {
    calls.push({ input, init });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status,
      }),
    );
  };
  return { calls, fetchMock };
}

function lastCall(calls: FetchCall[]): FetchCall {
  const call = calls.at(-1);
  if (call === undefined) {
    throw new Error("Expected fetch to be called");
  }
  return call;
}

function bodyOf(call: FetchCall): unknown {
  if (typeof call.init?.body !== "string") {
    throw new TypeError("Expected string request body");
  }
  return JSON.parse(call.init.body) as unknown;
}

describe("brand discovery", () => {
  it("separates directory, profile and coverage paths", async () => {
    const { calls, fetchMock } = fetchReturning({
      ...REFORMATION,
      articles: [],
      navigationFacets: [],
    });
    const client = new OctogenClient({ apiKey: "customer", fetch: fetchMock });
    await client.getBrandDirectory();
    expect(lastCall(calls).input).toBe(`${BASE_URL}/brands/directory`);
    const profile = await client.getBrandDetails("Éliou");
    expectTypeOf(profile).toExtend<import("../src/index.js").BrandDetailsView>();
    expect(lastCall(calls).input).toBe(`${BASE_URL}/brands/%C3%89liou`);
    await client.getBrandCoverage("eliou");
    expect(lastCall(calls).input).toBe(`${BASE_URL}/brands/eliou/coverage`);
    expect(lastCall(calls).init?.headers).toMatchObject({
      Authorization: "Bearer customer",
    });
  });

  it.each([
    [11952, 11976],
    [11976, null],
  ])("preserves source continuation at %i", async (offset, nextOffset) => {
    const { fetchMock } = fetchReturning({
      brandName: "Éliou",
      products: [],
      total: 20000,
      limit: 24,
      offset,
      nextOffset,
      hasMore: nextOffset !== null,
    });
    const page = await new OctogenClient({
      apiKey: "customer",
      fetch: fetchMock,
    }).browseBrandProducts("eliou", { offset, limit: 24 });
    expect(page.nextOffset).toBe(nextOffset);
    expect(page.products).toEqual([]);
  });

  it("completes a brand prefix with a query", async () => {
    const { calls, fetchMock } = fetchReturning(["Reformation", "Rebecca Taylor"]);
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const names = await client.searchBrandPrefix("Re", { limit: 2 });

    const call = lastCall(calls);
    expect(call.init?.method).toBe("GET");
    expect(call.input).toBe(`${BASE_URL}/brands/prefix?prefix=Re&limit=2`);
    expect(call.init?.body).toBeUndefined();
    expect(names).toEqual(["Reformation", "Rebecca Taylor"]);
  });

  it("searches brands from text with only the fields given", async () => {
    const { calls, fetchMock } = fetchReturning({
      results: [REFORMATION],
      totalFound: 1,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.searchBrands({
      q: "sustainable dresses",
      similarToBrands: ["Everlane"],
      facets: [{ name: "facet_price_tier", values: ["premium"] }],
      understand: false,
    });

    const call = lastCall(calls);
    expect(call.init?.method).toBe("POST");
    expect(call.input).toBe(`${BASE_URL}/brands/search`);
    expect(bodyOf(call)).toEqual({
      q: "sustainable dresses",
      similar_to_brands: ["Everlane"],
      facets: [{ name: "facet_price_tier", values: ["premium"] }],
      understand: false,
    });
    expect(page.results[0]?.brandName).toBe("Reformation");
  });

  it.each([
    [
      { similarToBrands: ["Everlane", "Unknown Brand"] },
      { similar_to_brands: ["Everlane", "Unknown Brand"] },
    ],
    [
      { facets: [{ name: "facet_price_tier", values: ["premium"] }] },
      { facets: [{ name: "facet_price_tier", values: ["premium"] }] },
    ],
    [
      { excludeFacets: [{ name: "brand_name", values: ["Example"] }] },
      { exclude_facets: [{ name: "brand_name", values: ["Example"] }] },
    ],
  ])("supports textless input %j", async (params, expected) => {
    const { calls, fetchMock } = fetchReturning({ results: [], totalFound: 0 });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    await client.searchBrands(params);
    expect(bodyOf(lastCall(calls))).toEqual(expected);
    await client.searchBrands({ ...params, q: " ", understand: false });
    expect(bodyOf(lastCall(calls))).toEqual({ ...expected, understand: false });
  });

  it.each([
    {},
    { q: " " },
    { facets: [] },
    { excludeFacets: [] },
    { understand: false },
    { similarToBrands: [] },
    { similarToBrands: [" "] },
  ])("rejects unusable input %j before transport", async (params) => {
    const { calls, fetchMock } = fetchReturning({});
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    await expect(client.searchBrands(params)).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it("preserves every clause and value at the server bounds with request context", async () => {
    const { calls, fetchMock } = fetchReturning({
      results: [REFORMATION],
      totalFound: 1,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    const facets = Array.from({ length: 20 }, () => ({
      name: "brand_style_identity",
      values: Array.from({ length: 100 }, (_, i) => `style-${String(i)}`),
    }));
    const brands = Array.from({ length: 20 }, (_, i) => `Brand ${String(i)}`);
    const before = structuredClone(facets);
    await client.searchBrands(
      {
        q: "x".repeat(500),
        facets,
        excludeFacets: facets,
        similarToBrands: brands,
        limit: 100,
      },
      {
        context: {
          application: "cosimo",
          feature: "brand_search",
          trigger: "user_search",
        },
      },
    );
    const call = lastCall(calls);
    expect(bodyOf(call)).toEqual({
      q: "x".repeat(500),
      facets,
      exclude_facets: facets,
      similar_to_brands: brands,
      limit: 100,
    });
    expect(facets).toEqual(before);
    expect(
      JSON.parse(
        new Headers(call.init?.headers).get("X-Octogen-Request-Context") ?? "null",
      ),
    ).toEqual({
      application: "cosimo",
      feature: "brand_search",
      trigger: "user_search",
    });
  });

  it("preserves unknown-reference errors", async () => {
    const { fetchMock } = fetchReturning({ detail: "brands_have_no_embeddings" }, 400);
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    await expect(
      client.searchBrands({ similarToBrands: ["Unknown Brand"] }),
    ).rejects.toMatchObject({ statusCode: 400, detail: "brands_have_no_embeddings" });
  });

  it("finds similar brands with inclusion and exclusion facets", async () => {
    const { calls, fetchMock } = fetchReturning({
      results: [REFORMATION],
      totalFound: 1,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.searchSimilarBrands({
      brands: ["Everlane", "Aritzia"],
      exclusionFacets: [{ name: "facet_genders", values: ["men"] }],
      limit: 5,
    });

    const call = lastCall(calls);
    expect(call.init?.method).toBe("POST");
    expect(call.input).toBe(`${BASE_URL}/brands/similar`);
    expect(bodyOf(call)).toEqual({
      brands: ["Everlane", "Aritzia"],
      exclusionFacets: [{ name: "facet_genders", values: ["men"] }],
      limit: 5,
    });
  });

  it("encodes a brand name into the details path", async () => {
    const { calls, fetchMock } = fetchReturning({ ...REFORMATION, foundedYear: 2009 });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const details = await client.getBrandDetails("Marc & Co");

    const call = lastCall(calls);
    expect(call.init?.method).toBe("GET");
    expect(call.input).toBe(`${BASE_URL}/brands/Marc%20%26%20Co`);
    expect(details.foundedYear).toBe(2009);
  });

  it.each(["WOMEN", "PLUS", "FUTURE_CATEGORY", null, undefined])(
    "preserves optional nullable audience %s in brand details",
    async (audience) => {
      const { fetchMock } = fetchReturning({
        ...REFORMATION,
        ...(audience === undefined ? {} : { targetAudience: audience }),
      });
      const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

      const details = await client.getBrandDetails("reformation");

      expectTypeOf(details.targetAudience).toEqualTypeOf<string | null | undefined>();
      expect(details.targetAudience).toBe(audience);
      expect(Object.hasOwn(details, "targetAudience")).toBe(audience !== undefined);
      expect(details.brandName).toBe("Reformation");
    },
  );

  it("pages a brand's products with limit and offset", async () => {
    const { calls, fetchMock } = fetchReturning({
      brandName: "Reformation",
      brandSlug: "reformation",
      products: [],
      total: 340,
      limit: 12,
      offset: 24,
      hasMore: true,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.browseBrandProducts("reformation", {
      limit: 12,
      offset: 24,
    });

    expect(lastCall(calls).input).toBe(
      `${BASE_URL}/brands/reformation/products?limit=12&offset=24`,
    );
    expect(page.hasMore).toBe(true);
  });

  it("reads top categories with minLevel on the wire", async () => {
    const { calls, fetchMock } = fetchReturning({
      brandName: "Reformation",
      topCategories: [{ categoryName: "Dresses", categoryLevel: 2 }],
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.getBrandTopCategories("reformation", { minLevel: 2 });

    expect(lastCall(calls).input).toBe(
      `${BASE_URL}/brands/reformation/top-categories?minLevel=2`,
    );
    expect(page.topCategories[0]?.categoryName).toBe("Dresses");
  });

  it("refuses blank inputs before any request", async () => {
    const { calls, fetchMock } = fetchReturning({});
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.searchBrandPrefix("  ")).rejects.toThrow(TypeError);
    await expect(client.searchBrands({ q: "" })).rejects.toThrow(TypeError);
    await expect(client.searchSimilarBrands({ brands: [] })).rejects.toThrow(TypeError);
    await expect(client.searchSimilarBrands({ brands: [" "] })).rejects.toThrow(
      TypeError,
    );
    await expect(client.getBrandDetails(" ")).rejects.toThrow(TypeError);
    await expect(client.browseBrandProducts("")).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it("surfaces 404 brand_not_found as a not-found error", async () => {
    const { fetchMock } = fetchReturning({ detail: "brand_not_found" }, 404);
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.getBrandDetails("nope")).rejects.toBeInstanceOf(
      OctogenNotFoundError,
    );
    await expect(client.getBrandTopCategories("nope")).rejects.toMatchObject({
      detail: "brand_not_found",
      statusCode: 404,
    });
  });
});
