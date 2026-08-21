import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  API_KEY_ENV_VAR,
  DEPRECATED_API_KEY_ENV_VAR,
  EmbeddingColumn,
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

  it("sends a typed product refresh request", async () => {
    const { calls, fetchMock } = createFetchMock(
      {
        requestId: "request-1",
        submitted: 2,
        workflowId: "refresh-request-1-acme-0001-products",
        workflowStatus: "launched",
        workflowAttempts: 1,
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

    const response = await client.refreshProducts({
      targets: [
        {
          catalog: "acme",
          url: "https://example.com/products/linen-dress",
        },
        { uuid: "missing-product" },
      ],
    });

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/products/refresh`);
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
    expect(response.workflowId).toBe("refresh-request-1-acme-0001-products");
    expect(response.workflowStatus).toBe("launched");
    expect(response.accepted[0]?.catalog).toBe("acme");
    expect(response.rejected[0]?.code).toBe("product_not_found");
  });

  it("rejects invalid product refresh targets before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.refreshProducts({ targets: [] })).rejects.toThrow(
      "targets must contain between 1 and 500 items",
    );
    await expect(
      client.refreshProducts({
        targets: [{ url: "https://example.com/p", uuid: "product-1" }],
      }),
    ).rejects.toThrow("Exactly one of targets[0].url or targets[0].uuid is required");
    await expect(
      client.refreshProducts({
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
    expect(result.normalizedUrl).toBe("https://example.com/products/linen-dress");
    expect(result.canonicalUrl).toBeUndefined();
    expect(result.product.inStock).toBe(true);
    expect(result.product.details?.materials).toEqual(["linen"]);
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

    await client.listDomains();

    const headers = lastCall(calls).init?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Authorization");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("still prefers a key when one is available", async () => {
    process.env[API_KEY_ENV_VAR] = "octo_test_key";
    const { calls, fetchMock } = createFetchMock({ domains: [] });
    const client = new OctogenClient({ allowKeyless: true, fetch: fetchMock });
    expect(client.isKeyless).toBe(false);

    await client.listDomains();

    expect(lastCall(calls).init?.headers).toMatchObject({
      Authorization: "Bearer octo_test_key",
    });
  });

  it("names the three eligible operations, so a caller can ask before spending", () => {
    expect([...KEYLESS_TRIAL_OPERATIONS].sort()).toEqual([
      "listDomains",
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
