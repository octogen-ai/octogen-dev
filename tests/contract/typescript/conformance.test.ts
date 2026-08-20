/**
 * Contract conformance for `@octogen-ai/sdk`.
 *
 * Three assertions, one for each direction drift can travel:
 *
 *   1. Every published `operationId` has an SDK method.
 *   2. Every SDK method calls the method and path the contract defines for it.
 *   3. Every request-issuing method on the client is registered below, so a new
 *      one cannot be added without a contract check.
 *
 * (2) is the one that earns its keep: it does not read the source, it *calls*
 * the method against a stub transport and observes the URL. Both SDKs shipped a
 * `recrawlProducts` that posted to `/products/recrawl` — a route that has never
 * existed — and this assertion fails on it in milliseconds.
 *
 * The SDK is imported through its package entry point rather than from `src/`,
 * so this also exercises the `exports` map that `npm install @octogen-ai/sdk`
 * resolves. Run `npm run build` first; `npm run test:contract` does.
 */
import { readFileSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { OctogenClient, type FetchLike } from "@octogen-ai/sdk";
import { describe, expect, it } from "vitest";

const here = nodePath.dirname(fileURLToPath(import.meta.url));
const contract = readJson("../openapi/platform-v1.json") as OpenApiDocument;
const allowlist = readJson("../allowlist.json") as Allowlist;

/**
 * Stand-in for any path parameter. Chosen so the SDK's `encodeURIComponent`
 * leaves it untouched, which lets an observed path be turned back into the
 * contract's templated form.
 */
const PARAM = "__PARAM__";

interface OpenApiDocument {
  info: { version: string };
  paths: Record<string, Record<string, { operationId?: string }>>;
}

interface Allowlist {
  unpublishedPaths: { path: string; methods: string[] }[];
}

interface Invocation {
  /** The `OctogenClient` method this operation is reached through. */
  clientMethod: string;
  call: (client: OctogenClient) => Promise<unknown>;
}

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(nodePath.join(here, relative), "utf8"));
}

/** operationId -> `"METHOD /templated/path"`, from the published contract. */
const PUBLISHED = new Map<string, string>();
for (const [route, item] of Object.entries(contract.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (operation.operationId !== undefined) {
      PUBLISHED.set(operation.operationId, `${method.toUpperCase()} ${route}`);
    }
  }
}

const ALLOWED_REQUESTS = new Set(
  allowlist.unpublishedPaths.flatMap((entry) =>
    entry.methods.map((method) => `${method} ${entry.path}`),
  ),
);

/**
 * How to reach each published operation. The SDK's method names are
 * deliberately not the operation ids — `moreLikeThisProducts` reads better than
 * a generated `moreLikeThisProductsProductsMoreLikeThisPost` — so the mapping is
 * written out rather than derived.
 */
const INVOCATIONS: Record<string, Invocation> = {
  listDomains: {
    clientMethod: "listDomains",
    call: (client) => client.listDomains(),
  },
  lookupProduct: {
    clientMethod: "lookupProduct",
    call: (client) => client.lookupProduct("https://shop.example/p"),
  },
  searchProducts: {
    clientMethod: "searchProducts",
    call: (client) => client.searchProducts({ q: "dress" }),
  },
  moreLikeThisProducts: {
    clientMethod: "moreLikeThisProducts",
    call: (client) =>
      client.moreLikeThisProducts({ source: { url: "https://shop.example/p" } }),
  },
  refreshProducts: {
    clientMethod: "refreshProducts",
    call: (client) =>
      client.refreshProducts({ targets: [{ url: "https://shop.example/p" }] }),
  },
  resolveProductFromHtml: {
    clientMethod: "resolveProductFromHtml",
    call: (client) => client.resolveProductFromHtml({ html: "<html></html>" }),
  },
  startVoyage: {
    clientMethod: "startVoyage",
    call: (client) => client.startVoyage("shop.example"),
  },
  listVoyages: {
    clientMethod: "listVoyages",
    call: (client) => client.listVoyages(),
  },
  getVoyage: {
    clientMethod: "getVoyage",
    call: (client) => client.getVoyage(PARAM),
  },
  createUrlList: {
    clientMethod: "createCoverageUrlList",
    call: (client) => client.createCoverageUrlList("contract-test"),
  },
  listUrlLists: {
    clientMethod: "listCoverageUrlLists",
    call: (client) => client.listCoverageUrlLists(),
  },
  getUrlList: {
    clientMethod: "getCoverageUrlList",
    call: (client) => client.getCoverageUrlList(PARAM),
  },
  deleteUrlList: {
    clientMethod: "deleteCoverageUrlList",
    call: (client) => client.deleteCoverageUrlList(PARAM),
  },
  addUrlListUrls: {
    clientMethod: "addCoverageUrlListUrls",
    call: (client) => client.addCoverageUrlListUrls(PARAM, ["https://shop.example/p"]),
  },
  removeUrlListUrls: {
    clientMethod: "removeCoverageUrlListUrls",
    call: (client) =>
      client.removeCoverageUrlListUrls(PARAM, ["https://shop.example/p"]),
  },
  checkUrlListUrls: {
    clientMethod: "checkCoverageUrlListUrls",
    call: (client) =>
      client.checkCoverageUrlListUrls(PARAM, ["https://shop.example/p"]),
  },
  listUrlListUrls: {
    clientMethod: "listCoverageUrlListUrls",
    call: (client) => client.listCoverageUrlListUrls(PARAM),
  },
};

/**
 * Prototype members that issue no request: the constructor, and the private
 * helpers whose `private` keyword is erased at runtime.
 */
const NOT_A_REQUEST = new Set(["constructor", "headers", "request", "send", "url"]);

interface ObservedRequest {
  method: string;
  path: string;
}

function createClient(): { observed: ObservedRequest[]; client: OctogenClient } {
  const observed: ObservedRequest[] = [];
  const fetchMock: FetchLike = (input, init) => {
    observed.push({
      method: init?.method ?? "GET",
      path: new URL(input).pathname.replace(/^\/v1/, ""),
    });
    return Promise.resolve(
      new Response("{}", {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
  };
  return { observed, client: new OctogenClient({ apiKey: "key", fetch: fetchMock }) };
}

/** Turn `/voyage/__PARAM__` back into the contract's `/voyage/{task_id}`. */
function templatize(observedPath: string, contractPath: string): string {
  if (!observedPath.includes(PARAM)) {
    return observedPath;
  }
  const names = [...contractPath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  let index = 0;
  return observedPath.split(PARAM).reduce((left, right, position) => {
    if (position === 0) return right;
    const name = names[index++];
    return `${left}${name === undefined ? PARAM : `{${name}}`}${right}`;
  }, "");
}

async function observeOne(operationId: string): Promise<string> {
  const invocation = INVOCATIONS[operationId];
  if (invocation === undefined) {
    throw new Error(`${operationId} has no registered invocation`);
  }
  const { observed, client } = createClient();
  await invocation.call(client);
  expect(
    observed,
    `${operationId} issued ${String(observed.length)} requests; expected exactly 1`,
  ).toHaveLength(1);

  const call = observed[0];
  if (call === undefined) {
    throw new Error("unreachable");
  }
  const contractPath = (PUBLISHED.get(operationId) ?? " ").split(" ")[1] ?? "";
  return `${call.method} ${templatize(call.path, contractPath)}`;
}

describe("contract snapshot", () => {
  it("is the contract this SDK was written against", () => {
    expect(contract.info.version).toBe("1.0.0");
    expect(PUBLISHED.size).toBe(17);
  });
});

describe("every published operation has an SDK method", () => {
  it.each([...PUBLISHED.keys()])("%s", (operationId) => {
    expect(
      INVOCATIONS[operationId],
      `${operationId} is published at "${String(PUBLISHED.get(operationId))}" but ` +
        `no @octogen-ai/sdk method calls it. A published operation with no SDK ` +
        `method is a caller reaching for raw fetch.`,
    ).toBeDefined();
  });
});

describe("every SDK method calls the path the contract defines", () => {
  it.each([...PUBLISHED.entries()])("%s -> %s", async (operationId, expected) => {
    expect(await observeOne(operationId)).toBe(expected);
  });
});

describe("no SDK method calls a path the contract does not define", () => {
  it("every request-issuing client method is contract-checked", () => {
    const registered = new Set(
      Object.values(INVOCATIONS).map((invocation) => invocation.clientMethod),
    );
    const unchecked = Object.getOwnPropertyNames(OctogenClient.prototype).filter(
      (name) => !NOT_A_REQUEST.has(name) && !registered.has(name),
    );

    expect(
      unchecked,
      `these @octogen-ai/sdk methods are not covered by a contract check: ` +
        `${unchecked.join(", ")}. Add each to INVOCATIONS, or to NOT_A_REQUEST if ` +
        `it issues no request.`,
    ).toEqual([]);
  });

  it.each([...PUBLISHED.keys()])("%s", async (operationId) => {
    const request = await observeOne(operationId);
    const published = [...PUBLISHED.values()].includes(request);
    expect(
      published || ALLOWED_REQUESTS.has(request),
      `${operationId} called "${request}", which the published contract does not ` +
        `define and tests/contract/allowlist.json does not allow.`,
    ).toBe(true);
  });
});
