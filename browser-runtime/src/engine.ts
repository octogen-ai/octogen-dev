import RELEASE_SYNC from "@jitl/quickjs-wasmfile-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSWASMModule,
  type QuickJSDeferredPromise,
} from "quickjs-emscripten-core";
import { sha256 } from "@noble/hashes/sha2.js";
import coreSource from "./core-source.generated.js";
import { resolvePath, VirtualFiles } from "./virtual-files.js";
import type { Transport, ExecutionResult, ExecutionEvent } from "./protocol.js";

export interface EngineOptions {
  module?: QuickJSWASMModule;
  argv: string[];
  keylessNotice?: string;
  /** Commands the CLI refuses in this host; see CliHost.unavailableCommands. */
  unavailableCommands?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  /** Final, unredirected stage of a terminal host: the CLI prints its human format. */
  isTty?: boolean;
  files: VirtualFiles;
  transport: Transport;
  signal: AbortSignal;
  runId: string;
  version: { version: string; sdkVersion: string; node: string };
  emit: (event: ExecutionEvent) => void;
}
/** Standard (non-Asyncify) QuickJS, a real WASM interpreter with promise bridges. */
export async function loadEngine(): Promise<QuickJSWASMModule> {
  return newQuickJSWASMModuleFromVariant(RELEASE_SYNC);
}
export async function executeWasm(options: EngineOptions): Promise<ExecutionResult> {
  const module = options.module ?? (await loadEngine());
  options.signal.throwIfAborted();
  const vm = module.newContext();
  vm.runtime.setMemoryLimit(128 * 1024 * 1024);
  vm.runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + 120_000;
  vm.runtime.setInterruptHandler(() => options.signal.aborted || Date.now() > deadline);
  const promises = new Set<QuickJSDeferredPromise>();
  const requests = new Map<number, AbortController>();
  const timers = new Map<
    number,
    { timer: ReturnType<typeof setTimeout>; resolve: () => void }
  >();
  let alive = true;
  let stdout = "";
  let stderr = "";
  let fail: (error: unknown) => void = () => {
    /* Assigned by the failure promise below. */
  };
  const failed = new Promise<never>((_resolve, reject) => {
    fail = reject;
  });
  const pump = (): void => {
    if (!alive) return;
    const result = vm.runtime.executePendingJobs();
    if (result.error) {
      const error: unknown = vm.dump(result.error);
      result.error.dispose();
      fail(new Error(JSON.stringify(error)));
    }
  };
  const abort = (): void => {
    fail(new DOMException("Execution cancelled", "AbortError"));
  };
  options.signal.addEventListener("abort", abort, { once: true });
  function sync(op: string, value: unknown): unknown {
    switch (op) {
      case "readFile":
        return options.files.read(String(value));
      case "writeFile": {
        const data = value as { path: string; contents: string };
        options.files.write(data.path, data.contents);
        return null;
      }
      case "exists":
        return options.files.exists(String(value));
      case "resolve":
        return resolvePath(...(value as string[]));
      case "dirname":
        return resolvePath(String(value), "..");
      case "sha256":
        return Array.from(sha256(new TextEncoder().encode(String(value))), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
      case "utf8ByteLength":
        return new TextEncoder().encode(String(value)).byteLength;
      case "now":
        return performance.now();
      case "url": {
        const url = new URL(String(value));
        return {
          href: url.href,
          hostname: url.hostname,
          host: url.host,
          protocol: url.protocol,
          pathname: url.pathname,
        };
      }
      case "query":
        return new URLSearchParams(value as [string, string][]).toString();
      case "abortFetch":
        requests.get(Number(value))?.abort();
        return null;
      case "clearTimer": {
        const pending = timers.get(Number(value));
        if (pending) {
          clearTimeout(pending.timer);
          pending.resolve();
          timers.delete(Number(value));
        }
        return null;
      }
      default:
        throw new Error(`Unknown host operation ${op}`);
    }
  }
  async function asyncCall(op: string, value: unknown): Promise<unknown> {
    if (op === "sleep") {
      const { id, ms } = value as { id: number; ms: number };
      await new Promise<void>((resolve) => {
        timers.set(id, {
          timer: setTimeout(
            () => {
              timers.delete(id);
              resolve();
            },
            Math.min(Math.max(ms, 0), 120_000),
          ),
          resolve,
        });
      });
      return null;
    }
    if (op === "fetch") {
      const { id, request } = value as {
        id: number;
        request: Parameters<Transport>[0];
      };
      const controller = new AbortController();
      requests.set(id, controller);
      try {
        return await options.transport(request, controller.signal);
      } finally {
        requests.delete(id);
      }
    }
    throw new Error(`Unknown async host operation ${op}`);
  }
  try {
    vm.newFunction("__sync", (op, value) =>
      vm.newString(
        JSON.stringify(sync(vm.getString(op), JSON.parse(vm.getString(value)))),
      ),
    ).consume((fn) => {
      vm.setProp(vm.global, "__sync", fn);
    });
    vm.newFunction("__async", (op, value) => {
      const operation = vm.getString(op);
      const payload: unknown = JSON.parse(vm.getString(value));
      const promise = vm.newPromise();
      promises.add(promise);
      void asyncCall(operation, payload).then(
        (result) => {
          if (!alive) return;
          vm.newString(JSON.stringify(result)).consume((handle) => {
            promise.resolve(handle);
          });
          pump();
        },
        (error: unknown) => {
          if (!alive) return;
          vm.newError(
            error instanceof Error ? error.message : "Host operation failed",
          ).consume((handle) => {
            promise.reject(handle);
          });
          pump();
        },
      );
      return promise.handle;
    }).consume((fn) => {
      vm.setProp(vm.global, "__async", fn);
    });
    vm.newFunction("__emit", (kind, payload) => {
      const type = vm.getString(kind);
      const text = vm.getString(payload);
      if (type === "stdout") {
        stdout += text;
        options.emit({ runId: options.runId, type, text });
      } else if (type === "stderr") {
        stderr += text;
        options.emit({ runId: options.runId, type, text });
      } else if (type === "result") {
        const result = JSON.parse(text) as { operation: string; data: unknown };
        options.emit({ runId: options.runId, type, ...result });
      }
      if (stdout.length + stderr.length > 8 * 1024 * 1024)
        throw new Error("Output exceeds 8 MiB");
    }).consume((fn) => {
      vm.setProp(vm.global, "__emit", fn);
    });
    vm.newString(
      JSON.stringify({
        argv: options.argv,
        keylessNotice: options.keylessNotice,
        unavailableCommands: options.unavailableCommands,
        cwd: options.cwd ?? "/session",
        env: options.env ?? { STOREROUTER_CACHE_DIR: "/cache" },
        stdin: options.stdin ?? "",
        isTty: options.isTty === true,
        version: options.version,
      }),
    ).consume((handle) => {
      vm.setProp(vm.global, "__input", handle);
    });
    vm.unwrapResult(vm.evalCode(coreSource, "storerouter-core.js")).dispose();
    const completion = vm.getProp(vm.global, "__completion");
    try {
      const completionPromise = vm.resolvePromise(completion);
      pump();
      const settled = await Promise.race([completionPromise, failed]);
      const code = vm.unwrapResult(settled).consume((handle) => vm.getNumber(handle));
      return { code, stdout, stderr, files: options.files.snapshot() };
    } finally {
      completion.dispose();
    }
  } finally {
    alive = false;
    options.signal.removeEventListener("abort", abort);
    for (const controller of requests.values()) controller.abort();
    for (const { timer, resolve } of timers.values()) {
      clearTimeout(timer);
      resolve();
    }
    for (const promise of promises) promise.dispose();
    vm.dispose();
  }
}
