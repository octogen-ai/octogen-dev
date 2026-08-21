/**
 * The command table, and the check that binds it to `OPERATIONS`.
 *
 * `ALL_COMMANDS` is `as const`, so each command's `operations` keeps its literal
 * type and {@link MappedOperation} below is derived from the real table rather
 * than from a second list somebody has to remember to update. That is the
 * difference between a check and a comment.
 */

import type { OperationId } from "@octogen-ai/sdk";

import { commandTable, EXCLUDED_OPERATIONS, type CommandSpec } from "../registry.js";
import { apiCommand } from "./api.js";
import { domainsCommand } from "./domains.js";
import { lookupCommand } from "./lookup.js";
import { refreshCommand } from "./refresh.js";
import { resolveCommand } from "./resolve.js";
import { searchCommand } from "./search.js";
import { similarCommand } from "./similar.js";
import { statusCommand } from "./status.js";
import { voyageCommand, voyageListCommand, voyageStatusCommand } from "./voyage.js";

/**
 * Every command, in the order `--help` lists them: onboarding and the
 * coverage-first loop first, then the rest of the published surface, then the
 * escape hatch.
 */
export const ALL_COMMANDS = [
  statusCommand,
  domainsCommand,
  lookupCommand,
  searchCommand,
  similarCommand,
  refreshCommand,
  resolveCommand,
  voyageCommand,
  voyageStatusCommand,
  voyageListCommand,
  apiCommand,
] as const;

/**
 * The same list, widened to `CommandSpec`.
 *
 * `ALL_COMMANDS` is `as const` so {@link MappedOperation} can be derived from
 * it, which means it is a union of literal object types — and a command with no
 * `flags` key makes `command.flags` inaccessible across that union. Anything
 * that walks the table for display or validation wants this one; only the
 * coverage check wants the literal types.
 */
export const COMMAND_LIST: readonly CommandSpec[] = ALL_COMMANDS;

export const COMMAND_TABLE: ReadonlyMap<string, CommandSpec> =
  commandTable(COMMAND_LIST);

/** Operations some command issues, derived from the table above. */
export type MappedOperation = (typeof ALL_COMMANDS)[number]["operations"][number];

type ExcludedOperation = keyof typeof EXCLUDED_OPERATIONS;

/** Published operations that are neither mapped nor explicitly excluded. */
export type UnaccountedOperation = Exclude<
  OperationId,
  MappedOperation | ExcludedOperation
>;

/**
 * `never` when every published operation is accounted for.
 *
 * **If this line stops compiling, an operation was published and nobody decided
 * what the CLI does about it.** The error names the operation. Write a command,
 * or add a line to `EXCLUDED_OPERATIONS` in `registry.ts` saying why not — the
 * one thing that is not an option is leaving it unmentioned, because that is
 * how a capability ships without a way to reach it.
 *
 * `tests/operation-coverage.test.ts` asserts the same thing at runtime, with a
 * readable list, so a failure is legible whether it surfaces in `tsc` or in the
 * suite.
 */
export const UNACCOUNTED_OPERATIONS: UnaccountedOperation[] = [];
