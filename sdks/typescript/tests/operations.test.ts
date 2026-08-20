import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  API_KEY_ENV_VAR,
  DEPRECATED_API_KEY_ENV_VAR,
  OPERATIONS,
  OctogenClient,
  resolveOperationPath,
  type FetchLike,
} from "../src/index.js";

const BASE_URL = "https://api.octogen.ai/v1";

interface FetchCall {
  input: string;
  init: RequestInit | undefined;
}

function createFetchMock(
  body: unknown = {},
  init: ResponseInit = {},
): { calls: FetchCall[]; fetchMock: FetchLike } {
  const calls: FetchCall[] = [];
  const fetchMock: FetchLike = (input, requestInit) => {
    calls.push({ input, init: requestInit });
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

function requestBodyJson(call: FetchCall | undefined): unknown {
  if (typeof call?.init?.body !== "string") {
    throw new TypeError("Expected string request body");
  }
  return JSON.parse(call.init.body) as unknown;
}

describe("resolveOperationPath", () => {
  it("substitutes and percent-encodes path parameters", () => {
    expect(resolveOperationPath("/voyage/{task_id}", { task_id: "task-1/../x" })).toBe(
      "/voyage/task-1%2F..%2Fx",
    );
    expect(resolveOperationPath("/domains")).toBe("/domains");
  });

  it("refuses a missing or blank path parameter", () => {
    expect(() => resolveOperationPath("/voyage/{task_id}", {})).toThrow(
      "task_id is required",
    );
    expect(() => resolveOperationPath("/voyage/{task_id}", { task_id: "   " })).toThrow(
      "task_id is required",
    );
  });
});

describe("OctogenClient#getMe", () => {
  it("requests /me and returns the caller's identity", async () => {
    const { calls, fetchMock } = createFetchMock({
      principal: "api_key",
      organization: {
        id: "0f5b1c9e-6d4a-4a1f-9f0e-2c7b8a9d1e33",
        name: "Acme Co",
        slug: "acme-co",
        type: "catalog_partner",
      },
      key: { id: "3f9c1a2b", prefix: "octo_live_3f9c1a2b4d", source: "coding_agent" },
      quotas: {
        voyage: {
          concurrent: { limit: 2, used: 0 },
          monthly: {
            limit: 25,
            used: 3,
            periodStart: "2026-08-01",
            resetsAt: "2026-09-01T00:00:00Z",
          },
        },
      },
      rateLimit: { limit: 3000, remaining: 2998, resetAt: "2026-08-20T14:31:00Z" },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const me = await client.getMe();

    expect(calls[0]?.input).toBe(`${BASE_URL}/me`);
    expect(calls[0]?.init?.method).toBe("GET");
    expect(me.principal).toBe("api_key");
    expect(me.organization?.slug).toBe("acme-co");
    expect(me.key?.prefix).toBe("octo_live_3f9c1a2b4d");
    expect(me.key?.source).toBe("coding_agent");
    expect(me.quotas?.voyage?.monthly.limit).toBe(25);
    expect(me.rateLimit?.remaining).toBe(2998);
  });

  it("reads a super-admin bearer, which has no organization or key", async () => {
    const { fetchMock } = createFetchMock({
      principal: "super_admin",
      rateLimit: { limit: 6000, remaining: 5999, resetAt: "2026-08-20T14:31:00Z" },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const me = await client.getMe();

    expect(me.principal).toBe("super_admin");
    expect(me.organization ?? null).toBeNull();
    expect(me.key ?? null).toBeNull();
  });
});

describe("OctogenClient#resolveProductFromHtml", () => {
  it("posts the HTML and the source URL", async () => {
    const { calls, fetchMock } = createFetchMock({
      source: "on_demand",
      product: { uuid: null, productUrl: "https://shop.example/p/1" },
      requestedUrl: "https://shop.example/p/1?variant=blue",
      resolution: { completeness: "complete", method: "json_ld" },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const resolved = await client.resolveProductFromHtml({
      html: '<html><script type="application/ld+json">{}</script></html>',
      url: "https://shop.example/p/1?variant=blue",
    });

    expect(calls[0]?.input).toBe(`${BASE_URL}/products/resolve-from-html`);
    expect(requestBodyJson(calls[0])).toEqual({
      html: '<html><script type="application/ld+json">{}</script></html>',
      url: "https://shop.example/p/1?variant=blue",
    });
    expect(resolved.source).toBe("on_demand");
    expect(resolved.requestedUrl).toBe("https://shop.example/p/1?variant=blue");
  });

  it("omits url entirely when the caller has none", async () => {
    const { calls, fetchMock } = createFetchMock({
      source: "on_demand",
      product: { uuid: null, productUrl: "https://shop.example/p/1" },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await client.resolveProductFromHtml({ html: "<html></html>" });

    // `extra="forbid"` on the request model: a `url: null` would be a 422.
    expect(requestBodyJson(calls[0])).toEqual({ html: "<html></html>" });
  });

  it("rejects empty HTML before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.resolveProductFromHtml({ html: "" })).rejects.toThrow(
      "html is required",
    );
    expect(calls).toHaveLength(0);
  });
});

describe("OctogenClient voyages", () => {
  const TASK = {
    taskId: "task-1",
    domain: "shop.example",
    status: "running",
    phase: "sampling_products",
    phaseLabel: "Sampling products",
    progressPercent: 40,
  };

  it("reports 202 as a fresh dispatch that consumed quota", async () => {
    const { calls, fetchMock } = createFetchMock(
      { ...TASK, status: "queued", phase: "discovering_site", progressPercent: 5 },
      { status: 202 },
    );
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const started = await client.startVoyage("https://www.shop.example/collections/x");

    expect(calls[0]?.input).toBe(`${BASE_URL}/voyage`);
    expect(requestBodyJson(calls[0])).toEqual({
      domain: "https://www.shop.example/collections/x",
    });
    expect(started.created).toBe(true);
    expect(started.task.taskId).toBe("task-1");
  });

  it("reports 200 as joining an in-flight voyage, no quota consumed", async () => {
    const { fetchMock } = createFetchMock(TASK, { status: 200 });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const started = await client.startVoyage("shop.example");

    expect(started.created).toBe(false);
    expect(started.task.status).toBe("running");
  });

  it("rejects an empty domain before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.startVoyage("")).rejects.toThrow("domain is required");
    expect(calls).toHaveLength(0);
  });

  it("lists voyages with the status filter and pagination", async () => {
    const { calls, fetchMock } = createFetchMock({
      items: [TASK],
      nextCursor: "cursor-2",
      quotas: {
        concurrent: { limit: 2, used: 1 },
        monthly: { limit: 25, used: 3 },
      },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const page = await client.listVoyages({ status: "running", limit: 10 });

    expect(calls[0]?.input).toBe(`${BASE_URL}/voyage?limit=10&status=running`);
    expect(page.items[0]?.taskId).toBe("task-1");
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.quotas?.concurrent.used).toBe(1);
  });

  it("polls one voyage by task id", async () => {
    const { calls, fetchMock } = createFetchMock({
      ...TASK,
      status: "completed",
      phase: "complete",
      progressPercent: 100,
      result: { catalog: "shop_example", productCount: 1420 },
    });
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const task = await client.getVoyage("task-1");

    expect(calls[0]?.input).toBe(`${BASE_URL}/voyage/task-1`);
    expect(task.result?.catalog).toBe("shop_example");
  });

  it("refuses a blank task id before making a request", async () => {
    const { calls, fetchMock } = createFetchMock();
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    await expect(client.getVoyage("  ")).rejects.toThrow("task_id is required");
    expect(calls).toHaveLength(0);
  });
});

describe("OctogenClient#lookupProduct matchMode", () => {
  it("sends matchMode only when the caller asks for one", async () => {
    const body = {
      source: "indexed",
      product: { uuid: "p1", productUrl: "https://www.etro.com/us-en/x.html" },
    };
    const first = createFetchMock(body);
    const client = new OctogenClient({ apiKey: "key", fetch: first.fetchMock });

    await client.lookupProduct("https://www.etro.com/us-en/x.html");
    expect(requestBodyJson(first.calls[0])).toEqual({
      url: "https://www.etro.com/us-en/x.html",
      resolutionMode: "auto",
      onDemandCachePolicy: "prefer_cache",
    });

    const second = createFetchMock(body);
    const strict = new OctogenClient({ apiKey: "key", fetch: second.fetchMock });
    await strict.lookupProduct("https://www.etro.com/us-en/x.html", {
      matchMode: "strict",
    });
    expect(requestBodyJson(second.calls[0])).toEqual({
      url: "https://www.etro.com/us-en/x.html",
      resolutionMode: "auto",
      onDemandCachePolicy: "prefer_cache",
      matchMode: "strict",
    });
  });
});

describe("API key environment variables", () => {
  beforeEach(() => {
    // A fresh module per test: the deprecation warning fires once per process,
    // so "warns exactly once" is only observable on a module that has not
    // warned yet.
    vi.resetModules();
    vi.stubEnv(API_KEY_ENV_VAR, undefined);
    vi.stubEnv(DEPRECATED_API_KEY_ENV_VAR, undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("prefers OCTOGEN_PLATFORM_API_KEY and does not warn", async () => {
    vi.stubEnv(API_KEY_ENV_VAR, "primary");
    vi.stubEnv(DEPRECATED_API_KEY_ENV_VAR, "legacy");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { OctogenClient: FreshClient } = await import("../src/client.js");
    const { calls, fetchMock } = createFetchMock({ principal: "api_key" });

    await new FreshClient({ fetch: fetchMock }).getMe();

    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer primary",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to OCTO_API_KEY, warning exactly once", async () => {
    vi.stubEnv(DEPRECATED_API_KEY_ENV_VAR, "legacy");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { OctogenClient: FreshClient } = await import("../src/client.js");
    const { calls, fetchMock } = createFetchMock({ principal: "api_key" });

    await new FreshClient({ fetch: fetchMock }).getMe();
    await new FreshClient({ fetch: fetchMock }).getMe();

    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer legacy",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(DEPRECATED_API_KEY_ENV_VAR);
    expect(warn.mock.calls[0]?.[0]).toContain(API_KEY_ENV_VAR);
  });
});

describe("OPERATIONS", () => {
  it("covers each SDK method with a distinct verb and path", () => {
    const seen = new Set<string>();
    for (const [operationId, operation] of Object.entries(OPERATIONS)) {
      const key = `${operation.method} ${operation.path}`;
      expect(seen.has(key), `${key} is declared twice`).toBe(false);
      seen.add(key);
      expect(operationId).not.toContain(" ");
    }
  });
});
