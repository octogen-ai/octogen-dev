/**
 * The anti-drift test: every published operation is either mapped to a command
 * or explicitly excluded with a stated reason.
 *
 * This is what makes the CLI unable to drift from the SDK, which cannot drift
 * from the API (the repo's contract-conformance test, no allowlist, holds that
 * end). The chain:
 *
 * 1. a new operation is published → `tests/contract` goes red until the SDK
 *    gains a method;
 * 2. `OPERATIONS` grows → **this** goes red until someone writes a command or
 *    records why not.
 *
 * `commands/index.ts` asserts the same thing at compile time. Both exist on
 *  purpose: the type-level check fails earlier, and this one fails *legibly* —
 *  with the operation's name, its verb and path, and the list of what is
 *  already excluded.
 */

import { OPERATIONS, type OperationId } from "@octogen-ai/sdk";
import { describe, expect, it } from "vitest";

import { ALL_COMMANDS, COMMAND_LIST } from "../src/commands/index.js";
import { EXCLUDED_OPERATIONS, mappedOperations } from "../src/registry.js";

const published = Object.keys(OPERATIONS) as OperationId[];
const mapped = mappedOperations(COMMAND_LIST);
const excluded = new Set(Object.keys(EXCLUDED_OPERATIONS));

function describeOperation(operationId: OperationId): string {
  const operation = OPERATIONS[operationId];
  return `${operationId} (${operation.method} ${operation.path})`;
}

describe("command coverage of the published operation set", () => {
  it("accounts for every operation the SDK can reach", () => {
    const unaccounted = published
      .filter((operationId) => !mapped.has(operationId) && !excluded.has(operationId))
      .map(describeOperation);

    expect(
      unaccounted,
      "These operations are published and the CLI neither exposes nor excludes " +
        "them. Add a command, or add a line to EXCLUDED_OPERATIONS in " +
        `src/registry.ts saying why not:\n  ${unaccounted.join("\n  ")}`,
    ).toEqual([]);
  });

  it("never both maps and excludes the same operation", () => {
    const both = published
      .filter((operationId) => mapped.has(operationId) && excluded.has(operationId))
      .map(describeOperation);
    expect(both, `mapped and excluded at once:\n  ${both.join("\n  ")}`).toEqual([]);
  });

  it("gives every exclusion a real reason", () => {
    for (const [operationId, reason] of Object.entries(EXCLUDED_OPERATIONS)) {
      // Long enough to be an explanation rather than a shrug. The point of the
      // list is that a reader can tell whether the decision still holds.
      expect(
        reason.length,
        `${operationId}'s exclusion reason is too short`,
      ).toBeGreaterThan(40);
      expect(
        reason,
        `${operationId}'s reason should say where the surface lives`,
      ).toMatch(/octogen-url-lists|octogen api/);
    }
  });

  it("excludes exactly the eight coverage/url-lists operations", () => {
    // Named rather than counted, so widening the exclusion list is a visible
    // change to this test rather than a number going up.
    expect([...excluded].sort()).toEqual([
      "addUrlListUrls",
      "checkUrlListUrls",
      "createUrlList",
      "deleteUrlList",
      "getUrlList",
      "listUrlListUrls",
      "listUrlLists",
      "removeUrlListUrls",
    ]);
    for (const operationId of excluded) {
      expect(
        OPERATIONS[operationId as OperationId].path,
        `${operationId} is excluded as a url-lists operation but is not one`,
      ).toMatch(/^\/coverage\/url-lists/);
    }
  });

  it("maps every operation a command claims to a real published operation", () => {
    for (const operationId of mapped) {
      expect(published, `${operationId} is not a published operation`).toContain(
        operationId,
      );
    }
  });

  it("has no command claiming an operation another command already owns for a different purpose", () => {
    // `getVoyage` is deliberately shared: `voyage --wait` polls it and `voyage
    // status` is it. Everything else should be claimed once, so an accidental
    // duplicate command shows up here.
    const counts = new Map<OperationId, number>();
    for (const command of ALL_COMMANDS) {
      for (const operationId of command.operations) {
        counts.set(operationId, (counts.get(operationId) ?? 0) + 1);
      }
    }
    const shared = [...counts]
      .filter(([, count]) => count > 1)
      .map(([operationId]) => operationId)
      .sort();
    expect(shared).toEqual(["getVoyage", "listVoyages"]);
  });
});

describe("the escape hatch", () => {
  it("claims no operation, which is what makes it an escape hatch", () => {
    const api = COMMAND_LIST.find((command) => command.name === "api");
    expect(api?.operations).toEqual([]);
  });

  it("is documented as unstable, so nobody reads it as a contract", () => {
    const api = COMMAND_LIST.find((command) => command.name === "api");
    expect(api?.notes?.join(" ")).toMatch(/UNSTABLE BY CONSTRUCTION/);
  });

  it("is named in the exclusion reasons as the way to reach them", () => {
    for (const reason of Object.values(EXCLUDED_OPERATIONS)) {
      expect(reason).toMatch(/octogen api/);
    }
  });
});
