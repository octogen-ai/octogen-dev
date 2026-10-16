/** Exercise the installed CLI and its actual SDK, without source aliases or API traffic. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { run as SourceRun } from "../src/run.js";
import type {
  validate as SourceValidate,
  requestSchema as SourceRequestSchema,
} from "../src/contract.js";

const prefix = process.argv[2];
if (prefix === undefined) throw new Error("Pass the scratch installation directory");
const moduleUrl = (file: string): string =>
  pathToFileURL(resolve(prefix, "node_modules/@storerouter/cli/dist", file)).href;
const { run } = (await import(moduleUrl("run.js"))) as { run: typeof SourceRun };
const { validate, requestSchema } = (await import(moduleUrl("contract.js"))) as {
  validate: typeof SourceValidate;
  requestSchema: typeof SourceRequestSchema;
};
const sourceManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string; dependencies: { "@octogen-ai/sdk": string } };
const { CLI_VERSION, CLI_SDK_VERSION } = (await import(moduleUrl("version.js"))) as {
  CLI_VERSION: string;
  CLI_SDK_VERSION: string;
};
assert.equal(CLI_VERSION, sourceManifest.version);
assert.equal(CLI_SDK_VERSION, sourceManifest.dependencies["@octogen-ai/sdk"]);
const key =
  "octo_live_3f9c1a2b4d5e6f708192a3b4c5d6e7f8_sZ9wQ1x-Yv3TbN7mK2pRdL4gH6jF8cA0eU5iO1yW3qE";
const cases = [
  {
    operation: "searchProducts",
    argv: [
      "search",
      "dress",
      "--price-min",
      "2",
      "--price-max",
      "20",
      "--catalog",
      "shop",
      "--facet",
      "color=red",
      "--cursor",
      "next",
    ],
    path: "/products/search",
    body: {
      q: "dress",
      limit: 50,
      price_min: 2,
      price_max: 20,
      catalogs: ["shop"],
      facets: [{ name: "color", values: ["red"] }],
      cursor: "next",
    },
    response: { items: [], nextCursor: null },
    exit: 6,
  },
  ...["lookup", "parse"].map((name) => ({
    operation: "lookupProduct",
    argv: [
      name,
      "https://example.com/p",
      "--match-mode",
      "strict",
      "--resolution-mode",
      "index_only",
    ],
    path: "/products/lookup",
    body: {
      url: "https://example.com/p",
      matchMode: "strict",
      resolutionMode: "index_only",
      onDemandCachePolicy: "prefer_cache",
    },
    response: { product: {}, source: "indexed" },
    exit: 0,
  })),
  {
    operation: "moreLikeThisProducts",
    argv: [
      "similar",
      "https://example.com/p",
      "--catalog",
      "one",
      "--catalog",
      "two",
      "--price-preference",
      "higher",
      "--facet",
      "color=red",
      "--exclude-facet",
      "size=small",
    ],
    path: "/products/more-like-this",
    body: {
      source: { url: "https://example.com/p" },
      catalogs: ["one", "two"],
      limit: 12,
      price_preference: "higher",
      debug: false,
      include_facets: [{ name: "color", values: ["red"] }],
      exclude_facets: [{ name: "size", values: ["small"] }],
    },
    response: { items: [], source: {} },
    exit: 6,
  },
  {
    operation: "resolveProductFromHtml",
    argv: ["resolve", "--html", "-", "--url", "https://example.com/p"],
    path: "/products/resolve-from-html",
    body: { html: "<html>product</html>", url: "https://example.com/p" },
    response: { product: {}, source: "html" },
    exit: 0,
  },
];
for (const item of cases) {
  const requests: unknown[] = [];
  let stdout = "";
  const exit = await run({
    argv: [...item.argv, "--no-retry"],
    cwd: prefix,
    env: { STOREROUTER_API_KEY: key },
    isTty: false,
    readStdin: () => "<html>product</html>",
    stdout: (value) => {
      stdout += value;
    },
    stderr: () => {
      /* Diagnostics are not part of this stdout assertion. */
    },
    fetch: (input, init) => {
      assert.equal(
        new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        ).pathname,
        `/v1${item.path}`,
      );
      assert.equal(init?.method, "POST");
      assert.equal(typeof init.body, "string");
      const body: unknown = JSON.parse(init.body as string);
      requests.push(body);
      validate(requestSchema(item.operation), body, item.operation);
      return Promise.resolve(
        new Response(JSON.stringify(item.response), {
          headers: { "content-type": "application/json" },
        }),
      );
    },
  });
  assert.equal(exit, item.exit, stdout);
  assert.deepEqual(requests, [item.body]);
  const envelope = JSON.parse(stdout) as { exitCode: number };
  assert.equal(envelope.exitCode, exit);
}
process.stdout.write(
  `Packed contract conformance passed: ${String(cases.length)} commands, CLI ${CLI_VERSION}, SDK ${CLI_SDK_VERSION}.\n`,
);
