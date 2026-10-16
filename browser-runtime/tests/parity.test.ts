import { describe, expect, it } from "vitest";
import { run } from "../../cli/src/run.js";
import { nodeHost } from "../../cli/src/node-host.js";
import { executeWasm, loadEngine } from "../src/engine.js";
import { VirtualFiles } from "../src/virtual-files.js";
import { fixtureTransport } from "../src/fixtures.js";
import type { Transport } from "../src/protocol.js";

const module = loadEngine();
async function parity(
  argv: string[],
  transport: Transport = fixtureTransport,
): Promise<void> {
  let stdout = "",
    stderr = "";
  const requests: unknown[][] = [[], []];
  const wasm = await executeWasm({
    module: await module,
    argv,
    files: new VirtualFiles(),
    signal: new AbortController().signal,
    runId: "parity",
    version: nodeHost.version,
    emit: () => {
      /* Stream parity is asserted from collected results. */
    },
    transport: (request, signal) => {
      requests[0]?.push(request);
      return transport(request, signal);
    },
  });
  const code = await run({
    argv,
    cwd: "/nonexistent-storerouter-test",
    env: { STOREROUTER_CACHE_DIR: "/dev/null/no-cache" },
    isTty: false,
    fetch: async (url, init) => {
      const request = {
        url: typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
        method: init?.method ?? "GET",
        headers: Object.fromEntries(new Headers(init?.headers)),
        ...(typeof init?.body === "string" ? { body: init.body } : {}),
      };
      requests[1]?.push(request);
      const response = await transport(
        request,
        init?.signal ?? new AbortController().signal,
      );
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    },
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  expect(wasm.stdout).toBe(stdout);
  expect(wasm.stderr).toBe(stderr);
  expect(wasm.code).toBe(code);
  // Header casing is immaterial; payload and destination must be identical.
  const normalized = requests.map((list) =>
    list.map((value) => {
      const request = value as { headers: Record<string, string> };
      return {
        ...request,
        headers: Object.fromEntries(
          Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v]),
        ),
      };
    }),
  );
  expect(normalized[0]).toEqual(normalized[1]);
}
describe("actual QuickJS WASM / installed Node parity", () => {
  for (const argv of [
    ["search", "linen dress", "--limit", "8", "--json"],
    [
      "lookup",
      "https://example.com/linen-dress",
      "--resolution-mode",
      "index_only",
      "--json",
    ],
    ["parse", "https://example.com/linen-dress", "--json"],
    ["domains", "--no-cache", "--json"],
    ["similar", "https://example.com/linen-dress", "--json"],
    ["search", "--help"],
    ["lookup", "--help"],
    [],
    ["--version"],
    ["search", "dress", "--limit", "0", "--json"],
    ["search", "dress", "--unknown", "x", "--json"],
    ["voyager", "--json"],
  ])
    it(argv.join(" ") || "root help", async () => {
      await parity(argv);
    });
  for (const status of [401, 403, 429, 500])
    it(`error ${String(status)}`, async () => {
      await parity(["search", "dress", "--no-retry", "--json"], () =>
        Promise.resolve({
          status,
          headers: { "retry-after": "2" },
          body: JSON.stringify({ detail: "fixture refusal" }),
        }),
      );
    });
  it("empty search", async () => {
    await parity(["search", "dress", "--json"], () =>
      Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({ items: [], nextCursor: null }),
      }),
    );
  });
  it("timeout uses the SDK abort and exit semantics", async () => {
    await parity(
      ["search", "dress", "--timeout", "0.01", "--no-retry", "--json"],
      (_request, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              reject(new Error("The operation was aborted"));
            },
            { once: true },
          );
        }),
    );
  });
  it("cancels pending network and disposes VM; next execution succeeds", async () => {
    const controller = new AbortController();
    let aborted = false;
    const result = executeWasm({
      module: await module,
      argv: ["search", "dress"],
      files: new VirtualFiles(),
      signal: controller.signal,
      runId: "cancel",
      version: nodeHost.version,
      emit: () => {
        /* Stream parity is asserted from collected results. */
      },
      transport: (_request, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
          setTimeout(() => {
            controller.abort();
          }, 10);
        }),
    });
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(aborted).toBe(true);
    await parity(["search", "dress", "--json"]);
  });
});

it("throttling retries use SDK headers and the shared CLI policy", async () => {
  let calls = 0;
  await parity(["search", "dress", "--json"], (request, signal) => {
    calls++;
    if (calls % 2 === 1)
      return Promise.resolve({
        status: 429,
        headers: { "retry-after": "0" },
        body: JSON.stringify({ detail: "temporarily throttled" }),
      });
    return fixtureTransport(request, signal);
  });
  expect(calls).toBe(4); // one retry per host, never a duplicated successful search
});
