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
async function shell(line: string, files = new VirtualFiles()) {
  const events: ExecutionEvent[] = [];
  const signal = new AbortController().signal;
  let calls = 0;
  const result = await executeShell({
    line,
    files,
    signal,
    runId: "shell",
    emit: (event) => {
      events.push(event);
    },
    cli: async (argv, stdin, emit) =>
      executeWasm({
        module: await engine,
        argv,
        stdin,
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
  it("drops browser credentials at host seam", async () => {
    let seen: TransportRequest | undefined;
    const transport = withDemoPolicy((request, signal) => {
      seen = request;
      return fixtureTransport(request, signal);
    });
    await transport(
      {
        url: "https://api.storerouter.ai/v1/domains",
        method: "GET",
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
      { url: "https://api.storerouter.ai/v1/domains?destination=evil", method: "GET" },
      { url: "https://evil.example/v1/domains", method: "GET" },
      { url: "https://api.storerouter.ai/v1/domains", method: "POST" },
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
