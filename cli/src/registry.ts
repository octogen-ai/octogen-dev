/**
 * Intentional command presentation, custom workflows and public operation exclusions.
 * Runtime request schemas come from the public contract; commands/index.ts checks
 * exact coverage against both that projection and the existing SDK registry.
 */

import type { OperationId } from "@octogen-ai/sdk";

import type { FlagSpecs } from "./args.js";
import type { ExitCode } from "./exit.js";
import type { CommandContext } from "./context.js";

export interface CommandSpec {
  /** How the command is invoked, e.g. `"status"`. */
  name: string;
  summary: string;
  /** The usage line, without the leading `storerouter`. */
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
 * All eight stay reachable through `storerouter api`, with the same key resolution,
 * retry, error taxonomy, and redaction as everything else. Revisit when the two
 * exit-code tables are unified (design Open Decisions 4 and 5).
 */
const URL_LISTS: string =
  "Owned by `octogen-url-lists` in octogen-ai-sdk (Python), whose mutations are " +
  "dry-run-by-default behind `--apply`. Reachable here via `storerouter api`.";

/**
 * Taxonomy discovery and facet counts serve filter panels and agent tools that
 * call the SDKs; no command needs them yet. A command is a CLI design decision
 * (flags for nested category facets, paging output), not a coverage chore.
 */
const CATALOG_DISCOVERY: string =
  "Taxonomy discovery and facet counts are SDK surfaces for filter UIs and " +
  "agent tools; no dedicated command yet. Reachable here via `storerouter api`.";

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
  countProductFacets: CATALOG_DISCOVERY,
  createUrlList: URL_LISTS,
  deleteUrlList: URL_LISTS,
  getUrlList: URL_LISTS,
  listTaxonomyAttributeValues: CATALOG_DISCOVERY,
  listTaxonomyAttributes: CATALOG_DISCOVERY,
  listTaxonomyCategories: CATALOG_DISCOVERY,
  listUrlListUrls: URL_LISTS,
  listUrlLists: URL_LISTS,
  parseProductAlias:
    "Exact alias of lookupProduct, already exposed by `storerouter lookup` and its `parse` command alias. Use `storerouter api POST /products/parse` for the alias path.",
  removeUrlListUrls: URL_LISTS,
} as const satisfies Partial<Record<OperationId, string>>;

export type ExcludedOperation = keyof typeof EXCLUDED_OPERATIONS;

/**
 * Operations more than one command issues, and why.
 *
 * Each operation normally has one owning command. A second command may issue
 * it when it answers a different question from the same response, never as a
 * second spelling of the first. As with exclusions, the reason is the record.
 */
export const SHARED_OPERATIONS = {
  getStore:
    "`stores categories` ranks the category fields of the snapshot `stores show` prints, so it needs no second request.",
  searchProducts:
    "`stores products` is `search` scoped by store domain (`stores`) rather than catalog key, with an optional query.",
} as const satisfies Partial<Record<OperationId, string>>;

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
