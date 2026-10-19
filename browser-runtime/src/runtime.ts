import { withDemoPolicy } from "./policy.js";
import { VirtualFiles } from "./virtual-files.js";
import type { ExecutionEvent, ExecutionResult, Transport } from "./protocol.js";
import type { RunMessage, ResponseMessage, WorkerMessage } from "./worker.js";
export type {
  ExecutionEvent,
  ExecutionResult,
  Transport,
  TransportRequest,
  TransportResponse,
} from "./protocol.js";
export { checkDemoRequest, withDemoPolicy } from "./policy.js";

export interface BrowserRuntimeOptions {
  transport: Transport;
  onEvent?: (event: ExecutionEvent) => void;
  /** Supply a worker from your own bundler. The default is Vite-compatible. */
  createWorker?: () => Worker;
  /**
   * The host renders stdout as a terminal. The final stage, when it is not
   * redirected, then sees a TTY and prints the CLI's human format, exactly as an
   * installed CLI does in a shell; piped and redirected stages keep JSON.
   */
  terminal?: boolean;
  /**
   * Replaces the stderr notice keyless CLI calls print. The default says the
   * transport is host-injected; a host whose server proxy holds the key can
   * pass its own wording, or "" for none.
   */
  keylessNotice?: string;
  /** Hard deadline also terminates synchronous jq programs; maximum two minutes. */
  timeoutMs?: number;
}
interface ActiveRun {
  id: string;
  controllers: Map<number, AbortController>;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
/** One worker per session, one execution at a time. Starting a run cancels its predecessor.
 * Idle workers retain WASM modules; each CLI invocation gets a fresh disposed VM.
 */
export class BrowserRuntime {
  private worker: Worker | undefined;
  private active: ActiveRun | undefined;
  private readonly files = new VirtualFiles();
  private readonly transport: Transport;
  private sequence = 0;
  private disposed = false;
  constructor(private readonly options: BrowserRuntimeOptions) {
    this.transport = withDemoPolicy(options.transport);
  }
  private emit(event: ExecutionEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch {
      /* Observers cannot change execution semantics. */
    }
  }
  readFile(path: string): string {
    return this.files.read(path);
  }
  writeFile(path: string, text: string): void {
    if (this.active) throw new Error("Cancel execution before editing files");
    this.files.write(path, text);
  }
  listFiles(): Record<string, string> {
    return this.files.snapshot();
  }
  reset(): void {
    this.cancel();
    this.files.reset();
  }
  cancel(): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    clearTimeout(active.timer);
    for (const controller of active.controllers.values()) controller.abort();
    this.worker?.terminate();
    this.worker = undefined;
    this.emit({ type: "cancelled", runId: active.id });
    active.reject(new DOMException("Execution cancelled", "AbortError"));
  }
  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = undefined;
    this.files.reset();
    this.disposed = true;
  }
  run(line: string): Promise<ExecutionResult> {
    if (this.disposed) return Promise.reject(new Error("Runtime is disposed"));
    this.cancel();
    const id = `run-${String(++this.sequence)}`;
    const worker = (this.worker ??=
      this.options.createWorker?.() ??
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
    let stdout = "";
    let stderr = "";
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.cancel();
        },
        Math.min(Math.max(this.options.timeoutMs ?? 120_000, 1), 120_000),
      );
      const active: ActiveRun = { id, reject, timer, controllers: new Map() };
      this.active = active;
      const finish = (): void => {
        clearTimeout(timer);
        for (const controller of active.controllers.values()) controller.abort();
        this.active = undefined;
      };
      worker.onerror = () => {
        if (this.active !== active) return;
        finish();
        worker.terminate();
        this.worker = undefined;
        reject(new Error("Browser worker failed to load or execute"));
        this.emit({
          type: "error",
          runId: id,
          message: "Browser worker failed to load or execute",
        });
      };
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (this.active !== active || message.runId !== id) return;
        if (message.type === "request") {
          const controller = new AbortController();
          active.controllers.set(message.id, controller);
          void Promise.resolve()
            .then(() => this.transport(message.request, controller.signal))
            .then(
              (response) => {
                if (this.active === active)
                  worker.postMessage({
                    type: "response",
                    runId: id,
                    id: message.id,
                    response,
                  } satisfies ResponseMessage);
              },
              () => {
                // Do not echo a proxy exception/URL that may carry server diagnostics or secrets.
                if (this.active === active)
                  worker.postMessage({
                    type: "response",
                    runId: id,
                    id: message.id,
                    error: "Browser transport refused or failed",
                  } satisfies ResponseMessage);
              },
            )
            .finally(() => active.controllers.delete(message.id));
          return;
        }
        if (message.type === "abortRequest") {
          active.controllers.get(message.id)?.abort();
          return;
        }
        if (message.type === "stdout") stdout += message.text;
        if (message.type === "stderr") stderr += message.text;
        if (message.type === "exit") {
          this.files.reset();
          for (const [path, text] of Object.entries(message.files))
            this.files.write(path, text);
          finish();
          resolve({ code: message.code, stdout, stderr, files: this.files.snapshot() });
        } else if (message.type === "error") {
          finish();
          worker.terminate();
          this.worker = undefined;
          reject(new Error(message.message));
        }
        this.emit(message);
      };
      worker.postMessage({
        type: "run",
        runId: id,
        line,
        terminal: this.options.terminal === true,
        ...(this.options.keylessNotice === undefined
          ? {}
          : { keylessNotice: this.options.keylessNotice }),
        files: this.files.snapshot(),
      } satisfies RunMessage);
    });
  }
}
