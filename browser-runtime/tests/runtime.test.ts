import { expect, it, vi } from "vitest";
import { BrowserRuntime } from "../src/runtime.js";
import type { WorkerMessage, RunMessage } from "../src/worker.js";
class TestWorker {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | undefined;
  onerror: (() => void) | undefined;
  sent: RunMessage[] = [];
  terminated = false;
  postMessage(message: RunMessage): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(message: WorkerMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerMessage>);
  }
}
it("cancels old runs, aborts host requests, suppresses stale events/files, and disposes", async () => {
  const workers: TestWorker[] = [];
  const events: unknown[] = [];
  let requestSignal: AbortSignal | undefined;
  const runtime = new BrowserRuntime({
    createWorker: () => {
      const worker = new TestWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
    onEvent: (event) => {
      events.push(event);
    },
    transport: (_request, signal) => {
      requestSignal = signal;
      return new Promise(() => {
        /* Simulate an uncooperative pending host. */
      });
    },
  });
  const first = runtime.run("storerouter search dress");
  const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
  workers[0]?.emit({
    type: "request",
    runId: "run-1",
    id: 1,
    request: {
      url: "https://api.storerouter.ai/v1/products/search",
      method: "POST",
      body: JSON.stringify({ q: "dress" }),
      headers: {},
    },
  });
  await Promise.resolve();
  const next = runtime.run("echo next");
  await rejected;
  expect(requestSignal?.aborted).toBe(true);
  expect(workers[0]?.terminated).toBe(true);
  const before = events.length;
  workers[0]?.emit({
    type: "exit",
    runId: "run-1",
    code: 0,
    files: { "/stale": "stale" },
  });
  workers[0]?.emit({ type: "stdout", runId: "run-1", text: "stale" });
  expect(events.length).toBe(before);
  workers[1]?.emit({ type: "stdout", runId: "run-2", text: "next\n" });
  workers[1]?.emit({
    type: "exit",
    runId: "run-2",
    code: 0,
    files: { "/session/saved": "ok" },
  });
  expect((await next).stdout).toBe("next\n");
  expect(runtime.listFiles()).toEqual({ "/session/saved": "ok" });
  runtime.reset();
  expect(runtime.listFiles()).toEqual({});
  runtime.dispose();
  expect(workers[1]?.terminated).toBe(true);
  await expect(runtime.run("echo nope")).rejects.toThrow("disposed");
});
it("hard deadline terminates a busy worker (including synchronous jq)", async () => {
  vi.useFakeTimers();
  const worker = new TestWorker();
  const runtime = new BrowserRuntime({
    createWorker: () => worker as unknown as Worker,
    timeoutMs: 10,
    transport: () => Promise.reject(new Error("unused")),
  });
  const pending = runtime.run("echo '{}' | jq 'repeat(.)'");
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(11);
  await rejected;
  expect(worker.terminated).toBe(true);
  runtime.dispose();
  vi.useRealTimers();
});
