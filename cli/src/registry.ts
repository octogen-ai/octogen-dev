/**
 * The shape of a command, and the record of which published operations have no
 * command.
 *
 * This is half of what makes CLI/SDK/API drift impossible rather than
 * discouraged; the other half is `commands/index.ts`, which assembles the table
 * and runs the exhaustiveness check against `OPERATIONS`.
 *
 * The CLI is deliberately **not** generated from the OpenAPI document. The spec
 * cannot express which command an operation belongs to, that `resolve` must
 * read HTML from a file rather than argv, that `domains --check` has to
 * normalize hosts on both sides before comparing, or that eight mutating
 * operations already belong to a different CLI in another language. A naive
 * generator would emit eighteen commands and reproduce every one of those bugs,
 * including the coverage false negative that actually shipped.
 *
 * What is enforced instead: every operation in `OPERATIONS` is **either mapped
 * to a command or listed in {@link EXCLUDED_OPERATIONS} with a stated reason**.
 * The failure chain is the design —
 *
 * 1. an operation is published → the repo's contract-conformance test (P2, no
 *    allowlist) goes red until the SDK gains a method;
 * 2. the SDK method lands → `OPERATIONS` grows → the check in
 *    `commands/index.ts` goes red until someone writes a command or records, in
 *    one line, why there is not one.
 *
 * Nobody has to remember, and a red build names the owner.
 */

import type { OperationId } from "@octogen-ai/sdk";

import type { FlagSpecs } from "./args.js";
import type { ExitCode } from "./exit.js";
import type { CommandContext } from "./context.js";

export interface CommandSpec {
  /** How the command is invoked, e.g. `"voyage status"`. */
  name: string;
  summary: string;
  /** The usage line, without the leading `octogen`. */
  usage: string;
  /**
   * Published operations this command issues, as a literal tuple.
   *
   * Declare commands with `satisfies CommandSpec` and `operations: [...] as
   * const` so these stay literal types: the compile-time coverage check in
   * `commands/index.ts` reads this union, and a widened `OperationId[]` would
   * silently satisfy it.
   */
  operations: readonly OperationId[];
  /** Command-specific flags. Global flags are added automatically. */
  flags?: FlagSpecs;
  /** Extra `--help` prose, for the things a flag list cannot say. */
  notes?: readonly string[];
  run: (context: CommandContext) => Promise<ExitCode>;
}

/**
 * `octogen-ai-sdk` already ships `octogen-url-lists`: a tested Python CLI whose
 * mutations are dry-run-by-default behind `--apply`, matching its sibling
 * `octogen-bq-*` tools. A second, differently-shaped CLI for the same
 * *mutating* surface would be worse than no CLI — two conventions for "am I
 * about to change something?" is how a coverage list gets emptied by accident.
 * All eight stay reachable through `octogen api`, with the same key resolution,
 * retry, error taxonomy, and redaction as everything else. Revisit when the two
 * exit-code tables are unified (design Open Decisions 4 and 5).
 */
const URL_LISTS: string =
  "Owned by `octogen-url-lists` in octogen-ai-sdk (Python), whose mutations are " +
  "dry-run-by-default behind `--apply`. Reachable here via `octogen api`.";

/**
 * Published operations with no command, and why.
 *
 * A reason is required, and it has to be a real one: this is the record of a
 * decision, not a suppression file. Typing it as
 * `Partial<Record<OperationId, string>>` means an entry naming an operation the
 * contract does not publish is a *type error*, so the list cannot rot into
 * exclusions for things that no longer exist.
 *
 * `search-grouped` is absent even though it is live, because it is not
 * published and so is not in `OPERATIONS` either. If it is ever published, the
 * check in `commands/index.ts` goes red — which is exactly the conversation to
 * have before an internal evaluation surface gets a public command.
 */
export const EXCLUDED_OPERATIONS = {
  addUrlListUrls: URL_LISTS,
  checkUrlListUrls: URL_LISTS,
  createUrlList: URL_LISTS,
  deleteUrlList: URL_LISTS,
  getUrlList: URL_LISTS,
  listUrlListUrls: URL_LISTS,
  listUrlLists: URL_LISTS,
  removeUrlListUrls: URL_LISTS,
} as const satisfies Partial<Record<OperationId, string>>;

export type ExcludedOperation = keyof typeof EXCLUDED_OPERATIONS;

/** Build the lookup table, rejecting a duplicate name rather than shadowing. */
export function commandTable(
  commands: readonly CommandSpec[],
): ReadonlyMap<string, CommandSpec> {
  const table = new Map<string, CommandSpec>();
  for (const command of commands) {
    if (table.has(command.name)) {
      throw new Error(`Duplicate command: ${command.name}`);
    }
    table.set(command.name, command);
  }
  return table;
}

/** Operations reachable through a command. */
export function mappedOperations(
  commands: readonly CommandSpec[],
): ReadonlySet<OperationId> {
  const mapped = new Set<OperationId>();
  for (const command of commands) {
    for (const operation of command.operations) {
      mapped.add(operation);
    }
  }
  return mapped;
}
