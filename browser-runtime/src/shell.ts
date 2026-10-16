import type { ExecutionEvent, ExecutionResult } from "./protocol.js";
import { VirtualFiles } from "./virtual-files.js";

interface Token {
  kind: "word" | "operator";
  value: string;
}
/** Bounded shell grammar. Quoting is lexical; no eval, expansion or host shell. */
export function tokenize(line: string): Token[] {
  if (line.length > 65536) throw new Error("Command exceeds 64 KiB");
  const tokens: Token[] = [];
  let word = "";
  let started = false;
  let quote = "";
  const flush = (): void => {
    if (started) tokens.push({ kind: "word", value: word });
    word = "";
    started = false;
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (quote === "'") {
      if (ch === "'") quote = "";
      else word += ch;
      continue;
    }
    if (ch === "\\") {
      const next = line[++i];
      if (next === undefined) throw new Error("Trailing escape");
      word += next;
      started = true;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = "";
      else {
        if (ch === "$" || ch === "`") throw new Error("Shell expansion is unsupported");
        word += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) flush();
    else if ("|<>".includes(ch)) {
      flush();
      let value = ch;
      if (ch === ">" && line[i + 1] === ">") {
        value = ">>";
        i++;
      }
      tokens.push({ kind: "operator", value });
    } else if (";&`$()".includes(ch))
      throw new Error(`Unsupported shell syntax: ${ch}`);
    else {
      word += ch;
      started = true;
    }
  }
  if (quote) throw new Error("Unclosed quote");
  flush();
  return tokens;
}
interface Stage {
  argv: string[];
  input?: string;
  output?: string;
  append: boolean;
}
function parse(line: string): Stage[] {
  const stages: Stage[] = [{ argv: [], append: false }];
  const tokens = tokenize(line);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const stage = stages.at(-1);
    if (!token || !stage) throw new Error("Invalid shell state");
    if (token.kind === "word") stage.argv.push(token.value);
    else if (token.value === "|") {
      if (!stage.argv.length || stage.output) throw new Error("Invalid pipe");
      stages.push({ argv: [], append: false });
    } else {
      const path = tokens[++i];
      if (path?.kind !== "word") throw new Error("Redirection needs a path");
      if (token.value === "<") {
        if (stage.input || stages.length > 1)
          throw new Error("Duplicate/pipe input redirection");
        stage.input = path.value;
      } else {
        if (stage.output) throw new Error("Duplicate output redirection");
        stage.output = path.value;
        stage.append = token.value === ">>";
      }
    }
  }
  if (stages.some((stage) => !stage.argv.length))
    throw new Error("Empty shell command");
  if (stages.length > 8) throw new Error("At most eight pipeline stages");
  for (const stage of stages)
    if (!["storerouter", "octogen", "jq", "cat", "echo"].includes(stage.argv[0] ?? ""))
      throw new Error(`Unknown executable: ${stage.argv[0] ?? ""}`);
  return stages;
}
export interface ShellOptions {
  line: string;
  files: VirtualFiles;
  signal: AbortSignal;
  runId: string;
  emit: (event: ExecutionEvent) => void;
  cli: (
    argv: string[],
    stdin: string,
    emit: (event: ExecutionEvent) => void,
  ) => Promise<ExecutionResult>;
  jq: (
    input: string,
    filter: string,
    flags: string[],
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}
export async function executeShell(options: ShellOptions): Promise<ExecutionResult> {
  const stages = parse(options.line);
  let input = "";
  let stderr = "";
  let code = 0;
  for (const stage of stages) {
    options.signal.throwIfAborted();
    if (stage.input)
      input = options.files.read(
        stage.input.startsWith("/") ? stage.input : `/session/${stage.input}`,
      );
    const [name, ...args] = stage.argv;
    let result: { stdout: string; stderr: string; code: number };
    if (name === "storerouter" || name === "octogen") {
      result = await options.cli(args, input, (event) => {
        if (event.type === "result" || event.type === "stderr") options.emit(event);
      });
    } else if (name === "jq") {
      const filter = args.at(-1);
      const flags = args.slice(0, -1);
      if (
        filter === undefined ||
        flags.some((flag) => !["-c", "-r", "-e", "-s", "-S"].includes(flag))
      )
        throw new Error(
          "jq expects [-c|-r|-e|-s|-S]… '<filter>'; use < file for input",
        );
      const jq = await options.jq(input, filter, flags);
      result = { stdout: jq.stdout, stderr: jq.stderr, code: jq.exitCode };
    } else if (name === "cat") {
      result = {
        stdout: args.length
          ? args
              .map((path) =>
                options.files.read(path.startsWith("/") ? path : `/session/${path}`),
              )
              .join("")
          : input,
        stderr: "",
        code: 0,
      };
    } else {
      result = { stdout: `${args.join(" ")}\n`, stderr: "", code: 0 };
    }
    options.signal.throwIfAborted();
    if (result.stdout.length > VirtualFiles.maxBytes)
      throw new Error("Pipeline output exceeds 8 MiB");
    stderr += result.stderr;
    if (result.stderr && name !== "storerouter" && name !== "octogen")
      options.emit({ type: "stderr", runId: options.runId, text: result.stderr });
    code = result.code;
    input = result.stdout;
    if (stage.output) {
      const path = stage.output.startsWith("/")
        ? stage.output
        : `/session/${stage.output}`;
      options.files.write(
        path,
        (stage.append && options.files.exists(path) ? options.files.read(path) : "") +
          input,
      );
      input = "";
    }
    if (code !== 0) break; // Fail-fast: preserve CLI failure envelopes, don't feed them to jq.
  }
  const stdout = input;
  if (stdout) options.emit({ type: "stdout", runId: options.runId, text: stdout });
  return { stdout, stderr, code, files: options.files.snapshot() };
}
