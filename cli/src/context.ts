/**
 * What a command is handed: parsed arguments, a writer, and a lazily built API
 * context.
 *
 * The API context is lazy so a command can fail on its own arguments before a
 * key is resolved — `octogen lookup` with no URL should be exit `2` on any
 * machine, including one with no credential, and resolving the key first would
 * make it exit `3` instead.
 */

import type { Args } from "./args.js";
import type { ApiContext } from "./client.js";
import type { Writer } from "./output.js";

export interface CommandContext {
  /** The command as invoked, e.g. `"voyage status"`. */
  command: string;
  args: Args;
  writer: Writer;
  /** The remaining positionals, with the command's own words removed. */
  positionals: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  /**
   * Read all of stdin, once.
   *
   * On the context rather than imported so `--html -` and `--data -` are
   * exercised by the suite: a command that reads fd 0 directly is a command no
   * in-process test can drive.
   */
  readStdin: () => string;
  /** Build (once) the API context: resolves the key, then the client. */
  api: () => ApiContext;
  /** Print this command's help to stderr and return exit `0`. */
  help: () => void;
}
