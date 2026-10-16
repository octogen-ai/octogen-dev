/** SDK Web API adapters inside QuickJS. Only the CLI/SDK's used surface is exposed. */
import { run } from "../../cli/src/run-core.js";
import type { CliHost } from "../../cli/src/host.js";

declare const __sync: (operation: string, payload: string) => string;
declare const __async: (operation: string, payload: string) => Promise<string>;
declare const __emit: (type: string, payload: string) => void;
declare const __input: string;
const sync = (op: string, value: unknown): unknown =>
  JSON.parse(__sync(op, JSON.stringify(value)));
const invoke = async (op: string, value: unknown): Promise<unknown> =>
  JSON.parse(await __async(op, JSON.stringify(value)));

class SdkHeaders {
  private readonly entries: [string, string][];
  constructor(headers: Record<string, string> = {}) {
    this.entries = Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]);
  }
  get(key: string): string | null {
    return this.entries.find(([k]) => k === key.toLowerCase())?.[1] ?? null;
  }
  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries[Symbol.iterator]();
  }
}
class SdkResponse {
  readonly headers: SdkHeaders;
  constructor(
    readonly body: string,
    readonly status: number,
    headers: Record<string, string>,
  ) {
    this.headers = new SdkHeaders(headers);
  }
  text(): Promise<string> {
    return Promise.resolve(this.body);
  }
  json(): Promise<unknown> {
    return Promise.resolve(JSON.parse(this.body) as unknown);
  }
}
class SdkSignal {
  aborted = false;
  listeners: (() => void)[] = [];
  addEventListener(_name: string, fn: () => void): void {
    this.listeners.push(fn);
  }
  removeEventListener(_name: string, fn: () => void): void {
    this.listeners = this.listeners.filter((x) => x !== fn);
  }
}
class SdkAbortController {
  readonly signal = new SdkSignal();
  abort(): void {
    this.signal.aborted = true;
    for (const fn of this.signal.listeners) fn();
  }
}
let serial = 0;
const timers = new Set<number>();
const guestTimeout = (fn: () => void, ms: number): number => {
  const id = ++serial;
  timers.add(id);
  void invoke("sleep", { id, ms }).then(() => {
    if (timers.delete(id)) fn();
  });
  return id;
};
Object.assign(globalThis, {
  Response: SdkResponse,
  AbortController: SdkAbortController,
  setTimeout: guestTimeout,
  clearTimeout: (id: number) => {
    timers.delete(id);
    sync("clearTimer", id);
  },
  performance: { now: () => sync("now", null) },
  // SDK needs native URL parsing/IDN normalization; host supplies the parsed fields.
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  URL: class {
    constructor(url: string) {
      Object.assign(this, sync("url", url));
    }
  },
  URLSearchParams: class {
    private readonly values = new Map<string, string>();
    set(key: string, value: string): void {
      this.values.set(key, value);
    }
    toString(): string {
      return sync("query", [...this.values]) as string;
    }
  },
});
const fetchBridge = async (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: SdkSignal;
  },
): Promise<SdkResponse> => {
  const id = ++serial;
  if (init.signal.aborted) throw new Error("The operation was aborted");
  const abort = (): void => {
    sync("abortFetch", id);
  };
  init.signal.addEventListener("abort", abort);
  try {
    const response = (await invoke("fetch", {
      id,
      request: {
        url,
        method: init.method,
        headers: init.headers,
        ...(init.body === undefined ? {} : { body: init.body }),
      },
    })) as { status: number; headers: Record<string, string>; body: string };
    return new SdkResponse(response.body, response.status, response.headers);
  } finally {
    init.signal.removeEventListener("abort", abort);
  }
};
const input = JSON.parse(__input) as {
  argv: string[];
  keylessNotice?: string;
  cwd: string;
  env: Record<string, string>;
  stdin: string;
  version: CliHost["version"];
};
const host: CliHost = {
  utf8ByteLength: (text) => sync("utf8ByteLength", text) as number,
  ...(input.keylessNotice === undefined ? {} : { keylessNotice: input.keylessNotice }),
  readFile: (path) => sync("readFile", path) as string,
  writeCache: (path, contents) => {
    sync("writeFile", { path, contents });
  },
  exists: (path) => sync("exists", path) as boolean,
  resolve: (...parts) => sync("resolve", parts) as string,
  dirname: (path) => sync("dirname", path) as string,
  join: (...parts) => sync("resolve", parts) as string,
  homedir: () => "/session",
  sha256: (text) => sync("sha256", text) as string,
  version: input.version,
};
// Environment and files are explicit. Browser credentials belong in the host's server proxy.
Object.assign(globalThis, {
  __completion: run({
    argv: input.argv,
    host,
    cwd: input.cwd,
    env: input.env,
    isTty: false,
    readStdin: () => input.stdin,
    fetch: fetchBridge as unknown as typeof fetch,
    stdout: (text) => {
      __emit("stdout", text);
    },
    stderr: (text) => {
      __emit("stderr", text);
    },
    onResult: (operation, data) => {
      __emit("result", JSON.stringify({ operation, data }));
    },
  }),
});
