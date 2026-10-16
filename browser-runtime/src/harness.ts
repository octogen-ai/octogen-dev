import { BrowserRuntime } from "./runtime.js";
import { fixtureTransport } from "./fixtures.js";
import "./style.css";
// The type parameter describes the known HTML element at each authored id.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing ${id}`);
  return value as T;
}
const command = element<HTMLInputElement>("command");
const output = element<HTMLTextAreaElement>("output");
const status = element("status");
const path = element<HTMLInputElement>("path");
const file = element<HTMLTextAreaElement>("file");
let currentRun = "";
let generation = 0;
const history: string[] = [];
let historyIndex = 0;
const runtime = new BrowserRuntime({
  transport: fixtureTransport,
  onEvent(event) {
    if (event.type === "start") {
      currentRun = event.runId;
      status.textContent = `Running ${event.runId}…`;
    }
    if (event.runId !== currentRun) return;
    if (event.type === "stdout" || event.type === "stderr") output.value += event.text;
  },
});
const showFiles = (): void => {
  element("files").textContent =
    Object.keys(runtime.listFiles()).join("\n") || "No virtual files";
};
element("command-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const run = ++generation;
  output.value = "";
  history.push(command.value);
  historyIndex = history.length;
  const started = performance.now();
  void runtime.run(command.value).then(
    (result) => {
      if (run !== generation) return;
      status.textContent = `Exit ${String(result.code)} · ${String(Math.round(performance.now() - started))} ms`;
      showFiles();
    },
    (error: unknown) => {
      if (run === generation)
        status.textContent =
          error instanceof Error ? error.message : "Execution failed";
    },
  );
});
command.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  historyIndex = Math.max(
    0,
    Math.min(history.length, historyIndex + (event.key === "ArrowUp" ? -1 : 1)),
  );
  command.value = history[historyIndex] ?? "";
});
element("cancel").onclick = () => {
  generation++;
  runtime.cancel();
  status.textContent = "Cancelled";
};
element("reset").onclick = () => {
  generation++;
  runtime.reset();
  output.value = "";
  history.length = 0;
  historyIndex = 0;
  status.textContent = "Session reset";
  showFiles();
};
element("save").onclick = () => {
  try {
    runtime.writeFile(path.value, file.value);
    showFiles();
    status.textContent = "File saved";
  } catch (error) {
    status.textContent = String(error);
  }
};
element("load").onclick = () => {
  try {
    file.value = runtime.readFile(path.value);
    status.textContent = "File read";
  } catch (error) {
    status.textContent = String(error);
  }
};
window.addEventListener("pagehide", () => {
  runtime.dispose();
});
showFiles();
