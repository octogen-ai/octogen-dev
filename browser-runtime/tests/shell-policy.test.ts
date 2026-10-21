import { describe, expect, it } from "vitest";
import { loadJq } from "jq-wasm";
import { executeShell, tokenize } from "../src/shell.js";
import { executeWasm, loadEngine } from "../src/engine.js";
import { checkDemoRequest, withDemoPolicy } from "../src/policy.js";
import { fixtureTransport } from "../src/fixtures.js";
import { VirtualFiles } from "../src/virtual-files.js";
import { nodeHost } from "../../cli/src/node-host.js";
import type { ExecutionEvent, TransportRequest } from "../src/protocol.js";
const engine = loadEngine();
const jq = loadJq();
async function shell(line: string, files = new VirtualFiles(), terminal = false) {
  const events: ExecutionEvent[] = [];
  const signal = new AbortController().signal;
  let calls = 0;
  const result = await executeShell({
    line,
    terminal,
    files,
    signal,
    runId: "shell",
    emit: (event) => {
      events.push(event);
    },
    cli: async (argv, stdin, emit, isTty) =>
      executeWasm({
        module: await engine,
        argv,
        stdin,
        isTty,
        emit,
        files,
        signal,
        runId: "shell",
        version: nodeHost.version,
        transport: withDemoPolicy((request, requestSignal) => {
          calls++;
          return fixtureTransport(request, requestSignal);
        }),
      }),
    jq: async (input, filter, flags) => (await jq).raw(input, filter, flags),
  });
  return { ...result, events, calls };
}
describe("bounded shell using real QuickJS and real jq WASM", () => {
  it("quoted pipeline produces items and one raw result with one request", async () => {
    const result = await shell(
      "storerouter search 'linen dress' --limit 8 --json | jq '.items'",
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject([
      { title: "Linen dress (fixture)" },
    ]);
    expect(result.calls).toBe(1);
    expect(result.events.filter((event) => event.type === "result")).toHaveLength(1);
  });
  it("terminal hosts give only the final unredirected stage a TTY", async () => {
    const files = new VirtualFiles();
    const human = await shell(
      "storerouter search 'linen dress' --limit 8",
      files,
      true,
    );
    expect(human.code).toBe(0);
    expect(human.stdout).toContain('results for "linen dress"');
    expect(() => {
      JSON.parse(human.stdout);
    }).toThrow();
    const piped = await shell(
      "storerouter search 'linen dress' --limit 8 | jq '.count'",
      files,
      true,
    );
    expect(piped.stdout).toBe("1");
    await shell("storerouter search 'linen dress' --limit 8 > found.json", files, true);
    expect(JSON.parse(files.read("/session/found.json"))).toMatchObject({ count: 1 });
    const flagged = await shell(
      "storerouter search 'linen dress' --limit 8 --json",
      files,
      true,
    );
    expect(JSON.parse(flagged.stdout)).toMatchObject({ count: 1 });
    const headless = await shell("storerouter search 'linen dress' --limit 8", files);
    expect(JSON.parse(headless.stdout)).toMatchObject({ count: 1 });
  });
  it("hosts can replace or silence the keyless notice", async () => {
    const run = async (keylessNotice?: string) =>
      executeWasm({
        module: await engine,
        argv: ["search", "linen dress", "--limit", "8"],
        files: new VirtualFiles(),
        signal: new AbortController().signal,
        runId: "notice",
        version: nodeHost.version,
        emit: () => undefined,
        transport: withDemoPolicy(fixtureTransport),
        ...(keylessNotice === undefined ? {} : { keylessNotice }),
      });
    expect((await run()).stderr).toContain("No API key found");
    expect((await run("Demo key held by the server.")).stderr).toBe(
      "Demo key held by the server.\n",
    );
    const silent = await run("");
    expect(silent.code).toBe(0);
    expect(silent.stderr).toBe("");
  });
  it("hosts can refuse commands before any request and hide them from help", async () => {
    let calls = 0;
    const run = async (argv: string[]) =>
      executeWasm({
        module: await engine,
        argv,
        files: new VirtualFiles(),
        signal: new AbortController().signal,
        runId: "unavailable",
        version: nodeHost.version,
        emit: () => undefined,
        unavailableCommands: ["api", "status"],
        transport: withDemoPolicy((request, signal) => {
          calls++;
          return fixtureTransport(request, signal);
        }),
      });
    const api = await run([
      "api",
      "POST",
      "/products/search",
      "--data",
      '{"q":"dress"}',
    ]);
    expect(api.code).toBe(2);
    // Without a TTY the failure is the JSON envelope on stdout.
    const envelope = JSON.parse(api.stdout) as { ok: boolean; message: string };
    expect(envelope.ok).toBe(false);
    expect(envelope.message).toContain("storerouter api is not available here");
    const status = await run(["--json", "status"]);
    expect(status.code).toBe(2);
    expect(JSON.parse(status.stdout)).toMatchObject({ code: "unavailable_command" });
    const help = await run([]);
    expect(help.stderr).toContain("search");
    expect(help.stderr).not.toMatch(/^\s+(api|status)\s/m);
    expect(calls).toBe(0);
    expect((await run(["search", "linen dress", "--limit", "8"])).code).toBe(0);
  });
  it("literal requested .data.items respects the existing flattened envelope", async () => {
    const result = await shell(
      "storerouter search 'linen dress' --limit 8 --json | jq '.data.items'",
    );
    expect(result.stdout).toBe("null");
    expect(result.calls).toBe(1);
  });
  it("virtual redirection, append, absolute input, and genuine jq language", async () => {
    const files = new VirtualFiles();
    await shell(`echo '{"a":2}' > data.json`, files);
    await shell(`echo '{"a":3}' >> data.json`, files);
    const result = await shell(
      `jq -s 'map(.a) | add' < /session/data.json > /session/sum.json`,
      files,
    );
    expect(result.stdout).toBe("");
    expect(files.read("/session/sum.json")).toBe("5");
    expect((await shell("cat sum.json", files)).stdout).toBe("5");
    files.reset();
    expect(files.snapshot()).toEqual({});
  });
  it("jq errors preserve exit status and stderr", async () => {
    const result = await shell(`echo '{}' | jq '.[invalid'`);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain("syntax error");
  });
  it("lexes escaped spaces, empty words and literal operators", () => {
    expect(tokenize(`echo "a b" '' 'x|y' a\\ b`).map((x) => x.value)).toEqual([
      "echo",
      "a b",
      "",
      "x|y",
      "a b",
    ]);
    for (const line of [
      "echo $(id)",
      "echo a; echo b",
      "echo 'x",
      "echo `id`",
      "echo a && echo b",
    ])
      expect(() => tokenize(line)).toThrow();
  });
  it("explains how to keep $ and backticks literal", () => {
    for (const line of [`echo "under $300"`, "echo under $300"])
      expect(() => tokenize(line)).toThrow(
        "Shell expansion ($) is unsupported. For a literal $, use single quotes ('under $300') or escape it (\\$).",
      );
    for (const line of ['echo "`id`"', "echo `id`"])
      expect(() => tokenize(line)).toThrow("Command substitution (`) is unsupported.");
    expect(
      tokenize(`echo "men's belts under \\$300" 'under $300'`).map((x) => x.value),
    ).toEqual(["echo", "men's belts under $300", "under $300"]);
  });
  it("rejects malformed pipelines and unknown executables", async () => {
    for (const line of [
      "storerouter search x | bash",
      "echo x |",
      "echo x >",
      "cat < a < b",
      "echo x > a | cat",
    ])
      await expect(shell(line)).rejects.toThrow();
  });
  it("raw api, base-url, mutations and refresh cannot bypass policy", async () => {
    for (const line of [
      "storerouter api DELETE /coverage/url-lists/a --no-retry",
      "storerouter api GET /admin --no-retry",
      "storerouter search dress --base-url https://evil.example/v1 --no-retry",
      "storerouter lookup https://example.com/p --no-retry",
    ]) {
      const result = await shell(line);
      expect(result.calls).toBe(0);
      expect(result.code).not.toBe(0);
    }
  });
  it("stores show runs one normalized single-host GET through the policy", async () => {
    const result = await shell(
      "storerouter stores show https://WWW.Example.com/products/linen-dress --json | jq -c '{host, covered, catalog: .catalogs[0].catalog}'",
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      host: "example.com",
      covered: true,
      catalog: "example",
    });
    expect(result.calls).toBe(1);
  });
  it("raw api cannot list stores or smuggle a host through store's route", async () => {
    for (const line of [
      "storerouter api GET /stores --no-retry",
      "storerouter api GET /stores/ --no-retry",
      "storerouter api GET /stores/example.com/extra --no-retry",
      "storerouter api GET /stores/WWW.example.com --no-retry",
      "storerouter api DELETE /stores/example.com --no-retry",
    ]) {
      const result = await shell(line);
      expect(result.calls, line).toBe(0);
      expect(result.code, line).not.toBe(0);
    }
  });
  it("allows getStore for exactly one normalized host, GET only, no query or body", () => {
    expect(
      checkDemoRequest({
        url: "https://api.storerouter.ai/v1/stores/thereformation.com",
        method: "GET",
        headers: {},
      }),
    ).toBe("getStore");
    for (const request of [
      { url: "https://api.storerouter.ai/v1/stores", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/a.com/b.com", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/a.com,b.com", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/*", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/%2A", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/%2e%2e", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/example.com%2Fx", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/Example.com", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/www.example.com", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/example.com:443", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/localhost", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/example.com?all=1", method: "GET" },
      { url: "https://api.storerouter.ai/v1/stores/example.com", method: "POST" },
      { url: "https://evil.example/v1/stores/example.com", method: "GET" },
      {
        url: "https://api.storerouter.ai/v1/stores/example.com",
        method: "GET",
        body: "{}",
      },
    ])
      expect(
        () => checkDemoRequest({ ...request, headers: {} }),
        `${request.method} ${request.url}`,
      ).toThrow();
  });
  it("brands subcommands run through the policy with one request each", async () => {
    for (const [line, expected] of [
      [
        "storerouter brands search 'linen basics' --json | jq -r '.brands[0].name'",
        "Example",
      ],
      [
        "storerouter brands similar Example --json | jq -r '.brands[0].name'",
        "Example",
      ],
      ["storerouter brands prefix Ex --json | jq -r '.brands[0]'", "Example"],
      [
        "storerouter brands show 'Example Studio' --json | jq -r '.brand.brandName'",
        "Example",
      ],
      [
        "storerouter brands products example --limit 12 --json | jq -r '.items[0].title'",
        "Linen dress (fixture)",
      ],
      [
        "storerouter brands categories example --json | jq -r '.categories[0].name'",
        "Dresses",
      ],
    ] as const) {
      const result = await shell(line);
      expect(result.code, line).toBe(0);
      expect(result.stdout.trim(), line).toBe(expected);
      expect(result.calls, line).toBe(1);
    }
  });
  it("allows brand reads with only their declared, in-range query", () => {
    const base = "https://api.storerouter.ai/v1/brands";
    for (const [url, operation] of [
      [`${base}/prefix?prefix=Re&limit=20`, "searchBrandPrefix"],
      [`${base}/Free%20People`, "getBrandDetails"],
      [`${base}/reformation/products?limit=24&offset=48`, "browseBrandProducts"],
      [
        `${base}/reformation/top-categories?minLevel=2&limit=3`,
        "getBrandTopCategories",
      ],
    ] as const)
      expect(checkDemoRequest({ url, method: "GET", headers: {} }), url).toBe(
        operation,
      );
    expect(
      checkDemoRequest({
        url: `${base}/similar`,
        method: "POST",
        headers: {},
        body: JSON.stringify({ brands: ["Reformation"], limit: 24 }),
      }),
    ).toBe("searchSimilarBrands");
    for (const request of [
      { url: `${base}/prefix`, method: "GET" },
      { url: `${base}/prefix?prefix=Re&prefix=Ab`, method: "GET" },
      { url: `${base}/prefix?prefix=Re&all=1`, method: "GET" },
      { url: `${base}/prefix?prefix=Re&limit=51`, method: "GET" },
      { url: `${base}/prefix?prefix=Re&limit=1e1`, method: "GET" },
      { url: `${base}/prefix?prefix=Re&`, method: "GET" },
      { url: `${base}/reformation/products?offset=10001`, method: "GET" },
      { url: `${base}/reformation/products?limit=-1`, method: "GET" },
      { url: `${base}/reformation?limit=1`, method: "GET" },
      { url: `${base}/a%2Fproducts`, method: "GET" },
      { url: `${base}/..`, method: "GET" },
      { url: `${base}/%2e%2e`, method: "GET" },
      { url: `${base}/%E0%A4%A`, method: "GET" },
      { url: `${base}/reformation/extra`, method: "GET" },
      { url: `${base}/reformation`, method: "DELETE" },
      { url: `${base}/reformation`, method: "GET", body: "{}" },
      { url: base, method: "GET" },
      { url: `${base}/search?limit=1`, method: "POST", body: '{"text":"x"}' },
      { url: `${base}/search`, method: "POST", body: '{"text":"x","debug":true}' },
      { url: `${base}/similar`, method: "POST", body: '{"brands":[]}' },
    ])
      expect(
        () => checkDemoRequest({ ...request, headers: {} }),
        `${request.method} ${request.url}`,
      ).toThrow();
  });
  it("drops browser credentials at host seam", async () => {
    let seen: TransportRequest | undefined;
    const transport = withDemoPolicy((request, signal) => {
      seen = request;
      return fixtureTransport(request, signal);
    });
    await transport(
      {
        url: "https://api.storerouter.ai/v1/products/search",
        method: "POST",
        body: JSON.stringify({ q: "dress" }),
        headers: {
          Authorization: "Bearer fixture-secret",
          "User-Agent": "test",
          Accept: "application/json",
        },
      },
      new AbortController().signal,
    );
    expect(seen?.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(seen)).not.toContain("fixture-secret");
  });
  it("denies query smuggling, unsafe bodies and other verbs", () => {
    for (const request of [
      {
        url: "https://api.storerouter.ai/v1/products/search?destination=evil",
        method: "GET",
      },
      { url: "https://evil.example/v1/products/search", method: "GET" },
      { url: "https://api.storerouter.ai/v1/products/search", method: "POST" },
      {
        url: "https://api.storerouter.ai/v1/products/search",
        method: "POST",
        body: '{"q":"dress","arbitrary":true}',
      },
      {
        url: "https://api.storerouter.ai/v1/products/lookup",
        method: "POST",
        body: '{"url":"https://example.com/p","resolutionMode":"auto"}',
      },
    ])
      expect(() => checkDemoRequest({ ...request, headers: {} })).toThrow();
  });
});
