import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  API_KEY_ENV_VAR,
  DEPRECATED_API_KEY_ENV_VAR,
  FacetName,
  MissingAPIKeyError,
  OctogenAPIError,
  OctogenClient,
  OctogenConnectionError,
  KEYLESS_TRIAL_OPERATIONS,
  OctogenNotFoundError,
  PricePreference,
  ProductLookupCachePolicy,
  ProductLookupResolutionMode,
  USER_AGENT,
  type FetchLike,
  type OperationId,
} from "../src/index.js";

const BASE_URL = "https://api.octogen.ai/v1";

interface FetchCall {
  input: string;
  init: RequestInit | undefined;
}

interface RequestableOctogenClient {
  request(
    operationId: OperationId,
    options?: {
      body?: object;
      headers?: Record<string, string>;
      pathParams?: Record<string, string>;
      query?: Record<string, string | number | undefined>;
    },
  ): Promise<{ data: unknown; response: Response }>;
}

// `vi.stubEnv(name, undefined)` unsets the variable and `vi.unstubAllEnvs()`
// puts the developer's own environment back, so a stray `OCTOGEN_PLATFORM_API_KEY`
// on the machine running the suite cannot make these tests pass for the wrong
// reason.
beforeEach(() => {
  vi.stubEnv(API_KEY_ENV_VAR, undefined);
  vi.stubEnv(DEPRECATED_API_KEY_ENV_VAR, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OctogenClient", () => {
  it("requires an API key", () => {
    expect(() => new OctogenClient({ fetch: createFetchMock().fetchMock })).toThrow(
      MissingAPIKeyError,
    );
  });

  it("uses OCTOGEN_PLATFORM_API_KEY from the environment", async () => {
    process.env[API_KEY_ENV_VAR] = "octo_test_key";
    const { calls, fetchMock } = createFetchMock({ items: [], nextCursor: null });

    const client = new OctogenClient({ fetch: fetchMock });
    await client.searchProducts({ q: "shirt", limit: 1 });

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/products/search`);
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer octo_test_key",
      "User-Agent": USER_AGENT,
    });
  });

  it("sends a typed product search request", async () => {
    const { calls, fetchMock } = createFetchMock({
      items: [
        {
          uuid: "product-1",
          productUrl: "https://example.com/products/linen-dress",
          title: "Linen Dress",
          brand: { name: "ACME", slug: "acme" },
          currentPrice: 128,
          imageUrl: "https://example.com/image.jpg",
        },
      ],
      nextCursor: "cursor-2",
    });

    const client = new OctogenClient({
      apiKey: "explicit_key",
      fetch: fetchMock,
    });
    const page = await client.searchProducts({
      catalogs: ["acme"],
      facets: [{ name: FacetName.GENDER, values: ["female"] }],
      limit: 5,
      q: "linen summer dress",
    });

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/products/search`);
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers).toMatchObject({
      Authorization: "Bearer explicit_key",
      "Content-Type": "application/json",
    });
    expect(requestBodyJson(call)).toEqual({
      catalogs: ["acme"],
      facets: [{ name: "gender", values: ["female"] }],
      limit: 5,
      q: "linen summer dress",
    });
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.items[0]?.title).toBe("Linen Dress");
    expect(page.items[0]?.brand?.name).toBe("ACME");
  });

  it("omits catalog for all-catalog search", async () => {
    const { calls, fetchMock } = createFetchMock({ items: [], nextCursor: null });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.searchProducts({
      limit: 5,
      q: "linen summer dress",
    });

    expect(requestBodyJson(lastCall(calls))).toEqual({
      limit: 5,
      q: "linen summer dress",
    });
  });

  it("sends catalogs verbatim", async () => {
    const { calls, fetchMock } = createFetchMock({ items: [], nextCursor: null });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.searchProducts({ catalogs: ["macys", "etro", "jcrew"], q: "dress" });

    expect(requestBodyJson(lastCall(calls))).toEqual({
      catalogs: ["macys", "etro", "jcrew"],
      limit: 50,
      q: "dress",
    });
  });

  it("sends every search control under its wire name", async () => {
    const { calls, fetchMock } = createFetchMock({
      items: [],
      nextCursor: null,
      requestId: "3f2c0a52-5d8e-4a57-9a61-0c9f1f7b2d11",
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.searchProducts({
      q: "black hoodie",
      understand: true,
      facets: [{ name: "color", values: ["black"] }],
      excludeFacets: [{ name: "brand_name", values: ["acme"] }],
      omitGeneratedFacets: ["fit"],
      priceMin: 50,
      priceMax: 300,
      brandQualityMin: 3,
      brandQualityMax: 6,
      similarToBrands: ["Warren Lotas"],
      fallbackCategory: ["apparel & accessories", "clothing"],
      catalogs: ["warrenlotas"],
      limit: 25,
      cursor: "cursor-1",
      relax: true,
      diversity: true,
      debug: true,
    });

    expect(requestBodyJson(lastCall(calls))).toEqual({
      q: "black hoodie",
      understand: true,
      facets: [{ name: "color", values: ["black"] }],
      exclude_facets: [{ name: "brand_name", values: ["acme"] }],
      omit_generated_facets: ["fit"],
      price_min: 50,
      price_max: 300,
      brand_quality_min: 3,
      brand_quality_max: 6,
      similar_to_brands: ["Warren Lotas"],
      fallback_category: ["apparel & accessories", "clothing"],
      catalogs: ["warrenlotas"],
      limit: 25,
      cursor: "cursor-1",
      relax: true,
      diversity: true,
      debug: true,
    });
  });

  it("reads the card fields on search list items", async () => {
    const { fetchMock } = createFetchMock({
      items: [
        {
          uuid: "dress",
          productUrl: "https://acme.example/dress",
          currency: "USD",
          inStock: false,
          colors: ["Red", "Navy"],
          sizes: ["S", "M"],
          gender: "female",
          categoryPath: ["apparel & accessories", "clothing"],
          catalogDisplayName: "Acme",
        },
      ],
      nextCursor: null,
      requestId: "r-1",
      effectiveQuery: { text: "dress", understood: true, facets: [] },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.searchProducts({ q: "dress" });

    const [item] = page.items;
    expect(item?.currency).toBe("USD");
    expect(item?.inStock).toBe(false);
    expect(item?.colors).toEqual(["Red", "Navy"]);
    expect(item?.sizes).toEqual(["S", "M"]);
    expect(item?.gender).toBe("female");
    expect(item?.categoryPath).toEqual(["apparel & accessories", "clothing"]);
    expect(item?.catalogDisplayName).toBe("Acme");
    // Present without debug on current servers.
    expect(page.effectiveQuery?.text).toBe("dress");
  });

  it("sends understand: false for a literal match", async () => {
    const { calls, fetchMock } = createFetchMock({ items: [], nextCursor: null });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.searchProducts({
      q: "black hoodie",
      understand: false,
      facets: [{ name: "color", values: ["black"] }],
    });

    expect(requestBodyJson(lastCall(calls))).toEqual({
      q: "black hoodie",
      understand: false,
      facets: [{ name: "color", values: ["black"] }],
      limit: 50,
    });
  });

  it("refuses the removed catalog and textSearchQuery fields", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    const removed = [
      [
        { catalog: "acme", q: "dress" },
        "searchProducts takes catalogs: [key], not catalog",
      ],
      [{ textSearchQuery: { text: "dress" } }, "pass q with understand: false"],
    ] as const;

    for (const [params, message] of removed) {
      // A JavaScript caller, or a TypeScript one casting past the type.
      await expect(
        client.searchProducts(
          params as unknown as Parameters<typeof client.searchProducts>[0],
        ),
      ).rejects.toThrow(message);
    }
    expect(calls).toHaveLength(0);
  });

  it.each([
    [{ fallbackCategory: ["clothing"] }, "fallbackCategory requires an understood q"],
    [
      { q: "dress", understand: false, fallbackCategory: ["clothing"] },
      "fallbackCategory requires an understood q",
    ],
    [{ q: "dress", fallbackCategory: [] }, "between 1 and 4 category names"],
    [
      { q: "dress", fallbackCategory: ["a", "b", "c", "d", "e"] },
      "between 1 and 4 category names",
    ],
    [
      { q: "dress", fallbackCategory: ["apparel & accessories", " "] },
      "non-empty category names",
    ],
    [{ understand: false }, "understand: false requires q"],
    [{ q: "   ", understand: false }, "understand: false requires q"],
    [{ relax: true }, "relax requires an understood q"],
    [{ q: "dress", understand: false, relax: true }, "relax requires an understood q"],
    [
      { omitGeneratedFacets: ["color"] },
      "omitGeneratedFacets requires an understood q",
    ],
    [
      { q: "dress", understand: false, omitGeneratedFacets: ["color"] },
      "omitGeneratedFacets requires an understood q",
    ],
    [
      {
        q: "dress",
        facets: [{ name: "color", values: ["black"] }],
        omitGeneratedFacets: ["color"],
      },
      'facet "color" is in both facets and omitGeneratedFacets',
    ],
    [
      {
        facets: [
          { name: "color", values: ["black"] },
          { name: "color", values: ["navy"] },
        ],
      },
      'facets lists facet "color" more than once',
    ],
    [
      {
        excludeFacets: [
          { name: "brand_name", values: ["a"] },
          { name: "brand_name", values: ["b"] },
        ],
      },
      'excludeFacets lists facet "brand_name" more than once',
    ],
    [
      {
        facets: Array.from({ length: 51 }, (_, i) => ({
          name: `f${String(i)}`,
          values: ["x"],
        })),
      },
      "facets accepts at most 50 facets",
    ],
    [{ priceMin: -1 }, "priceMin must be a number >= 0"],
    [{ priceMin: 300, priceMax: 50 }, "priceMin must not exceed priceMax"],
    [{ brandQualityMin: 0 }, "brandQualityMin must be a number between 1 and 6"],
    [{ brandQualityMax: 7 }, "brandQualityMax must be a number between 1 and 6"],
    [
      { brandQualityMin: 5, brandQualityMax: 2 },
      "brandQualityMin must not exceed brandQualityMax",
    ],
    [
      { similarToBrands: [] },
      "similarToBrands must contain between 1 and 10 brand names",
    ],
    [
      { similarToBrands: Array.from({ length: 11 }, (_, i) => `b${String(i)}`) },
      "similarToBrands must contain between 1 and 10 brand names",
    ],
    [
      { similarToBrands: ["Acme", " "] },
      "similarToBrands must contain only non-empty brand names",
    ],
  ] as const)("rejects %j before making a request", async (params, message) => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(
      client.searchProducts(params as Parameters<typeof client.searchProducts>[0]),
    ).rejects.toThrow(message);
    expect(calls).toHaveLength(0);
  });

  it.each([
    [
      { similarToBrands: "Warren Lotas" },
      "similarToBrands must be an array of strings",
    ],
    [
      { q: "dress", omitGeneratedFacets: "color" },
      "omitGeneratedFacets must be an array",
    ],
    [{ facets: "color" }, "facets must be an array of facets"],
    [{ excludeFacets: "color" }, "excludeFacets must be an array of facets"],
  ])("refuses a bare string for a list: %j", async (params, message) => {
    // A JavaScript caller, or a TypeScript one casting past the type.
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(
      client.searchProducts(
        params as unknown as Parameters<typeof client.searchProducts>[0],
      ),
    ).rejects.toThrow(message);
    expect(calls).toHaveLength(0);
  });

  it("allows a facet name in both facets and excludeFacets", async () => {
    const { calls, fetchMock } = createFetchMock({ items: [], nextCursor: null });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.searchProducts({
      facets: [{ name: "color_family", values: ["blue"] }],
      excludeFacets: [{ name: "color_family", values: ["green"] }],
    });

    expect(calls).toHaveLength(1);
  });

  it("types the debug effectiveQuery", async () => {
    const { fetchMock } = createFetchMock(SEARCH_DEBUG_PAGE);
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.searchProducts({
      q: "black hoodie under $300",
      catalogs: ["warrenlotas"],
      facets: [{ name: "color", values: ["black"] }],
      relax: true,
      debug: true,
    });

    expect(page.requestId).toBe("3f2c0a52-5d8e-4a57-9a61-0c9f1f7b2d11");
    const effective = page.effectiveQuery;
    expect(effective?.understood).toBe(true);
    expect(effective?.text).toBe("black hoodie");
    expect(effective?.facets?.map((facet) => [facet.name, facet.source])).toEqual([
      ["color", "caller"],
      ["product_type", "generated"],
    ]);
    expect(effective?.excludeFacets).toEqual([]);
    expect(effective?.priceMax).toBe(300);
    expect(effective?.catalogs).toEqual(["warrenlotas"]);
    expect(effective?.relaxation?.rounds).toBe(1);
    expect(effective?.relaxation?.droppedFacets?.[0]).toEqual({
      name: "fit",
      values: ["oversized"],
      source: "generated",
    });
  });

  it("rejects an empty or malformed catalogs list before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.searchProducts({ catalogs: [] })).rejects.toThrow(
      "catalogs must contain between 1 and 500 catalog keys",
    );
    await expect(client.searchProducts({ catalogs: ["acme", ""] })).rejects.toThrow(
      "catalogs must contain only non-empty catalog keys",
    );
    await expect(
      client.searchProducts({
        catalogs: Array.from({ length: 501 }, (_, i) => `c${String(i)}`),
      }),
    ).rejects.toThrow("between 1 and 500");
    expect(calls).toHaveLength(0);
  });

  it("sends a typed more-like-this request", async () => {
    const { calls, fetchMock } = createFetchMock({
      source: {
        catalogKey: "acme",
        uuid: "product-1",
        productUrl: "https://example.com/products/linen-dress",
        title: "Linen Dress",
      },
      items: [
        {
          uuid: "product-2",
          catalogKey: "acme",
          productUrl: "https://example.com/products/cotton-dress",
          title: "Cotton Dress",
          currentPrice: 98,
          isActive: true,
          displayMatchScore: 92,
        },
      ],
      nextCursor: null,
      effectiveQuery: {
        text: "linen dress",
        retrievalEmbeddingColumns: ["style_embedding", "tags_embedding"],
        facets: [{ name: "gender", values: ["female"] }],
        priceMin: 128,
        limit: 3,
      },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.moreLikeThisProducts({
      catalogs: ["acme", "globex"],
      debug: true,
      excludeFacets: [{ name: FacetName.COLOR_FAMILY, values: ["Black"] }],
      facets: [{ name: FacetName.GENDER, values: ["female"] }],
      priceMin: 50,
      priceMax: 300,
      brandQualityMin: 3,
      brandQualityMax: 6,
      limit: 3,
      pricePreference: PricePreference.HIGHER,
      relax: false,
      source: { url: "https://example.com/products/linen-dress" },
    });

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/products/more-like-this`);
    expect(call.init?.method).toBe("POST");
    expect(requestBodyJson(call)).toEqual({
      catalogs: ["acme", "globex"],
      debug: true,
      exclude_facets: [{ name: "color_family", values: ["Black"] }],
      facets: [{ name: "gender", values: ["female"] }],
      price_min: 50,
      price_max: 300,
      brand_quality_min: 3,
      brand_quality_max: 6,
      limit: 3,
      price_preference: "higher",
      relax: false,
      source: { url: "https://example.com/products/linen-dress" },
    });
    expect(page.source?.catalogKey).toBe("acme");
    expect(page.sources).toBeUndefined();
    expect(page.items[0]?.catalogKey).toBe("acme");
    expect(page.items[0]?.displayMatchScore).toBe(92);
    expect(page.effectiveQuery?.priceMin).toBe(128);
  });

  it("leaves more-like-this relax to the server and never sends include_facets", async () => {
    const source = {
      catalogKey: "acme",
      productUrl: "https://example.com/p1",
      uuid: "p1",
    };
    const { calls, fetchMock } = createFetchMock({
      items: [],
      nextCursor: null,
      source,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.moreLikeThisProducts({ source: { uuid: "p1" } });
    await client.moreLikeThisProducts({ relax: true, source: { uuid: "p1" } });

    const [first, second] = calls.map((call) => requestBodyJson(call));
    expect(first).toEqual({
      debug: false,
      limit: 12,
      price_preference: "any",
      source: { uuid: "p1" },
    });
    expect(second).toMatchObject({ relax: true });
    for (const body of [first, second]) {
      expect(body).not.toHaveProperty("include_facets");
    }
  });

  it("parses more-like-this relaxation in search's shape", async () => {
    const { fetchMock } = createFetchMock({
      effectiveQuery: {
        brandQualityMin: 3,
        limit: 12,
        relaxation: {
          declinedRounds: 0,
          droppedFacets: [
            { name: "color_family", source: "generated", values: ["Blue"] },
          ],
          rounds: 1,
        },
        text: "linen dress",
      },
      items: [],
      nextCursor: null,
      source: { catalogKey: "acme", productUrl: "https://example.com/p1", uuid: "p1" },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.moreLikeThisProducts({ source: { uuid: "p1" } });

    expect(page.effectiveQuery?.brandQualityMin).toBe(3);
    expect(page.effectiveQuery?.relaxation?.rounds).toBe(1);
    expect(page.effectiveQuery?.relaxation?.droppedFacets?.[0]?.name).toBe(
      "color_family",
    );
  });

  it("rejects more-like-this contradictions and include_facets before a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    const source = { uuid: "p1" };

    await expect(
      client.moreLikeThisProducts({
        facets: [
          { name: FacetName.GENDER, values: ["female"] },
          { name: FacetName.GENDER, values: ["male"] },
        ],
        source,
      }),
    ).rejects.toThrow('facets lists facet "gender" more than once');
    await expect(
      client.moreLikeThisProducts({ priceMax: 100, priceMin: 200, source }),
    ).rejects.toThrow("priceMin must not exceed priceMax");
    await expect(
      client.moreLikeThisProducts({ brandQualityMin: 7, source }),
    ).rejects.toThrow("brandQualityMin must be a number");
    await expect(
      client.moreLikeThisProducts({
        // A JavaScript caller still on the 0.5.0 name.
        ...({ includeFacets: [{ name: "gender", values: ["female"] }] } as object),
        source,
      }),
    ).rejects.toThrow("moreLikeThisProducts takes facets, not includeFacets");
    expect(calls).toHaveLength(0);
  });

  it("rejects invalid more-like-this sources before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(
      client.moreLikeThisProducts({
        source: { url: "https://example.com/p", uuid: "p1" },
      }),
    ).rejects.toThrow("Exactly one of source.url or source.uuid is required");
    await expect(client.moreLikeThisProducts({ source: { url: "" } })).rejects.toThrow(
      "source.url is required",
    );
    expect(calls).toHaveLength(0);
  });

  it("sends more-like-this sources and parses them in request order", async () => {
    const { calls, fetchMock } = createFetchMock({
      items: [],
      nextCursor: null,
      requestId: "req-1",
      sources: [
        {
          catalogKey: "acme",
          productUrl: "https://example.com/p1",
          title: "Linen Dress",
          uuid: "p1",
        },
        { catalogKey: "globex", productUrl: "https://example.com/p2", uuid: "p2" },
      ],
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.moreLikeThisProducts({ limit: 5, sources: ["p1", "p2"] });

    expect(requestBodyJson(lastCall(calls))).toEqual({
      debug: false,
      limit: 5,
      price_preference: "any",
      sources: ["p1", "p2"],
    });
    expect(page.source).toBeUndefined();
    expect(page.sources?.map((source) => source.uuid)).toEqual(["p1", "p2"]);
    expect(page.sources?.[1]?.catalogKey).toBe("globex");
  });

  it("rejects invalid more-like-this sources lists before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.moreLikeThisProducts({})).rejects.toThrow("source is required");
    await expect(
      client.moreLikeThisProducts({ source: { uuid: "p1" }, sources: ["p2"] }),
    ).rejects.toThrow("Exactly one of source or sources is required");
    await expect(client.moreLikeThisProducts({ sources: [] })).rejects.toThrow(
      "between 1 and 20",
    );
    await expect(
      client.moreLikeThisProducts({
        sources: Array.from({ length: 21 }, (_, i) => `p${String(i)}`),
      }),
    ).rejects.toThrow("between 1 and 20");
    await expect(
      client.moreLikeThisProducts({ sources: ["p1", "p1"] }),
    ).rejects.toThrow("more than once");
    await expect(client.moreLikeThisProducts({ sources: [""] })).rejects.toThrow(
      "non-empty product UUIDs",
    );
    const bare = { sources: "p1" } as unknown as Parameters<
      OctogenClient["moreLikeThisProducts"]
    >[0];
    await expect(client.moreLikeThisProducts(bare)).rejects.toThrow("between 1 and 20");
    expect(calls).toHaveLength(0);
  });

  it("refuses the retired more-like-this catalog instead of dropping it", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    // What a JavaScript caller written against 0.3 still sends.
    const legacy = {
      catalog: "acme",
      source: { url: "https://example.com/p" },
    } as unknown as Parameters<OctogenClient["moreLikeThisProducts"]>[0];

    await expect(client.moreLikeThisProducts(legacy)).rejects.toThrow(
      "moreLikeThisProducts takes catalogs: [key], not catalog",
    );
    await expect(
      client.moreLikeThisProducts({ catalogs: [], source: { uuid: "p1" } }),
    ).rejects.toThrow("catalogs must contain between 1 and 100 catalog keys");
    await expect(
      client.moreLikeThisProducts({
        catalogs: Array.from({ length: 101 }, (_, i) => `c${String(i)}`),
        source: { uuid: "p1" },
      }),
    ).rejects.toThrow("between 1 and 100");
    expect(calls).toHaveLength(0);
  });

  it("parses product lookup responses", async () => {
    const { calls, fetchMock } = createFetchMock({
      source: "indexed",
      catalogKey: "acme",
      catalogDisplayName: "ACME",
      sourceBaseUrl: "https://example.com",
      requestedUrl: "https://example.com/products/linen-dress",
      normalizedUrl: "https://example.com/products/linen-dress",
      product: {
        uuid: "product-1",
        productUrl: "https://example.com/products/linen-dress",
        title: "Linen Dress",
        inStock: true,
        primaryImage: {
          url: "https://example.com/image.jpg",
          cdnUrl: "https://cdn.octogen.ai/abc/primary.webp",
        },
        images: [
          {
            url: "https://example.com/image.jpg",
            cdnUrl: "https://cdn.octogen.ai/abc/primary.webp",
            width: 1200,
            height: 1600,
            mimeType: "image/webp",
          },
        ],
        details: { materials: ["linen"], fit: ["relaxed"] },
        audience: { genders: ["female"], ageGroups: ["adult"] },
      },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const result = await client.lookupProduct(
      "https://example.com/products/linen-dress",
    );

    expect(result.catalogKey).toBe("acme");
    expect(result.normalizedUrl).toBe("https://example.com/products/linen-dress");
    expect(result.canonicalUrl).toBeUndefined();
    expect(result.product.inStock).toBe(true);
    expect(result.product.details?.materials).toEqual(["linen"]);
    expect(result.product.primaryImage?.cdnUrl).toBe(
      "https://cdn.octogen.ai/abc/primary.webp",
    );
    expect(result.product.images?.[0]?.url).toBe("https://example.com/image.jpg");
    expect(result.product.audience?.ageGroups).toEqual(["adult"]);
    expect(requestBodyJson(lastCall(calls))).toEqual({
      url: "https://example.com/products/linen-dress",
      resolutionMode: "auto",
      onDemandCachePolicy: "prefer_cache",
    });
  });

  it("sends lookup controls and parses on-demand responses", async () => {
    const { calls, fetchMock } = createFetchMock({
      requestId: "request-1",
      source: "on_demand",
      catalogKey: null,
      catalogDisplayName: null,
      sourceBaseUrl: null,
      requestedUrl: "https://example.com/products/linen-dress",
      resolvedUrl: "https://example.com/products/linen-dress",
      canonicalUrl: "https://example.com/products/linen-dress",
      product: {
        uuid: null,
        catalogKey: null,
        productUrl: "https://example.com/products/linen-dress",
        title: "Linen Dress",
        currentPrice: 128,
        currency: "USD",
        isActive: null,
      },
      resolution: {
        completeness: "partial",
        method: "json_ld",
        rendered: false,
        missingFields: ["brand"],
      },
      cacheStatus: "refresh",
      warnings: ["missing_brand"],
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const result = await client.lookupProduct(
      "https://example.com/products/linen-dress",
      {
        resolutionMode: ProductLookupResolutionMode.ON_DEMAND_ONLY,
        onDemandCachePolicy: ProductLookupCachePolicy.REFRESH,
      },
    );

    expect(result.source).toBe("on_demand");
    expect(result.catalogKey).toBeNull();
    expect(result.product.uuid).toBeNull();
    expect(result.product.isActive).toBeNull();
    expect(result.product.currency).toBe("USD");
    expect(result.resolution?.missingFields).toEqual(["brand"]);
    expect(result.cacheStatus).toBe("refresh");
    expect(result.warnings).toEqual(["missing_brand"]);
    expect(requestBodyJson(lastCall(calls))).toEqual({
      url: "https://example.com/products/linen-dress",
      resolutionMode: "on_demand_only",
      onDemandCachePolicy: "refresh",
    });
  });

  it("rejects empty lookup URLs before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.lookupProduct("")).rejects.toThrow("url is required");
    expect(calls).toHaveLength(0);
  });

  it("rejects refresh cache policy for index-only lookup", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(
      client.lookupProduct("https://example.com/product", {
        resolutionMode: ProductLookupResolutionMode.INDEX_ONLY,
        onDemandCachePolicy: ProductLookupCachePolicy.REFRESH,
      }),
    ).rejects.toThrow("onDemandCachePolicy does not apply to index_only");
    expect(calls).toHaveLength(0);
  });

  it("includes status and detail on API errors", async () => {
    const { fetchMock } = createFetchMock(
      { detail: "product_not_found" },
      { status: 404 },
    );
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(
      client.lookupProduct("https://example.com/missing"),
    ).rejects.toMatchObject({
      detail: "product_not_found",
      statusCode: 404,
    });
    await expect(
      client.lookupProduct("https://example.com/missing"),
    ).rejects.toBeInstanceOf(OctogenNotFoundError);
  });

  it("wraps rate limit responses as API errors", async () => {
    const { fetchMock } = createFetchMock({ detail: "rate_limited" }, { status: 429 });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(
      client.lookupProduct("https://example.com/product"),
    ).rejects.toMatchObject({
      detail: "rate_limited",
      statusCode: 429,
    });
    await expect(
      client.lookupProduct("https://example.com/product"),
    ).rejects.toBeInstanceOf(OctogenAPIError);
  });

  it("wraps connection failures", async () => {
    const fetchMock: FetchLike = () => {
      return Promise.reject(new TypeError("request timed out"));
    };
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(
      client.lookupProduct("https://example.com/product"),
    ).rejects.toBeInstanceOf(OctogenConnectionError);
    await expect(client.lookupProduct("https://example.com/product")).rejects.toThrow(
      "request timed out",
    );
  });

  it("returns no body for 204 responses", async () => {
    const { fetchMock } = createFetchMock(undefined, { status: 204 });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    const requestableClient = client as unknown as RequestableOctogenClient;

    const { data } = await requestableClient.request("deleteUrlList", {
      pathParams: { urlListId: "cul_1" },
    });
    expect(data).toBeUndefined();
  });
});

const LIST_ID = "cul_01HZY3WQ8K4V9P2M5X7R00AA";
const LIST_JSON = {
  urlListId: LIST_ID,
  name: "q3-campaign",
  status: "active",
  urlCount: 2,
  bigQuery: {
    exchangeId: "catalogs_prod",
    listingId: `coverage_${LIST_ID}_v1`,
    sharedDatasetId: `coverage_share_${LIST_ID}_v1`,
    viewId: "products_current_v1",
    lastExportedAt: "2026-08-06T06:30:00Z",
    lastRowCount: 1128,
    readerCount: 1,
  },
  createdAt: "2026-08-05T12:00:00Z",
  updatedAt: "2026-08-06T06:30:00Z",
};

describe("OctogenClient coverage URL lists", () => {
  it("creates a coverage URL list", async () => {
    const { calls, fetchMock } = createFetchMock(
      { ...LIST_JSON, status: "provisioning", urlCount: 0, bigQuery: null },
      { status: 201 },
    );
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const urlList = await client.createCoverageUrlList("q3-campaign");

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/coverage/url-lists`);
    expect(call.init?.method).toBe("POST");
    expect(requestBodyJson(call)).toEqual({ name: "q3-campaign" });
    expect(urlList.status).toBe("provisioning");
    expect(urlList.bigQuery).toBeNull();
  });

  it("rejects an empty list name locally", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    await expect(client.createCoverageUrlList("")).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it("lists coverage URL lists with pagination params", async () => {
    const { calls, fetchMock } = createFetchMock({
      items: [LIST_JSON],
      nextCursor: "cursor-2",
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.listCoverageUrlLists({
      cursor: "cursor-1",
      limit: 10,
    });

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/coverage/url-lists?cursor=cursor-1&limit=10`);
    expect(call.init?.method).toBe("GET");
    expect(call.init?.body).toBeUndefined();
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.items[0]?.bigQuery?.readerCount).toBe(1);
  });

  it("omits the query string when no pagination params are set", async () => {
    const { calls, fetchMock } = createFetchMock({ items: [], nextCursor: null });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.listCoverageUrlLists();

    expect(lastCall(calls).input).toBe(`${BASE_URL}/coverage/url-lists`);
  });

  it("gets and deletes a coverage URL list by id", async () => {
    const { calls, fetchMock } = createFetchMock(LIST_JSON);
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.getCoverageUrlList(LIST_ID);
    expect(lastCall(calls).input).toBe(`${BASE_URL}/coverage/url-lists/${LIST_ID}`);
    expect(lastCall(calls).init?.method).toBe("GET");

    const deleting = createFetchMock(
      { ...LIST_JSON, status: "delete_pending" },
      { status: 202 },
    );
    const deleter = new OctogenClient({ apiKey: "key", fetch: deleting.fetchMock });
    const urlList = await deleter.deleteCoverageUrlList(LIST_ID);
    expect(lastCall(deleting.calls).init?.method).toBe("DELETE");
    expect(urlList.status).toBe("delete_pending");
  });

  it("adds URLs and surfaces per-URL outcomes", async () => {
    const { calls, fetchMock } = createFetchMock({
      accepted: [
        {
          url: "https://shop.example/products/dress?utm_source=x",
          normalizedUrl: "https://shop.example/products/dress",
        },
      ],
      rejected: [
        { url: "not-a-url", code: "invalid_url", message: "URL must be absolute." },
      ],
      urlCount: 3,
      requestId: "req-1",
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const result = await client.addCoverageUrlListUrls(LIST_ID, [
      "https://shop.example/products/dress?utm_source=x",
      "not-a-url",
    ]);

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/coverage/url-lists/${LIST_ID}/urls`);
    expect(requestBodyJson(call)).toEqual({
      urls: ["https://shop.example/products/dress?utm_source=x", "not-a-url"],
    });
    expect(result.rejected[0]?.code).toBe("invalid_url");
    expect(result.urlCount).toBe(3);
  });

  it("rejects an oversized URL batch locally", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    await expect(client.addCoverageUrlListUrls(LIST_ID, [])).rejects.toThrow(TypeError);
    await expect(
      client.removeCoverageUrlListUrls(
        LIST_ID,
        Array.from({ length: 1001 }, (_, i) => `https://a.example/p/${String(i)}`),
      ),
    ).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it("removes and checks URLs", async () => {
    const removeMock = createFetchMock({
      accepted: [],
      rejected: [],
      urlCount: 1,
      requestId: "req-2",
    });
    const client = new OctogenClient({
      apiKey: "key",
      fetch: removeMock.fetchMock,
    });
    const removed = await client.removeCoverageUrlListUrls(LIST_ID, [
      "https://shop.example/products/skirt",
    ]);
    expect(lastCall(removeMock.calls).input).toBe(
      `${BASE_URL}/coverage/url-lists/${LIST_ID}/urls/remove`,
    );
    expect(removed.urlCount).toBe(1);

    const containsMock = createFetchMock({
      results: [
        {
          url: "https://shop.example/products/dress",
          normalizedUrl: "https://shop.example/products/dress",
          present: true,
          addedAt: "2026-08-05T12:00:00Z",
        },
        {
          url: "https://shop.example/products/coat",
          normalizedUrl: "https://shop.example/products/coat",
          present: false,
          addedAt: null,
        },
      ],
    });
    const checker = new OctogenClient({
      apiKey: "key",
      fetch: containsMock.fetchMock,
    });
    const contains = await checker.checkCoverageUrlListUrls(LIST_ID, [
      "https://shop.example/products/dress",
      "https://shop.example/products/coat",
    ]);
    expect(lastCall(containsMock.calls).input).toBe(
      `${BASE_URL}/coverage/url-lists/${LIST_ID}/urls/contains`,
    );
    expect(contains.results.map((r) => r.present)).toEqual([true, false]);
  });

  it("enumerates a list's URLs with pagination", async () => {
    const { calls, fetchMock } = createFetchMock({
      items: [
        {
          url: "https://shop.example/products/dress?utm_source=x",
          normalizedUrl: "https://shop.example/products/dress",
          addedAt: "2026-08-05T12:00:00Z",
        },
      ],
      nextCursor: null,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.listCoverageUrlListUrls(LIST_ID, { limit: 500 });

    expect(lastCall(calls).input).toBe(
      `${BASE_URL}/coverage/url-lists/${LIST_ID}/urls?limit=500`,
    );
    expect(page.items[0]?.normalizedUrl).toBe("https://shop.example/products/dress");
    expect(page.nextCursor).toBeNull();
  });

  it("percent-encodes the url list id path segment", async () => {
    const { calls, fetchMock } = createFetchMock(LIST_JSON);
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.getCoverageUrlList("cul/../weird id");

    expect(lastCall(calls).input).toBe(
      `${BASE_URL}/coverage/url-lists/cul%2F..%2Fweird%20id`,
    );
  });
});

describe("the keyless metered trial", () => {
  it("refuses to build a keyless client unless asked", () => {
    // Off by default: a client with no key is only useful against three routes,
    // and silently degrading to it would turn a misconfigured deployment into a
    // 30-request-a-day one.
    expect(() => new OctogenClient({ fetch: createFetchMock().fetchMock })).toThrow(
      MissingAPIKeyError,
    );
  });

  it("sends no Authorization header at all with allowKeyless", async () => {
    // Not a blank one: `Authorization: Bearer ` earns `401 Invalid API key`.
    // The trial is entered by presenting nothing.
    const { calls, fetchMock } = createFetchMock({ domains: [] });
    const client = new OctogenClient({ allowKeyless: true, fetch: fetchMock });
    expect(client.isKeyless).toBe(true);

    await client.searchProducts({ q: "dress" });

    const headers = lastCall(calls).init?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Authorization");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("still prefers a key when one is available", async () => {
    process.env[API_KEY_ENV_VAR] = "octo_test_key";
    const { calls, fetchMock } = createFetchMock({ domains: [] });
    const client = new OctogenClient({ allowKeyless: true, fetch: fetchMock });
    expect(client.isKeyless).toBe(false);

    await client.searchProducts({ q: "dress" });

    expect(lastCall(calls).init?.headers).toMatchObject({
      Authorization: "Bearer octo_test_key",
    });
  });

  it("names the three eligible operations, so a caller can ask before spending", () => {
    expect([...KEYLESS_TRIAL_OPERATIONS].sort()).toEqual([
      "lookupProduct",
      "searchProducts",
    ]);
  });
});

describe("fetchRaw, the escape hatch", () => {
  it("issues an arbitrary path with the credential and the timeout", async () => {
    process.env[API_KEY_ENV_VAR] = "octo_test_key";
    const { calls, fetchMock } = createFetchMock({ brand_name: "Nike" });
    const client = new OctogenClient({ fetch: fetchMock });

    const response = await client.fetchRaw("GET", "/brands/nike");

    expect(lastCall(calls).input).toBe(`${BASE_URL}/brands/nike`);
    expect(lastCall(calls).init?.headers).toMatchObject({
      Authorization: "Bearer octo_test_key",
    });
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ brand_name: "Nike" });
  });

  it("returns the response headers, so a caller can read its own rate limit", async () => {
    process.env[API_KEY_ENV_VAR] = "octo_test_key";
    const { fetchMock } = createFetchMock(
      {},
      { headers: { "X-RateLimit-Remaining": "118" } },
    );
    const client = new OctogenClient({ fetch: fetchMock });

    const response = await client.fetchRaw("GET", "/me");

    expect(response.headers["x-ratelimit-remaining"]).toBe("118");
  });

  it("accepts a leading slash, no slash, or a full URL on the configured base", async () => {
    process.env[API_KEY_ENV_VAR] = "octo_test_key";
    const { calls, fetchMock } = createFetchMock({});
    const client = new OctogenClient({ fetch: fetchMock });

    await client.fetchRaw("GET", "/me");
    await client.fetchRaw("GET", "me");
    await client.fetchRaw("GET", `${BASE_URL}/me`);

    expect(calls.map((call) => call.input)).toEqual([
      `${BASE_URL}/me`,
      `${BASE_URL}/me`,
      `${BASE_URL}/me`,
    ]);
  });

  it("refuses a URL on another origin rather than sending the key there", async () => {
    process.env[API_KEY_ENV_VAR] = "octo_test_key";
    const { calls, fetchMock } = createFetchMock({});
    const client = new OctogenClient({ fetch: fetchMock });

    await expect(client.fetchRaw("GET", "https://evil.example/v1/me")).rejects.toThrow(
      TypeError,
    );
    expect(calls).toHaveLength(0);
  });

  it("throws the same typed errors as every other method", async () => {
    process.env[API_KEY_ENV_VAR] = "octo_test_key";
    const { fetchMock } = createFetchMock(
      { detail: "product_not_found" },
      { status: 404 },
    );
    const client = new OctogenClient({ fetch: fetchMock });

    await expect(client.fetchRaw("GET", "/brands/nobody")).rejects.toThrow(
      OctogenNotFoundError,
    );
  });

  it("works keyless too, for the three routes that answer that way", async () => {
    const { calls, fetchMock } = createFetchMock({ domains: [] });
    const client = new OctogenClient({ allowKeyless: true, fetch: fetchMock });

    await client.fetchRaw("GET", "/domains");

    expect(lastCall(calls).init?.headers).not.toHaveProperty("Authorization");
  });
});

function createFetchMock(
  body: unknown = {},
  init: ResponseInit = {},
): { calls: FetchCall[]; fetchMock: FetchLike } {
  const calls: FetchCall[] = [];
  const fetchMock: FetchLike = (input, requestInit) => {
    calls.push({ input, init: requestInit });
    if (init.status === 204) {
      return Promise.resolve(new Response(null, init));
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status: 200,
        ...init,
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

function requestBodyJson(call: FetchCall): unknown {
  if (typeof call.init?.body !== "string") {
    throw new TypeError("Expected string request body");
  }
  return JSON.parse(call.init.body) as unknown;
}

it("does not expose the retired refresh method", () => {
  expect("refreshProducts" in OctogenClient.prototype).toBe(false);
});

/**
 * A `debug: true` search page in the shape of the published
 * `ProgrammaticProductSearchPage` / `ProgrammaticProductSearchEffectiveQuery`
 * schemas, with values from the contract's `POST /products/search` example.
 */
const SEARCH_DEBUG_PAGE = {
  items: [
    {
      uuid: "prod_01HX...",
      title: "Black Hoodie",
      productUrl: "https://warrenlotas.com/products/black-hoodie",
      currentPrice: 180,
      isActive: true,
    },
  ],
  nextCursor: "eyJzZWFyY2hBZnRlciI6Wy4uLl19",
  requestId: "3f2c0a52-5d8e-4a57-9a61-0c9f1f7b2d11",
  effectiveQuery: {
    text: "black hoodie",
    understood: true,
    facets: [
      { name: "color", values: ["black"], source: "caller" },
      { name: "product_type", values: ["hoodie"], source: "generated" },
    ],
    excludeFacets: [],
    priceMin: null,
    priceMax: 300,
    brandQualityMin: null,
    brandQualityMax: null,
    similarToBrands: null,
    catalogs: ["warrenlotas"],
    relaxation: {
      rounds: 1,
      droppedFacets: [{ name: "fit", values: ["oversized"], source: "generated" }],
      declinedRounds: 0,
    },
  },
};
