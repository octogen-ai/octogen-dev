import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { executeWasm, loadEngine } from "../src/engine.js";
import { VirtualFiles } from "../src/virtual-files.js";
import { fixtureTransport } from "../src/fixtures.js";
import { nodeHost } from "../../cli/src/node-host.js";
import { loadJq } from "jq-wasm";
const assets: { path: string; bytes: number; gzip: number; brotli: number }[] = [];
function visit(directory: string): void {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) visit(path);
    else {
      const content = readFileSync(path);
      assets.push({
        path,
        bytes: content.length,
        gzip: gzipSync(content).length,
        brotli: brotliCompressSync(content).length,
      });
    }
  }
}
visit("dist");
const before = process.memoryUsage();
const started = performance.now();
const module = await loadEngine();
const engineLoadMs = performance.now() - started;
const times: number[] = [];
const transport: typeof fixtureTransport = async (request, signal) => {
  const response = await fixtureTransport(request, signal);
  if (request.url.endsWith("/search")) {
    const page = JSON.parse(response.body) as { items: Record<string, unknown>[] };
    response.body = JSON.stringify({
      ...page,
      items: Array.from({ length: 8 }, (_, i) => ({
        ...page.items[0],
        uuid: `fixture-${String(i)}`,
        title: `Linen dress ${String(i)} (fixture)`,
      })),
    });
  }
  return response;
};
let stdout = "";
for (let i = 0; i < 101; i++) {
  const runStart = performance.now();
  const result = await executeWasm({
    module,
    argv: ["search", "linen dress", "--limit", "8", "--json"],
    files: new VirtualFiles(),
    signal: new AbortController().signal,
    runId: `measure-${String(i)}`,
    version: nodeHost.version,
    transport,
    emit: () => {
      /* Measure without rendering. */
    },
  });
  if (result.code !== 0) throw new Error(result.stdout);
  stdout = result.stdout;
  times.push(performance.now() - runStart);
}
const jqStart = performance.now();
const jq = await loadJq();
const jqLoadMs = performance.now() - jqStart;
const jqRunStart = performance.now();
const filtered = jq.raw(stdout, ".items");
if (filtered.exitCode !== 0) throw new Error(filtered.stderr);
const jqRunMs = performance.now() - jqRunStart;
const warm = times.slice(1).sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      assets,
      totals: assets.reduce(
        (sum, asset) => ({
          bytes: sum.bytes + asset.bytes,
          gzip: sum.gzip + asset.gzip,
          brotli: sum.brotli + asset.brotli,
        }),
        { bytes: 0, gzip: 0, brotli: 0 },
      ),
      engineLoadMs,
      coldExecuteMs: times[0],
      warmMedianMs: warm[50],
      warmP95Ms: warm[95],
      jqLoadMs,
      jqRunMs,
      memory: {
        before,
        after: process.memoryUsage(),
        quickjsLinearMemoryBytes: module.getWasmMemory().buffer.byteLength,
      },
    },
    null,
    2,
  ),
);
