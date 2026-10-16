import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { executeWasm, loadEngine } from "../src/engine.js";
import { VirtualFiles } from "../src/virtual-files.js";
import { run } from "../../cli/src/run.js";
import { nodeHost } from "../../cli/src/node-host.js";
import { TEST_KEY } from "../../cli/tests/harness.js";
import type { ExecutionEvent } from "../src/protocol.js";

it("file/env/dotenv precedence, virtual file input, and redacted raw result events match Node", async () => {
  const module = await loadEngine();
  const cwd = mkdtempSync(join(tmpdir(), "wasm-auth-"));
  const keyFile = join(cwd, "key");
  const html = join(cwd, "page.html");
  const dotenv = join(cwd, ".env");
  const initialFiles = {
    [keyFile]: TEST_KEY,
    [html]: "<html>É product</html>",
    [dotenv]: `STOREROUTER_API_KEY=${TEST_KEY}\n`,
  };
  for (const [path, text] of Object.entries(initialFiles)) writeFileSync(path, text);
  try {
    for (const [argv, env] of [
      [["search", "dress", "--api-key-file", keyFile, "--json"], {}],
      [["search", "dress", "--json"], { STOREROUTER_API_KEY: TEST_KEY }],
      [["search", "dress", "--json"], {}],
      [["resolve", "--html", html, "--url", "https://example.com/p", "--json"], {}],
    ] as const) {
      const seen: string[] = [];
      const events: ExecutionEvent[] = [];
      const body =
        argv[0] === "resolve"
          ? { source: "html", product: { title: TEST_KEY, images: [], variants: [] } }
          : {
              items: [{ title: TEST_KEY, productUrl: "https://example.com/p" }],
              nextCursor: null,
            };
      const wasm = await executeWasm({
        module,
        argv: [...argv],
        cwd,
        env,
        files: new VirtualFiles(initialFiles),
        signal: new AbortController().signal,
        runId: "credential",
        version: nodeHost.version,
        emit: (event) => {
          events.push(event);
        },
        transport: (request) => {
          seen.push(request.headers["Authorization"] ?? "");
          return Promise.resolve({
            status: 200,
            headers: {},
            body: JSON.stringify(body),
          });
        },
      });
      let stdout = "",
        stderr = "";
      const code = await run({
        argv,
        cwd,
        env,
        isTty: false,
        stdout: (text) => {
          stdout += text;
        },
        stderr: (text) => {
          stderr += text;
        },
        fetch: (_url, init) => {
          seen.push(new Headers(init?.headers).get("Authorization") ?? "");
          return Promise.resolve(Response.json(body));
        },
      });
      expect(wasm.code).toBe(0);
      expect(wasm).toMatchObject({ code, stdout, stderr });
      expect(seen).toEqual([`Bearer ${TEST_KEY}`, `Bearer ${TEST_KEY}`]);
      expect(JSON.stringify(events)).not.toContain(TEST_KEY);
      expect(wasm.stdout).not.toContain(TEST_KEY);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

it("accepts the full 5 MiB HTML cap without a JSON byte-array allocation", async () => {
  const files = new VirtualFiles({ "/page": "x".repeat(5 * 1024 * 1024) });
  let called = false;
  const result = await executeWasm({
    argv: ["resolve", "--html", "/page", "--url", "https://example.com/p", "--json"],
    files,
    signal: new AbortController().signal,
    runId: "large",
    version: nodeHost.version,
    emit: () => {
      /* Result assertions below. */
    },
    transport: () => {
      called = true;
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({
          source: "html",
          product: { title: "large input", images: [], variants: [] },
        }),
      });
    },
  });
  expect(result.code, result.stdout).toBe(0);
  expect(called).toBe(true);
  expect(JSON.parse(result.stdout)).toHaveProperty("bytes", 5 * 1024 * 1024);
});
