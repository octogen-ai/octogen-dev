import { describe, expect, it } from "vitest";

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

    const page = await client.searchBrandsFromText({
      text: "sustainable dresses",
      referenceBrands: ["Everlane"],
      facets: [{ name: "facet_price_tier", values: ["premium"] }],
      understand: false,
    });

    const call = lastCall(calls);
    expect(call.init?.method).toBe("POST");
    expect(call.input).toBe(`${BASE_URL}/brands/search`);
    expect(bodyOf(call)).toEqual({
      text: "sustainable dresses",
      referenceBrands: ["Everlane"],
      facets: [{ name: "facet_price_tier", values: ["premium"] }],
      understand: false,
    });
    expect(page.results[0]?.brandName).toBe("Reformation");
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
    await expect(client.searchBrandsFromText({ text: "" })).rejects.toThrow(TypeError);
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
