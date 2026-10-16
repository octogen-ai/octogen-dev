# Verification evidence

Recorded 2026-10-16. See [measurement.json](measurement.json) for exact machine
observations and per-asset compressed sizes. These measurements are local fixture
runs, not production latency or a browser/device performance guarantee.

## Automated checks

- Root `npm run check`: lint, formatting, all workspace and contract typechecks,
  SDK tests, CLI tests, browser tests, hermetic contract tests and all builds.
- `npm run codegen:check`: generated SDK types and CLI reference current.
- `npm run test:published-contract`: 4 published-contract checks passed.
- `npm run test:cli-package`: installed packed CLI/SDK contract smoke passed.
- Browser tests instantiate actual QuickJS WASM and genuine jq WASM. They compare
  Node and WASM stdout, stderr, exit codes, URLs, headers and request bodies for
  search, lookup/parse, domains, similar, root/generated help, versions, invalid
  arguments/flags, empty answers, authentication/403/throttle/5xx errors, SDK
  timeout, cancellation and a real 429 retry. Credential file/env/dotenv parity
  includes result-event redaction, Unicode byte counting and full 5 MiB HTML.
- Shell checks cover quoted query parsing, `.items`, the literal `.data.items`
  pipeline, jq language/compile errors, redirection, append, virtual file reset,
  rejected syntax, policy bypasses, and credential stripping. Lifecycle tests
  inject worker messages specifically to exercise stale-event/file rejection,
  host abort, reset/disposal, and hard deadlines; these complement actual WASM
  execution tests and the browser smoke rather than substituting for them.
- A closed-stdin subprocess regression test preserves Node's `unreadable_input`
  exit 2 classification. All pre-existing CLI behavior tests remain passing.

## Actual browser smoke

The built production harness was served on localhost in the Codex in-app Chromium
browser on macOS ARM64. It ran under the CSP configured in `vite.config.ts`, with
`'wasm-unsafe-eval'` and without `'unsafe-eval'`, SharedArrayBuffer or COOP/COEP.
The page remained responsive while an infinite jq program ran in its worker.
Verified through the browser UI:

1. `storerouter search 'linen dress' --limit 8 --json | jq '.items'` renders the
   fixture product and exits 0. The literal requested `.data.items` filter returns
   `null`, consistent with the unchanged flat CLI envelope.
2. Repeating the pipeline reuses the loaded modules. Displayed click-to-result observations on the final host-adapter build were
   51 ms cold and 17 ms warm. These include worker loading, real QuickJS and jq instantiation,
   fixture transport and display; local assets may have been HTTP-cached.
3. `echo '{}' | jq 'until(false; .)'` stays cancellable. Cancel terminates the
   worker; the next command succeeds.
4. `echo '{"a":2}' > value.json`, followed by `jq '.a + 3' < value.json`, renders 5.

Browser coverage is one desktop Chromium environment, not a browser support
matrix. Safari/WebKit, Firefox, mobile browsers, extensions, restrictive enterprise
policies, slow devices and remote hosting are untested. No live production
request, mutation or credential proxy was tested or claimed. Anonymous production
access is not an acceptance assumption.

## Asset and execution measurements

Method: run `npm run measure -w browser-runtime`. The script builds production
assets, computes gzip and Brotli with Node zlib defaults for every emitted file,
loads the real WASM engine, runs one cold and 100 warm eight-item fixture searches
with a fresh VM each time, then loads/runs genuine jq. It records process memory
before and after, and the QuickJS module's linear memory buffer size. Apple M4 Pro,
macOS ARM64, Node 25.8.0. Compression is measured offline, not transferred bytes.
Vite's displayed gzip estimates use different settings; the JSON is authoritative
for this measurement method. These are single-session samples, not a benchmark
study. Timing includes JSON host bridges but no real network latency or DOM work.

Initial recorded production totals were about 1.69 MB raw, 646 KB gzip and 518 KB
Brotli, including the harness, reusable entry, both engines and license notices.
QuickJS's WASM was 503,134 bytes raw / 232,350 gzip / 199,016 Brotli; jq's WASM was
928,824 raw / 332,187 gzip / 248,183 Brotli. The jq binary is loaded only when jq is
first used; worker JS currently includes its wrapper.

The recorded Node run loaded QuickJS in about 9.3 ms, executed the cold search in
23.5 ms, and warm searches in about 7.1 ms median / 8.0 ms p95. jq load was about
4.5 ms and first filtering about 8.9 ms. Consult the JSON for exact values after
any rerun; changes to assets/method require rerunning rather than extrapolation.

After 101 searches and jq loading, QuickJS linear memory was 16 MiB. Node process
RSS rose from roughly 134 MiB to 170 MiB in that sample; this includes Node, tsx,
JS wrappers, jq, allocator reservations and garbage collection. It is **not** a
browser tab's memory usage or live guest allocation measurement. The QuickJS guest
allocation cap is 128 MiB (not preallocated), chosen to allow worst-case 5 MiB HTML
JSON bridge serialization; its WASM memory can grow. No browser-process or GPU
memory measurement was isolated. Completed output/file limits and worker disposal
must not be described as a peak-memory bound.

## Limits and next integration gate

- jq's upstream raw wrapper trims stream whitespace. JSON filtering is tested;
  exact whitespace-sensitive output needs an upstream/raw-stream adapter follow-up.
- jq has no exposed per-program heap cap in this wrapper. A hard worker deadline
  and cancellation stop CPU work, but output size is checked only after it returns
  and does not prevent a high peak allocation. Public website integration should
  constrain jq workload/engine memory before exposing it to broad untrusted use.
- Browser Web API adapters intentionally implement only the SDK's used surface.
  Contract/SDK changes that need additional APIs must extend adapters and parity
  checks. No general-purpose browser/Node compatibility layer is promised.
- Browser guest caches and files are session-only. Successful runs commit the file
  snapshot; cancelled/failed worker runs discard partial writes. An idle worker
  retains module memory until disposal. Call `dispose` on component teardown.
- Browser/SDK version metadata is generated from the repository manifests/source;
  there are no independent CLI release version bumps in this slice. The branch was rebased onto merged PR #34 (`0d72c22`), retaining its
  release preparation and improved contract diagnostics. This runtime slice
  independently changes no existing package release version. Future integration
  overlap may include host interfaces, package manifests/lockfile and help/reference
  generation; rerun contract checks when they change.
- The next project should embed the stable runtime entry in the website and build
  an independently validated, credential-holding, rate-limited same-origin proxy.
  Product previews should subscribe to the existing redacted result events.
  Website work should first review the documented policy, jq peak-memory limit
  and browser matrix. Production deployment remains separately authorized.
