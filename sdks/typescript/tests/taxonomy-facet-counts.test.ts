import { describe, expect, it } from "vitest";

import {
  KEYLESS_TRIAL_OPERATIONS,
  OctogenClient,
  OctogenNotFoundError,
  type CountProductFacetsParams,
  type FetchLike,
  type TaxonomyCategoryPage,
} from "../src/index.js";

const BASE_URL = "https://api.storerouter.ai/v1";

const DRESSES_FACETS = [
  { name: "category_path.depth_0", values: ["apparel & accessories"] },
  { name: "category_path.depth_1", values: ["clothing"] },
  { name: "category_path.depth_2", values: ["dresses"] },
];
const DRESSES = {
  id: "8866aef9-1915-4d6e-b465-87ba30b50380",
  name: "Dresses",
  path: "Apparel & Accessories > Clothing > Dresses",
  depth: 2,
  childCount: 0,
  facets: DRESSES_FACETS,
};
const NECKLINE = {
  handle: "neckline",
  name: "Neckline",
  description: null,
  facetName: "neckline",
  matching: "any selected value; exact canonical handles",
  valueCount: 26,
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

describe("taxonomy discovery", () => {
  it("lists a category's children with paging", async () => {
    const { calls, fetchMock } = fetchReturning({
      taxonomyVersion: "v4",
      parent: null,
      categories: [DRESSES],
      total: 13,
      nextOffset: 1,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.listTaxonomyCategories({
      parent: "Apparel & Accessories > Clothing",
      limit: 1,
    });

    const call = lastCall(calls);
    expect(call.init?.method).toBe("GET");
    expect(call.input).toBe(
      `${BASE_URL}/taxonomy/categories?parent=Apparel+%26+Accessories+%3E+Clothing&limit=1`,
    );
    expect(page.categories[0]?.name).toBe("Dresses");
    expect(page.nextOffset).toBe(1);
  });

  it("lists roots with no query string", async () => {
    const { calls, fetchMock } = fetchReturning({
      taxonomyVersion: "v4",
      parent: null,
      categories: [],
      total: 4,
      nextOffset: null,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.listTaxonomyCategories();

    expect(lastCall(calls).input).toBe(`${BASE_URL}/taxonomy/categories`);
  });

  it("lists a category's attributes", async () => {
    const { calls, fetchMock } = fetchReturning({
      taxonomyVersion: "v4",
      category: DRESSES,
      attributes: [NECKLINE],
      total: 23,
      nextOffset: null,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.listTaxonomyAttributes(DRESSES.id, { offset: 0 });

    expect(lastCall(calls).input).toBe(
      `${BASE_URL}/taxonomy/attributes?category=${DRESSES.id}&offset=0`,
    );
    expect(page.attributes[0]?.facetName).toBe("neckline");
  });

  it("refuses a blank category locally", async () => {
    const { calls, fetchMock } = fetchReturning({});
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.listTaxonomyAttributes("  ")).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it("puts the attribute handle in the path", async () => {
    const { calls, fetchMock } = fetchReturning({
      taxonomyVersion: "v4",
      attribute: NECKLINE,
      values: [{ handle: "neckline__halter", name: "Halter" }],
      total: 26,
      nextOffset: null,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.listTaxonomyAttributeValues("neckline", { limit: 100 });

    expect(lastCall(calls).input).toBe(
      `${BASE_URL}/taxonomy/attributes/neckline/values?limit=100`,
    );
    expect(page.values.map((value) => value.handle)).toEqual(["neckline__halter"]);
  });

  it("maps an unknown attribute to OctogenNotFoundError", async () => {
    const { fetchMock } = fetchReturning(
      { detail: "taxonomy_attribute_not_found" },
      404,
    );
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.listTaxonomyAttributeValues("stock")).rejects.toBeInstanceOf(
      OctogenNotFoundError,
    );
  });

  it("sends a category's facets back into search unchanged", async () => {
    const page: TaxonomyCategoryPage = {
      taxonomyVersion: "v4",
      parent: null,
      categories: [DRESSES],
      total: 1,
      nextOffset: null,
    };
    const { calls, fetchMock } = fetchReturning({ items: [], nextCursor: null });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.searchProducts({ facets: page.categories[0]?.facets ?? [] });

    expect(bodyOf(lastCall(calls))).toEqual({ facets: DRESSES_FACETS, limit: 50 });
  });

  it("is not part of the keyless trial", () => {
    for (const operation of [
      "listTaxonomyCategories",
      "listTaxonomyAttributes",
      "listTaxonomyAttributeValues",
      "countProductFacets",
    ] as const) {
      expect(KEYLESS_TRIAL_OPERATIONS).not.toContain(operation);
    }
  });
});

describe("countProductFacets", () => {
  const COUNTS = {
    categories: [{ key: "dresses", count: 18760 }],
    attributes: [
      {
        handle: "neckline",
        facetName: "neckline",
        values: [{ value: "neckline__halter", count: 120 }],
      },
    ],
    facets: [{ name: "color_family", values: [{ value: "Red", count: 9 }] }],
    effectiveQuery: { text: "", understood: false, facets: [], excludeFacets: [] },
  };

  it("sends every field under its wire name", async () => {
    const { calls, fetchMock } = fetchReturning(COUNTS);
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const counts = await client.countProductFacets({
      q: "red dresses",
      facets: [{ name: "gender", values: ["female"] }],
      excludeFacets: [{ name: "color_family", values: ["Black"] }],
      omitGeneratedFacets: ["graphic_type"],
      fallbackCategory: ["apparel & accessories", "clothing"],
      priceMin: 10,
      priceMax: 200,
      brandQualityMin: 2,
      brandQualityMax: 6,
      catalogs: ["whiteandwarren"],
      categories: [{ key: "dresses", facets: DRESSES_FACETS }],
      attributes: ["neckline"],
      facetNames: ["color_family", "category_path.depth_0"],
      valueLimit: 20,
    });

    const call = lastCall(calls);
    expect(call.init?.method).toBe("POST");
    expect(call.input).toBe(`${BASE_URL}/products/facet-counts`);
    expect(bodyOf(call)).toEqual({
      q: "red dresses",
      facets: [{ name: "gender", values: ["female"] }],
      exclude_facets: [{ name: "color_family", values: ["Black"] }],
      omit_generated_facets: ["graphic_type"],
      fallback_category: ["apparel & accessories", "clothing"],
      price_min: 10,
      price_max: 200,
      brand_quality_min: 2,
      brand_quality_max: 6,
      catalogs: ["whiteandwarren"],
      categories: [{ key: "dresses", facets: DRESSES_FACETS }],
      attributes: ["neckline"],
      facet_names: ["color_family", "category_path.depth_0"],
      value_limit: 20,
    });
    expect(counts.categories[0]?.count).toBe(18760);
    expect(counts.attributes[0]?.values[0]?.value).toBe("neckline__halter");
  });

  it("sends an empty body by default", async () => {
    const { calls, fetchMock } = fetchReturning(COUNTS);
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.countProductFacets();

    expect(bodyOf(lastCall(calls))).toEqual({});
  });

  const refused: [string, CountProductFacetsParams][] = [
    ["omit without q", { omitGeneratedFacets: ["gender"] }],
    ["fallback without q", { fallbackCategory: ["apparel & accessories"] }],
    [
      "a repeated facet",
      {
        facets: [
          { name: "gender", values: ["female"] },
          { name: "gender", values: ["male"] },
        ],
      },
    ],
    ["price_min above price_max", { priceMin: 20, priceMax: 10 }],
    [
      "repeated category keys",
      {
        categories: [
          { key: "a", facets: DRESSES_FACETS },
          { key: "a", facets: DRESSES_FACETS },
        ],
      },
    ],
    ["a category with no facets", { categories: [{ key: "a", facets: [] }] }],
    ["a repeated attribute", { attributes: ["neckline", "neckline"] }],
    ["nothing to count", { facetNames: [] }],
    ["an out-of-range value limit", { valueLimit: 0 }],
    ["empty catalogs", { catalogs: [] }],
  ];

  it.each(refused)("refuses %s before any request", async (_name, params) => {
    const { calls, fetchMock } = fetchReturning(COUNTS);
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.countProductFacets(params)).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });
});
