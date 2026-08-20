/**
 * Contract conformance: the SDK's routing table versus the published contract.
 *
 * Failing in either direction is a hard failure, with **no allowlist**:
 *
 * * a published `operationId` with no SDK method is an operation callers cannot
 *   reach through the SDK, and
 * * an SDK method calling a path the contract does not define is a guaranteed
 *   404 at runtime.
 *
 * Brands were deferred from CLI v1 on 2026-08-20, so there is no unpublished
 * surface left for an SDK method to legitimately call. This test is what makes
 * `POST /products/recrawl` — shipped in both SDKs, never a real route —
 * impossible to reintroduce.
 *
 * The three assertions together pin the routing table to *exactly* the
 * published operation set. `tests/contract/test_operation_coverage.py` pins the
 * Python table the same way, so the two SDKs are held to each other
 * transitively without either test reading the other language's source.
 */
import { describe, expect, it } from "vitest";

import { OPERATIONS } from "../../sdks/typescript/src/operations.js";
import { publishedOperations, readSnapshot } from "./contract.js";

const published = publishedOperations(readSnapshot());
const declared: { operationId: string; method: string; path: string }[] =
  Object.entries(OPERATIONS).map(([operationId, operation]) => ({
    operationId,
    method: operation.method,
    path: operation.path,
  }));

function signature(operation: {
  operationId: string;
  method: string;
  path: string;
}): string {
  return `${operation.operationId} (${operation.method} ${operation.path})`;
}

describe("published contract snapshot", () => {
  it("is the document both SDKs are generated and tested against", () => {
    const document = readSnapshot();
    expect(document.info?.version).toBeTypeOf("string");
    expect(published.length).toBeGreaterThan(0);
  });

  it("gives every operation a unique operationId", () => {
    const ids = published.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("SDK operation coverage", () => {
  it("has a method for every published operation", () => {
    const declaredIds = new Set(declared.map((operation) => operation.operationId));
    const missing = published
      .filter((operation) => !declaredIds.has(operation.operationId))
      .map(signature);

    expect(
      missing,
      `published operations with no SDK method:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("calls no path the contract does not define", () => {
    const publishedIds = new Set(published.map((operation) => operation.operationId));
    const unknown = declared
      .filter((operation) => !publishedIds.has(operation.operationId))
      .map(signature);

    expect(
      unknown,
      `SDK methods naming an operation the contract does not publish:\n  ${unknown.join("\n  ")}`,
    ).toEqual([]);
  });

  it("agrees with the contract on every verb and path", () => {
    const publishedById = new Map(
      published.map((operation) => [operation.operationId, operation]),
    );
    const mismatched = declared
      .filter((operation) => {
        const expected = publishedById.get(operation.operationId);
        return (
          expected !== undefined &&
          (expected.method !== operation.method || expected.path !== operation.path)
        );
      })
      .map((operation) => {
        const expected = publishedById.get(operation.operationId);
        return `${operation.operationId}: SDK calls ${operation.method} ${
          operation.path
        }, contract publishes ${expected?.method ?? "?"} ${expected?.path ?? "?"}`;
      });

    expect(mismatched, mismatched.join("\n  ")).toEqual([]);
  });
});
