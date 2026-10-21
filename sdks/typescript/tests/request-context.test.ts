import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  InvalidRequestContext,
  OctogenClient,
  OctogenNotFoundError,
  REQUEST_CONTEXT_HEADER,
  USER_AGENT,
  type FetchLike,
  type RequestContext,
  type RequestContextDefaults,
  type RequestOptions,
  type RequestVisitor,
  type components,
} from "../src/index.js";

interface Fixture {
  name: string;
  context: RequestContext;
  valid: boolean;
  bytes?: number;
}
const fixtures = JSON.parse(
  readFileSync(
    new URL("../../../tests/fixtures/request-context-v1.json", import.meta.url),
    "utf8",
  ),
) as { cases: Fixture[] };

function harness() {
  const calls: { input: string; init?: RequestInit | undefined }[] = [];
  const fetch: FetchLike = (input, init) => {
    calls.push({ input, init });
    return Promise.resolve(Response.json({ items: [], nextCursor: null }));
  };
  return { calls, fetch };
}

describe("RequestContext shared API fixtures", () => {
  it.each(fixtures.cases)("$name", async (fixture) => {
    const { calls, fetch } = harness();
    const client = new OctogenClient({ apiKey: "synthetic", fetch });
    if (fixture.valid) {
      await client.searchProducts({ q: "shirt" }, { context: fixture.context });
      const headers = new Headers(calls[0]?.init?.headers);
      const header = headers.get(REQUEST_CONTEXT_HEADER) ?? "";
      expect(Array.from(header).every((c) => c.charCodeAt(0) <= 127)).toBe(true);
      expect(new TextEncoder().encode(header)).toHaveLength(fixture.bytes ?? -1);
      expect(JSON.parse(header)).toEqual(fixture.context);
      expect(headers.get("User-Agent")).toBe(USER_AGENT);
      expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
        q: "shirt",
        limit: 50,
      });
    } else {
      await expect(
        client.searchProducts({ q: "shirt" }, { context: fixture.context }),
      ).rejects.toThrow("Invalid RequestContext");
      expect(calls).toHaveLength(0);
    }
  });
});

it("inherits, overrides and clears defaults; distinguishes missing from empty", async () => {
  const { calls, fetch } = harness();
  const defaults: RequestContextDefaults = {
    application: "storefront",
    feature: "grid",
  };
  const client = new OctogenClient({
    apiKey: "synthetic",
    fetch,
    defaultContext: defaults,
  });
  defaults.application = "changed";
  await client.searchProducts({});
  await client.searchProducts({}, { context: { feature: "detail" } });
  await client.searchProducts({}, { context: { feature: null } });
  await client.searchProducts({}, { context: null });
  await client.searchProducts({}, { context: {} });
  await client.searchProducts(
    {},
    { context: { feature: undefined } as unknown as RequestContext },
  );
  const bare = new OctogenClient({ apiKey: "synthetic", fetch });
  await bare.searchProducts({});
  await bare.searchProducts({}, { context: {} });
  expect(
    calls.map(({ init }) => {
      const h = new Headers(init?.headers).get(REQUEST_CONTEXT_HEADER);
      return h === null ? null : (JSON.parse(h) as unknown);
    }),
  ).toEqual([
    { application: "storefront", feature: "grid" },
    { application: "storefront", feature: "detail" },
    { application: "storefront", feature: null },
    null,
    { application: "storefront", feature: "grid" },
    { application: "storefront", feature: "grid" },
    null,
    {},
  ]);
});

it.each(["user_id", "session_id", "page_view_id", "user_agent", "visitor"])(
  "refuses %s in reusable defaults",
  (field) => {
    const { fetch } = harness();
    expect(
      () =>
        new OctogenClient({
          apiKey: "synthetic",
          fetch,
          defaultContext: {
            [field]: "synthetic-private-value",
          },
        }),
    ).toThrow(InvalidRequestContext);
  },
);

type Call = (client: OctogenClient, options: RequestOptions) => Promise<unknown>;
const operations: [string, Call][] = [
  ["lookup", (c, o) => c.lookupProduct("https://example.test/p", o)],
  ["parse alias", (c, o) => c.parseProductAlias("https://example.test/p", o)],
  ["html", (c, o) => c.resolveProductFromHtml({ html: "<html/>" }, o)],
  ["me", (c, o) => c.getMe(o)],
  ["domain", (c, o) => c.getStore("example.test", o)],
  ["search", (c, o) => c.searchProducts({ q: "shirt" }, o)],
  ["counts", (c, o) => c.countProductFacets({}, o)],
  ["categories", (c, o) => c.listTaxonomyCategories({}, o)],
  ["attributes", (c, o) => c.listTaxonomyAttributes("apparel", {}, o)],
  ["values", (c, o) => c.listTaxonomyAttributeValues("color", {}, o)],
  ["similar", (c, o) => c.moreLikeThisProducts({ source: { uuid: "synthetic" } }, o)],
  ["create list", (c, o) => c.createCoverageUrlList("synthetic", o)],
  ["lists", (c, o) => c.listCoverageUrlLists({}, o)],
  ["get list", (c, o) => c.getCoverageUrlList("synthetic", o)],
  ["delete list", (c, o) => c.deleteCoverageUrlList("synthetic", o)],
  [
    "add urls",
    (c, o) => c.addCoverageUrlListUrls("synthetic", ["https://example.test/p"], o),
  ],
  [
    "remove urls",
    (c, o) => c.removeCoverageUrlListUrls("synthetic", ["https://example.test/p"], o),
  ],
  [
    "contains urls",
    (c, o) => c.checkCoverageUrlListUrls("synthetic", ["https://example.test/p"], o),
  ],
  ["list urls", (c, o) => c.listCoverageUrlListUrls("synthetic", {}, o)],
  [
    "raw",
    (c, o) => c.fetchRaw("POST", "/products/search", { ...o, body: { q: "shirt" } }),
  ],
];

it.each(operations)("%s only adds context to headers", async (_name, call) => {
  const calls: { input: string; init?: RequestInit | undefined }[] = [];
  const fetch: FetchLike = (input, init) => {
    calls.push({ input, init });
    return Promise.resolve(
      Response.json({ detail: "synthetic miss" }, { status: 404 }),
    );
  };
  const client = new OctogenClient({ apiKey: "synthetic", fetch });
  await expect(call(client, {})).rejects.toBeInstanceOf(OctogenNotFoundError);
  await expect(
    call(client, { context: { user_id: "synthetic-user" } }),
  ).rejects.toBeInstanceOf(OctogenNotFoundError);
  const [plain, contextual] = calls;
  expect(contextual?.input).toBe(plain?.input);
  expect(contextual?.init?.body).toBe(plain?.init?.body);
  expect(contextual?.init?.method).toBe(plain?.init?.method);
  const headers = new Headers(contextual?.init?.headers);
  expect(headers.get(REQUEST_CONTEXT_HEADER)).toBe('{"user_id":"synthetic-user"}');
  headers.delete(REQUEST_CONTEXT_HEADER);
  expect([...headers]).toEqual([...new Headers(plain?.init?.headers)]);
});

it("snapshots concurrent visitors and retains context through injected fetch retries", async () => {
  let resume: () => void = () => {
    throw new Error("not initialized");
  };
  let arrived: () => void = () => {
    throw new Error("not initialized");
  };
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const both = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const attempts: (string | null)[] = [];
  let count = 0;
  async function attempt(
    init: RequestInit | undefined,
    number: number,
  ): Promise<Response> {
    attempts.push(new Headers(init?.headers).get(REQUEST_CONTEXT_HEADER));
    expect(new Headers(init?.headers).get("User-Agent")).toBe(USER_AGENT);
    if (number === 0) {
      if (++count === 2) arrived();
      await gate;
      throw new TypeError("synthetic connection reset");
    }
    return Response.json({ items: [] });
  }
  const fetch: FetchLike = async (_input, init) => {
    try {
      return await attempt(init, 0);
    } catch {
      return attempt(init, 1);
    }
  };
  const client = new OctogenClient({ apiKey: "synthetic", fetch });
  const context: RequestContext = {
    user_id: "one",
    user_agent: "Agent/one",
    visitor: { provider: "first" },
  };
  const one = client.searchProducts({}, { context });
  const two = client.searchProducts(
    {},
    { context: { user_id: "two", user_agent: "Agent/two" } },
  );
  await both;
  context.user_id = "changed";
  context.user_agent = "changed";
  if (context.visitor) context.visitor.provider = "changed";
  resume();
  await Promise.all([one, two]);
  await client.searchProducts({});
  expect(attempts).toEqual([
    '{"user_id":"one","user_agent":"Agent/one","visitor":{"provider":"first"}}',
    '{"user_id":"two","user_agent":"Agent/two"}',
    '{"user_id":"one","user_agent":"Agent/one","visitor":{"provider":"first"}}',
    '{"user_id":"two","user_agent":"Agent/two"}',
    null,
    null,
  ]);
});

it("keeps keyless auth and resolves raw typed/header collisions without mutation", async () => {
  const { fetch, calls } = harness();
  const client = new OctogenClient({ apiKey: "", allowKeyless: true, fetch });
  const headers = {
    "x-octogen-request-context": '{"user_id":"raw"}',
    "X-Custom": "stable",
  };
  await client.fetchRaw("POST", "products/search", {
    headers,
    context: { user_id: "typed" },
  });
  await client.fetchRaw("POST", "products/search", { headers, context: null });
  expect(headers["x-octogen-request-context"]).toBe('{"user_id":"raw"}');
  expect(new Headers(calls[0]?.init?.headers).get(REQUEST_CONTEXT_HEADER)).toBe(
    '{"user_id":"typed"}',
  );
  expect(new Headers(calls[1]?.init?.headers).has(REQUEST_CONTEXT_HEADER)).toBe(false);
  for (const call of calls)
    expect(new Headers(call.init?.headers).has("Authorization")).toBe(false);
});

it("checks the combined default/context byte budget after field clearing", async () => {
  const { fetch, calls } = harness();
  const client = new OctogenClient({
    apiKey: "synthetic",
    fetch,
    defaultContext: { application: "😀".repeat(256) },
  });
  await expect(
    client.searchProducts({}, { context: { user_agent: "x".repeat(1024) } }),
  ).rejects.toThrow(InvalidRequestContext);
  expect(calls).toHaveLength(0);
  await client.searchProducts(
    {},
    { context: { application: null, user_agent: "x".repeat(1024) } },
  );
  expect(
    JSON.parse(
      new Headers(calls[0]?.init?.headers).get(REQUEST_CONTEXT_HEADER) ?? "{}",
    ),
  ).toEqual({ application: null, user_agent: "x".repeat(1024) });
});

it("keeps public context fields and vocabularies equal to the deployed contract", () => {
  type Generated = components["schemas"]["RequestContext"];
  type Visitor = components["schemas"]["RequestVisitor"];
  // Codegen makes defaulted fields required; the public API keeps them optional.
  expectTypeOf<keyof RequestContext>().toEqualTypeOf<keyof Generated>();
  expectTypeOf<keyof RequestVisitor>().toEqualTypeOf<keyof Visitor>();
  expectTypeOf<RequestContext["trigger"]>().toEqualTypeOf<
    Generated["trigger"] | undefined
  >();
  expectTypeOf<RequestVisitor["classification"]>().toEqualTypeOf<
    Visitor["classification"] | undefined
  >();
});
