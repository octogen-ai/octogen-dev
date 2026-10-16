/** Installed Node entry point; shared dispatch is platform-independent. */
import { readFileSync } from "node:fs";
import { isatty } from "node:tty";
import { nodeHost, readKeyStdin } from "./node-host.js";
import { run as runCore, type RunOptions as CoreOptions } from "./run-core.js";
export type RunOptions = Omit<
  CoreOptions,
  "host" | "stdout" | "stderr" | "readKeyStdin"
> & {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};
export function run(options: RunOptions) {
  return runCore({
    ...options,
    host: nodeHost,
    readKeyStdin: options.readStdin ?? readKeyStdin,
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    isTty: options.isTty ?? isatty(1),
    readStdin: options.readStdin ?? (() => readFileSync(0, "utf8")),
    stdout:
      options.stdout ??
      ((text) => {
        process.stdout.write(text);
      }),
    stderr:
      options.stderr ??
      ((text) => {
        process.stderr.write(text);
      }),
  });
}
