import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  OctogenNotFoundError,
  PricePreference,
  ProductLookupCachePolicy,
  ProductLookupResolutionMode,
  USER_AGENT,
  type FetchLike,
} from "../src/index.js";

const BASE_URL = "https://api.octogen.ai/v1";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/platform-v1",
);

/** Load a fixture shared with the Python suite and the conformance tests. */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));
}

interface FetchCall {
  input: string;
  init: RequestInit | undefined;
}

/** `ResponseInit`, but with `headers` narrowed so it is spreadable. */
interface MockResponseInit extends Omit<ResponseInit, "headers"> {
  headers?: Record<string, string>;
}

interface RequestableOctogenClient {
  request(
    method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT",
    path: string,
    json?: object,
  ): Promise<unknown>;
}

const API_KEY_ENV_VARS = [API_KEY_ENV_VAR, DEPRECATED_API_KEY_ENV_VAR];

let originalApiKeys: Record<string, string | undefined> = {};

beforeEach(() => {
  originalApiKeys = {};
  for (const name of API_KEY_ENV_VARS) {
    originalApiKeys[name] = process.env[name];
    Reflect.deleteProperty(process.env, name);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const name of API_KEY_ENV_VARS) {
    const original = originalApiKeys[name];
    if (original === undefined) {
      Reflect.deleteProperty(process.env, name);
    } else {
      process.env[name] = original;
    }
  }
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

  it("falls back to OCTO_API_KEY with a deprecation warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env[DEPRECATED_API_KEY_ENV_VAR] = "octo_legacy_key";
    const { calls, fetchMock } = createFetchMock({ items: [], nextCursor: null });

    const client = new OctogenClient({ fetch: fetchMock });
    await client.searchProducts({ q: "shirt", limit: 1 });

    expect(lastCall(calls).init?.headers).toMatchObject({
      Authorization: "Bearer octo_legacy_key",
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(DEPRECATED_API_KEY_ENV_VAR),
    );
    expect(warn.mock.calls[0]?.[0]).toContain(API_KEY_ENV_VAR);
  });

  it("prefers OCTOGEN_PLATFORM_API_KEY over the deprecated name", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env[API_KEY_ENV_VAR] = "octo_current_key";
    process.env[DEPRECATED_API_KEY_ENV_VAR] = "octo_legacy_key";
    const { calls, fetchMock } = createFetchMock({ items: [], nextCursor: null });

    const client = new OctogenClient({ fetch: fetchMock });
    await client.searchProducts({ q: "shirt", limit: 1 });

    expect(lastCall(calls).init?.headers).toMatchObject({
      Authorization: "Bearer octo_current_key",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("lists covered domains and returns the ETag", async () => {
    const { calls, fetchMock } = createFetchMock(fixture("list-domains"), {
      headers: { ETag: '"domains-v1"' },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const result = await client.listDomains();

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/domains`);
    expect(call.init?.method).toBe("GET");
    expect(result.notModified).toBe(false);
    expect(result.etag).toBe('"domains-v1"');
    expect(result.domains?.map((entry) => entry.host)).toEqual([
      "allbirds.com",
      "www.allbirds.com",
      "shop.acme.example",
    ]);
  });

  it("revalidates covered domains with If-None-Match and handles 304", async () => {
    const { calls, fetchMock } = createFetchMock(null, {
      headers: { ETag: '"domains-v1"' },
      status: 304,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const result = await client.listDomains({ ifNoneMatch: '"domains-v1"' });

    expect(lastCall(calls).init?.headers).toMatchObject({
      "If-None-Match": '"domains-v1"',
    });
    expect(result.notModified).toBe(true);
    expect(result.domains).toBeNull();
    expect(result.etag).toBe('"domains-v1"');
  });

  it("resolves a product from supplied HTML", async () => {
    const { calls, fetchMock } = createFetchMock(fixture("resolve-from-html"));
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const response = await client.resolveProductFromHtml({
      html: "<html><body>…</body></html>",
      url: "https://shop.acme.example/products/linen-dress?variant=blue",
    });

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/products/resolve-from-html`);
    expect(call.init?.method).toBe("POST");
    expect(requestBodyJson(call)).toEqual({
      html: "<html><body>…</body></html>",
      url: "https://shop.acme.example/products/linen-dress?variant=blue",
    });
    expect(response.product.title).toBe("Linen Dress");
    // The discriminant this path — and only this path — returns.
    expect(response.source).toBe("client_html");
    // On a storefront that records the variant only in the query string, the
    // echoed request URL is the sole variant-qualified identity in the response.
    expect(response.requestedUrl).toBe(
      "https://shop.acme.example/products/linen-dress?variant=blue",
    );
  });

  it("omits url from a resolve-from-html request when not supplied", async () => {
    const { calls, fetchMock } = createFetchMock(fixture("resolve-from-html"));
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.resolveProductFromHtml({ html: "<html></html>" });

    expect(requestBodyJson(lastCall(calls))).toEqual({ html: "<html></html>" });
  });

  it("rejects an empty resolve-from-html body before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.resolveProductFromHtml({ html: "" })).rejects.toThrow(
      "html is required",
    );
    expect(calls).toHaveLength(0);
  });

  it("reports a dispatched voyage as not joined", async () => {
    const { calls, fetchMock } = createFetchMock(fixture("voyage-task-running"), {
      status: 202,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const result = await client.startVoyage("shop.acme.example");

    const call = lastCall(calls);
    expect(call.input).toBe(`${BASE_URL}/voyage`);
    expect(call.init?.method).toBe("POST");
    expect(requestBodyJson(call)).toEqual({ domain: "shop.acme.example" });
    expect(result.joined).toBe(false);
    expect(result.task.status).toBe("running");
  });

  it("reports a joined voyage, which consumes no quota", async () => {
    const { fetchMock } = createFetchMock(fixture("voyage-task-completed"), {
      status: 200,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const result = await client.startVoyage("https://allbirds.com/collections/all");

    expect(result.joined).toBe(true);
    expect(result.task.result?.catalog).toBe("allbirds");
  });

  it("lists voyages with filters and reports quotas", async () => {
    const { calls, fetchMock } = createFetchMock(fixture("voyage-list"));
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.listVoyages({ status: "running", limit: 10 });

    expect(lastCall(calls).input).toBe(`${BASE_URL}/voyage?status=running&limit=10`);
    expect(page.items).toHaveLength(2);
    expect(page.quotas?.monthly.used).toBe(4);
  });

  it("polls one voyage by task id", async () => {
    const { calls, fetchMock } = createFetchMock(fixture("voyage-task-completed"));
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const task = await client.getVoyage("voyage_01J8Z4M0000000000000000001");

    expect(lastCall(calls).input).toBe(
      `${BASE_URL}/voyage/voyage_01J8Z4M0000000000000000001`,
    );
    expect(task.progressPercent).toBe(100);
  });

  it("sends a typed product refresh request", async () => {
    const { calls, fetchMock } = createFetchMock(fixture("product-refresh"), {
      status: 202,
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const response = await client.refreshProducts({
      targets: [
        {
          catalog: "acme",
          url: "https://shop.acme.example/products/linen-dress",
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
          url: "https://shop.acme.example/products/linen-dress",
        },
        { uuid: "missing-product" },
      ],
    });
    expect(response.submitted).toBe(2);
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

  it("returns undefined for 204 responses", async () => {
    const { fetchMock } = createFetchMock(undefined, { status: 204 });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });
    const requestableClient = client as unknown as RequestableOctogenClient;

    await expect(
      requestableClient.request("DELETE", "/products/lookup"),
    ).resolves.toBeUndefined();
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

function createFetchMock(
  body: unknown = {},
  init: MockResponseInit = {},
): { calls: FetchCall[]; fetchMock: FetchLike } {
  const calls: FetchCall[] = [];
  const fetchMock: FetchLike = (input, requestInit) => {
    calls.push({ input, init: requestInit });
    if (init.status === 204 || init.status === 304) {
      return Promise.resolve(new Response(null, init));
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
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
