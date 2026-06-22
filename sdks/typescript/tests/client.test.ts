import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  EmbeddingColumn,
  FacetName,
  MissingAPIKeyError,
  OctogenAPIError,
  OctogenClient,
  OctogenConnectionError,
  OctogenNotFoundError,
  PricePreference,
  USER_AGENT,
  type FetchLike,
} from "../src/index.js";

const BASE_URL = "https://api.octogen.ai/v1";

interface FetchCall {
  input: string;
  init: RequestInit | undefined;
}

interface RequestableOctogenClient {
  request(
    method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT",
    path: string,
    json?: object,
  ): Promise<unknown>;
}

let originalApiKey: string | undefined;

beforeEach(() => {
  originalApiKey = process.env["OCTO_API_KEY"];
  delete process.env["OCTO_API_KEY"];
});

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env["OCTO_API_KEY"];
  } else {
    process.env["OCTO_API_KEY"] = originalApiKey;
  }
});

describe("OctogenClient", () => {
  it("requires an API key", () => {
    expect(() => new OctogenClient({ fetch: createFetchMock().fetchMock })).toThrow(
      MissingAPIKeyError,
    );
  });

  it("uses OCTO_API_KEY from the environment", async () => {
    process.env["OCTO_API_KEY"] = "octo_test_key";
    const { calls, fetchMock } = createFetchMock([
      {
        catalog: "acme",
        displayName: "ACME",
        sourceBaseUrl: "https://example.com",
        productCount: 12,
        lastIndexedAt: "2026-05-01T12:00:00Z",
      },
    ]);

    const client = new OctogenClient({ fetch: fetchMock });
    const catalogs = await client.listCatalogs();

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/catalogs`);
    expect(call.init?.method).toBe("GET");
    expect(call.init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer octo_test_key",
      "User-Agent": USER_AGENT,
    });
    expect(catalogs[0]?.catalog).toBe("acme");
    expect(catalogs[0]?.displayName).toBe("ACME");
    expect(catalogs[0]?.productCount).toBe(12);
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
      catalog: "acme",
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
      catalog: "acme",
      facets: [{ name: "gender", values: ["female"] }],
      limit: 5,
      q: "linen summer dress",
    });
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.items[0]?.title).toBe("Linen Dress");
    expect(page.items[0]?.brand?.name).toBe("ACME");
  });

  it("sends a typed product recrawl request", async () => {
    const { calls, fetchMock } = createFetchMock(
      {
        requestId: "request-1",
        submitted: 2,
        tasksCreated: 1,
        taskIds: ["recrawl-request-1-acme-0001-products"],
        accepted: [
          {
            catalog: "acme",
            url: "https://example.com/products/linen-dress",
          },
        ],
        rejected: [
          {
            target: { uuid: "missing-product" },
            code: "product_not_found",
            message: "No active product matched that UUID.",
          },
        ],
      },
      { status: 202 },
    );
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const response = await client.recrawlProducts({
      targets: [
        {
          catalog: "acme",
          url: "https://example.com/products/linen-dress",
        },
        { uuid: "missing-product" },
      ],
    });

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/products/recrawl`);
    expect(call.init?.method).toBe("POST");
    expect(requestBodyJson(call)).toEqual({
      targets: [
        {
          catalog: "acme",
          url: "https://example.com/products/linen-dress",
        },
        { uuid: "missing-product" },
      ],
    });
    expect(response.requestId).toBe("request-1");
    expect(response.tasksCreated).toBe(1);
    expect(response.taskIds).toEqual(["recrawl-request-1-acme-0001-products"]);
    expect(response.accepted[0]?.catalog).toBe("acme");
    expect(response.rejected[0]?.code).toBe("product_not_found");
  });

  it("rejects invalid product recrawl targets before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.recrawlProducts({ targets: [] })).rejects.toThrow(
      "targets must contain between 1 and 500 items",
    );
    await expect(
      client.recrawlProducts({
        targets: [{ url: "https://example.com/p", uuid: "product-1" }],
      }),
    ).rejects.toThrow("Exactly one of targets[0].url or targets[0].uuid is required");
    await expect(
      client.recrawlProducts({
        targets: [{ catalog: "", uuid: "product-1" }],
      }),
    ).rejects.toThrow("targets[0].catalog is required");
    expect(calls).toHaveLength(0);
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

  it("serializes text search query options to API field names", async () => {
    const { calls, fetchMock } = createFetchMock({ items: [], nextCursor: null });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.searchProducts({
      catalog: "acme",
      textSearchQuery: {
        retrievalEmbeddingColumns: [EmbeddingColumn.STYLE_EMBEDDING],
        text: "relaxed cotton shirts",
      },
    });

    expect(requestBodyJson(lastCall(calls))).toMatchObject({
      text_search_query: {
        retrieval_embedding_columns: ["style_embedding"],
        text: "relaxed cotton shirts",
      },
    });
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
      catalog: "acme",
      debug: true,
      excludeFacets: [{ name: FacetName.COLOR_FAMILY, values: ["Black"] }],
      includeFacets: [{ name: FacetName.GENDER, values: ["female"] }],
      limit: 3,
      pricePreference: PricePreference.HIGHER,
      source: { url: "https://example.com/products/linen-dress" },
    });

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/products/more-like-this`);
    expect(call.init?.method).toBe("POST");
    expect(requestBodyJson(call)).toEqual({
      catalog: "acme",
      debug: true,
      exclude_facets: [{ name: "color_family", values: ["Black"] }],
      include_facets: [{ name: "gender", values: ["female"] }],
      limit: 3,
      price_preference: "higher",
      source: { url: "https://example.com/products/linen-dress" },
    });
    expect(page.source.catalogKey).toBe("acme");
    expect(page.items[0]?.catalogKey).toBe("acme");
    expect(page.items[0]?.displayMatchScore).toBe(92);
    expect(page.effectiveQuery?.priceMin).toBe(128);
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

  it("parses product lookup responses", async () => {
    const { fetchMock } = createFetchMock({
      catalogKey: "acme",
      catalogDisplayName: "ACME",
      sourceBaseUrl: "https://example.com",
      product: {
        uuid: "product-1",
        productUrl: "https://example.com/products/linen-dress",
        title: "Linen Dress",
        inStock: true,
        images: ["https://example.com/image.jpg"],
        details: { materials: ["linen"], fit: ["relaxed"] },
        audience: { genders: ["female"], ageGroups: ["adult"] },
      },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const result = await client.lookupProduct(
      "https://example.com/products/linen-dress",
    );

    expect(result.catalogKey).toBe("acme");
    expect(result.product.inStock).toBe(true);
    expect(result.product.details?.materials).toEqual(["linen"]);
    expect(result.product.audience?.ageGroups).toEqual(["adult"]);
  });

  it("rejects empty lookup URLs before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.lookupProduct("")).rejects.toThrow("url is required");
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

    await expect(client.listCatalogs()).rejects.toMatchObject({
      detail: "rate_limited",
      statusCode: 429,
    });
    await expect(client.listCatalogs()).rejects.toBeInstanceOf(OctogenAPIError);
  });

  it("wraps connection failures", async () => {
    const fetchMock: FetchLike = () => {
      return Promise.reject(new TypeError("request timed out"));
    };
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.listCatalogs()).rejects.toBeInstanceOf(OctogenConnectionError);
    await expect(client.listCatalogs()).rejects.toThrow("request timed out");
  });

  it("returns undefined for 204 responses", async () => {
    const { fetchMock } = createFetchMock(undefined, { status: 204 });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    const requestableClient = client as unknown as RequestableOctogenClient;

    await expect(
      requestableClient.request("DELETE", "/products/lookup"),
    ).resolves.toBeUndefined();
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
