import { expect, it } from "vitest";
import { executeWasm, loadEngine } from "../src/engine.js";
import { VirtualFiles } from "../src/virtual-files.js";
import { nodeHost } from "../../cli/src/node-host.js";
import { TEST_KEY } from "../../cli/tests/harness.js";

/**
 * A store snapshot large enough that printing it grows WASM memory inside a
 * pending job. quickjs-emscripten then wraps a stray JSContext; without
 * disposing it, teardown aborts with `list_empty(&rt->gc_obj_list)`.
 */
function largeStore(): string {
  const distributions = Array.from({ length: 400 }, (_, d) => ({
    name: `field_${String(d)}`,
    source: "enrichment",
    populationCount: 1000,
    populatedCount: 900,
    values: Array.from({ length: 12 }, (_, v) => ({
      value: `value-${String(d)}-${String(v)}`,
      label: `Value ${String(d)} ${String(v)}`,
      count: 100 - v,
    })),
    truncated: false,
    approximate: false,
  }));
  const scope = { summary: "A large store.", productCount: 50000, distributions };
  return JSON.stringify({
    host: "large.example",
    catalogs: [
      {
        catalog: "large",
        catalogDisplayName: "Large",
        productCount: 50000,
        computedAt: "2026-10-26T00:00:00Z",
        fields: [],
        profile: {
          overall: scope,
          departments: Array.from({ length: 6 }, (_, i) => ({
            ...scope,
            departmentId: `department-${String(i)}`,
            categoryPath: [`Department ${String(i)}`],
          })),
        },
      },
    ],
  });
}

it("prints a multi-megabyte response and tears the runtime down cleanly", async () => {
  const body = largeStore();
  expect(body.length).toBeGreaterThan(2 * 1024 * 1024);
  const module = await loadEngine();
  for (let run = 0; run < 2; run++) {
    // A second run on the same module proves the first did not abort it.
    const result = await executeWasm({
      module,
      argv: ["stores", "show", "large.example", "--json"],
      env: { STOREROUTER_API_KEY: TEST_KEY },
      files: new VirtualFiles(),
      signal: new AbortController().signal,
      runId: `large-${String(run)}`,
      version: nodeHost.version,
      emit: () => {
        /* Output is asserted from the result. */
      },
      transport: () =>
        Promise.resolve({
          status: 200,
          headers: { "content-type": "application/json" },
          body,
        }),
    });
    expect(result.code).toBe(0);
    const printed = JSON.parse(result.stdout) as { catalogs: { catalog: string }[] };
    expect(printed.catalogs[0]?.catalog).toBe("large");
  }
}, 60_000);
