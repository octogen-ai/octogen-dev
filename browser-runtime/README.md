# StoreRouter browser CLI runtime

This private workspace runs the **same CLI parser, aliases, generated flags,
validation, handlers, SDK, formatting and exit classification as the installed
Node package** inside QuickJS compiled to WebAssembly. It is JavaScript executing
in a WASM JavaScript engine, not TypeScript compiled to native WASM. The browser
host and bounded shell run in a dedicated Web Worker. jq is jq 1.8.2 compiled to
WASM, supplied by `jq-wasm`; it is not a JavaScript filter imitation.

This is a reusable runtime and development harness. Website integration and a
production credential proxy are a separate project. No production key is shipped.
The harness always uses explicitly labelled fixtures, without production requests.

## Run and consume

From the repository root, with Node 20.19+ or 22.12+:

```sh
npm ci
npm run dev -w browser-runtime
npm run test -w browser-runtime
npm run build -w browser-runtime
npm exec -w browser-runtime vite preview -- --host 127.0.0.1 --port 4173
```

`dist/runtime.js` is the reusable ESM entry; `dist/index.html` is the harness.
Serve the **whole dist directory**, retaining relative worker/chunk/WASM paths
and `licenses/`. There is no npm publication in this project. A Vite integration
can instead import `src/runtime.ts` after `npm run core -w browser-runtime`.
Other bundlers should build `src/worker.ts` as a module worker and supply
`createWorker: () => new Worker(workerUrl, { type: "module" })`. Guest source is
built by esbuild's browser platform, which fails on any transitive Node import.

```ts
import { BrowserRuntime } from "./runtime.js";

const runtime = new BrowserRuntime({
  // Later website integration supplies a same-origin server proxy here.
  // This example is a seam, NOT an implemented production proxy.
  transport: async (request, signal) => {
    const response = await fetch("/demo/transport", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok) throw new Error("Demo transport failed");
    return await response.json(); // { status, headers, body: string }
  },
  onEvent(event) {
    // Each event includes a runtime-generated runId.
    // result carries the redacted raw SDK value, not parsed terminal text.
    // Append stdout/stderr to your terminal; use result for future previews.
    console.log(event);
  },
});

const result = await runtime.run(
  "storerouter search 'linen dress' --limit 8 --json | jq '.items'",
);
console.log(result.code, result.stdout, result.stderr);
runtime.writeFile("/session/input.json", '{"a":2}');
await runtime.run("jq '.a + 3' < input.json > result.json");
console.log(runtime.readFile("/session/result.json"));
runtime.reset(); // cancel active work and clear virtual files/cache
runtime.dispose(); // terminate worker, clear session; no further runs
```

The existing CLI JSON envelope is flat: search emits `.items`, **not
`.data.items`**. The originally requested pipeline
`storerouter search 'linen dress' --limit 8 --json | jq '.data.items'` is supported
and tested, but genuine jq correctly returns `null`. Changing that result would
require changing the public stdout contract, which this runtime preserves.

## Host API and lifecycle

`BrowserRuntime` exposes `run`, `cancel`, `dispose`, `reset`, `readFile`,
`writeFile`, and `listFiles`. `run` returns `{code, stdout, stderr, files}`.
`onEvent` receives `start`, `stdout`, `stderr`, `result`, `exit`, `cancelled`, or
`error`, all carrying a run ID. Events from cancelled/superseded workers are
ignored. Starting another run cancels its predecessor. Cancellation rejects with
`AbortError`, aborts outstanding host requests, terminates the worker (including
synchronous/infinite jq), discards partial file changes, and creates a fresh
worker next time. Host transports must honor their `AbortSignal`; late results
are ignored even if they do not. `timeoutMs` sets a whole-run deadline, capped at
two minutes; the default is two minutes. The SDK's `--timeout` remains per request.

Idle workers retain loaded WASM modules. Each CLI stage gets a fresh QuickJS
context/runtime with a 128 MiB guest allocation limit, 512 KiB stack limit, CPU
interrupt deadline, promise job pump, and deterministic handle disposal. Network,
timers and pending promise handles are cleaned up at invocation completion.
`dispose` is required when removing the harness/component. Observer exceptions
cannot fail commands or trigger duplicate API searches.

`cli/src/host.ts` defines the shared core's explicit filesystem/path/hash/version
capabilities. `run-core.ts` takes explicit streams, argv, env, cwd, stdin, fetch,
sleep/random and result observer. Node adapters in `run.ts`, `node-host.ts`,
`auth.ts`, `coverage.ts`, `help.ts`, and `version.ts` preserve installed behavior:
key stdin/file/environment/.env precedence, ancestor repo boundary, SHA-256 cache
scope, legacy cache roots/format, 0700 directories and 0600 cache files. Node
package release versions are unchanged.

QuickJS has ECMAScript built-ins, not browser Web APIs. `guest.ts` implements only
the SDK's used Response/Headers/AbortController/timer surface; URL parsing,
URLSearchParams serialization, UTF-8 encoding, hashing and monotonic time cross
explicit bridges to the host. There are no global Node shims or alternate SDK
HTTP client. SDK request construction, response/error decoding and request
timeouts execute inside WASM. The browser profile has no ambient process env or
host disk access. Virtual files (including explicitly supplied .env/key files)
are session-only and never browser storage; browser Authorization is stripped
before the injected transport. Version metadata labels the engine `quickjs-wasm`
in the existing `cli.node` field for compatibility.

## Network/proxy policy for the next project

`Transport` is `(request, signal) => Promise<{status, headers, body}>`, with a
serialized SDK request `{url, method, headers, body?}`. `BrowserRuntime` always
applies `withDemoPolicy` before calling the supplied transport. It uses SDK
`OPERATIONS` and the existing generated contract validator, not another command
or schema registry. It allows only search, lookup/parse, and similar on
exact `https://api.storerouter.ai/v1` paths and methods; it denies arbitrary
destinations, query smuggling, unknown body fields, mutation/admin routes and
lookup auto/refresh. Lookup needs `--resolution-mode index_only`. Raw `api` may
call these same approved operations; it cannot escape the policy. Browser headers
are reduced to Accept/Content-Type/If-None-Match; Authorization and User-Agent
are never forwarded. Policy failures use existing CLI network failure semantics.

A browser policy is **not a server security boundary**: users can edit downloaded
JavaScript. The future website server must independently enforce this profile,
validate bodies, hold the production key, constrain redirects/destinations,
authenticate/rate-limit/size-limit callers and redact upstream failures. It must
not accept arbitrary upstream URLs or forward browser credentials. A proxy
operation must issue one upstream request and return its result; previews consume
`result` events and must not issue duplicate searches. No production proxy is
implemented here. Anonymous GET `/v1/domains` (since removed) returned 401 in the preceding
review; **keyless production access is not assumed**. The browser overrides the
installed CLI's legacy trial notice with a host-transport notice.

## Bounded shell and files

Supported executables: `storerouter`, compatibility `octogen`, genuine `jq`,
`cat`, `echo`. CLI `parse` remains the existing `lookup` alias. All existing CLI
commands remain in shared help; hosts explicitly refuse disallowed capabilities
at the network boundary. No Voyager surface is added.

- Single/double quoted strings, backslash escapes, quoted empty arguments.
- At most eight buffered pipeline stages, `<`, `>`, `>>`. Relative files resolve
  under `/session`; absolute paths refer only to the same virtual filesystem.
- One input/output redirect per stage; no pipe plus input redirect, or pipe after
  output redirect. Pipelines stop on the first nonzero exit, retaining the CLI
  error envelope. Stderr never enters a pipe. CLI diagnostics stream immediately;
  stdout is buffered between stages and emitted at the final stage.
- jq accepts `-c`, `-r`, `-e`, `-s`, `-S` as separate flags and one filter. Use
  redirection/cat for files. No jq module/file-loading flags or arbitrary WASI fs.
- 64 KiB command input, 8 MiB total virtual file bytes, 8 MiB completed stage
  output (checked after jq returns). `jq-wasm` currently trims surrounding stream
  whitespace, including the trailing newline, in its upstream `raw()` wrapper.
  JSON processing works; byte-exact whitespace-sensitive jq output is unsupported.
- No Bash, expansion, substitutions, globbing, `;`, `&&`, `||`, background jobs,
  package manager, shell scripts, host processes, symlinks or disk mounts.

The harness has editable command input, output, ↑/↓ session history, cancellation,
reset and a virtual file editor. It uses basic repository-neutral styling because
this repository has no UI design system or OctogenSpinner component; no spinner
was introduced. The marketing website was not edited.

## Browser, CSP, licenses and evidence

See [EVIDENCE.md](EVIDENCE.md) for actual coverage, measurements and remaining
limits. Serve WASM as `application/wasm`, JS as JavaScript, over HTTP(S), not
`file://`. The tested production-preview CSP is:

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'
```

Vite development mode needs its usual HMR allowances; the preview policy tests the
production bundle. These single-threaded engines require no SharedArrayBuffer,
COOP/COEP or cross-origin isolation. Hosting may need its own CSP nonce/hash
arrangements; permit same-origin worker/module/WASM loading and future proxy
connections. The JS interpreter evaluates its bundle inside WASM; it does not
use host JS `eval`/`new Function` or require `'unsafe-eval'`.

QuickJS/quickjs-emscripten, jq-wasm and noble-hashes use MIT licenses. jq includes
permissive MIT/ICU/BSD-style components, and bundled Oniguruma uses BSD terms.
Full notices are distributed in `public/licenses/` and copied into `dist/licenses/`.
No commercially constrained container runtime is used. Primary documentation and
license sources reviewed for this implementation:

- [quickjs-emscripten API, promises, memory management and packaging](https://github.com/justjake/quickjs-emscripten)
- [quickjs-emscripten license](https://github.com/justjake/quickjs-emscripten/blob/main/LICENSE)
- [jq-wasm API and license](https://github.com/owenthereal/jq-wasm)
- [jq 1.8.2 COPYING](https://github.com/jqlang/jq/blob/jq-1.8.2/COPYING)
- [Oniguruma COPYING](https://github.com/kkos/oniguruma/blob/v6.9.10/COPYING)
- [CSP WebAssembly directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)
