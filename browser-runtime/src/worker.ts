/// <reference lib="webworker" />
import { loadJq } from "jq-wasm";
import { executeWasm, loadEngine } from "./engine.js";
import { executeShell } from "./shell.js";
import { VirtualFiles } from "./virtual-files.js";
import type {
  TransportResponse,
  TransportRequest,
  ExecutionEvent,
} from "./protocol.js";
import manifest from "../../cli/package.json";
import { SDK_VERSION } from "@octogen-ai/sdk";

declare const self: DedicatedWorkerGlobalScope;
export interface RunMessage {
  type: "run";
  runId: string;
  line: string;
  terminal?: boolean;
  keylessNotice?: string;
  files: Record<string, string>;
}
export interface ResponseMessage {
  type: "response";
  runId: string;
  id: number;
  response?: TransportResponse;
  error?: string;
}
export type WorkerMessage =
  | ExecutionEvent
  | { type: "request"; runId: string; id: number; request: TransportRequest }
  | { type: "abortRequest"; runId: string; id: number };
const engine = loadEngine();
let jq: ReturnType<typeof loadJq> | undefined;
let sequence = 0;
let active = false;
const pending = new Map<
  number,
  { resolve: (response: TransportResponse) => void; reject: (error: Error) => void }
>();
const send = (event: WorkerMessage): void => {
  self.postMessage(event);
};
self.onmessage = (event: MessageEvent<RunMessage | ResponseMessage>) => {
  const message = event.data;
  if (message.type === "response") {
    const deferred = pending.get(message.id);
    if (!deferred) return;
    pending.delete(message.id);
    if (message.response) deferred.resolve(message.response);
    else deferred.reject(new Error(message.error ?? "Transport failed"));
    return;
  }
  if (active) {
    send({ type: "error", runId: message.runId, message: "Worker is busy" });
    return;
  }
  active = true;
  const files = new VirtualFiles(message.files);
  const signal = new AbortController().signal;
  const { runId } = message;
  send({ type: "start", runId });
  void (async () => {
    try {
      const module = await engine;
      const result = await executeShell({
        line: message.line,
        terminal: message.terminal === true,
        files,
        signal,
        runId,
        emit: send,
        cli: (argv, stdin, emit, isTty) =>
          executeWasm({
            module,
            argv,
            stdin,
            isTty,
            files,
            signal,
            runId,
            keylessNotice:
              message.keylessNotice ??
              "Browser transport is host-injected. Anonymous production API access is not assumed.",
            version: {
              version: manifest.version,
              sdkVersion: SDK_VERSION,
              node: "quickjs-wasm",
            },
            emit,
            transport: (request, requestSignal) =>
              new Promise((resolve, reject) => {
                const id = ++sequence;
                pending.set(id, { resolve, reject });
                const abort = (): void => {
                  pending.delete(id);
                  send({ type: "abortRequest", runId, id });
                  reject(new Error("The operation was aborted"));
                };
                requestSignal.addEventListener("abort", abort, { once: true });
                // Remove listener on either settlement; the engine also aborts outstanding work at disposal.
                pending.set(id, {
                  resolve: (response) => {
                    requestSignal.removeEventListener("abort", abort);
                    resolve(response);
                  },
                  reject: (error) => {
                    requestSignal.removeEventListener("abort", abort);
                    reject(error);
                  },
                });
                send({ type: "request", runId, id, request });
              }),
          }),
        jq: async (input, filter, flags) => {
          jq ??= loadJq();
          return (await jq).raw(input, filter, flags);
        },
      });
      send({ type: "exit", runId, code: result.code, files: files.snapshot() });
    } catch (error) {
      send({
        type: "error",
        runId,
        message: error instanceof Error ? error.message : "Worker failed",
      });
    } finally {
      active = false;
    }
  })();
};
