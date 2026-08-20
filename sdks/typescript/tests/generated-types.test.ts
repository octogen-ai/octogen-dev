/**
 * Hand-written response types must agree with the contract.
 *
 * `src/generated/types.ts` is emitted from the published OpenAPI document, so
 * it *is* the contract expressed as TypeScript. The hand-written models in
 * `src/models.ts` exist for ergonomics, not to disagree — but nothing was
 * comparing the two, and `MerchantProductUrlLookupResponse["source"]` sat at
 * `"indexed" | "on_demand"` while the contract had carried a third member,
 * `"client_html"`, since `POST /products/resolve-from-html` shipped.
 *
 * The conformance suite in `tests/contract` checks that each SDK method calls
 * the right method and path. It says nothing about response shapes. This file
 * covers that second axis for the fields where being wrong is expensive: the
 * discriminated ones, where a caller writes a `switch` and a missing member is
 * a branch that silently never runs.
 *
 * These are compile-time assertions. `npm run typecheck` is what enforces them;
 * the runtime test below exists so the intent is visible in test output.
 */
import { describe, expect, it } from "vitest";

import type { components } from "../src/generated/types.js";
import type {
  MerchantProductUrlLookupResponse,
  ProductRefreshResponse,
  ProductResolutionMetadata,
  VoyageTask,
} from "../src/models.js";

type Contract = components["schemas"];

/**
 * `true` only when `A` and `B` are mutually assignable, `false` otherwise.
 *
 * `false` rather than `never` deliberately: `never` is assignable to every
 * type, so a `never` failure value would satisfy `assertExact`'s constraint and
 * the assertion would pass no matter what. `false` is not assignable to `true`.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Compiles only when `Sdk` and `Contract` permit exactly the same values. On a
 * mismatch `Exact` resolves to `false` and the `true` argument stops being
 * assignable, so the failure is an ordinary type error naming this call site.
 */
function assertExact<Sdk, ContractType>(matches: Exact<Sdk, ContractType>): void {
  // The assertion is in the parameter type. Nothing to do at runtime.
  void matches;
}

// Non-null because the hand-written models make some fields optional for
// ergonomics; only the set of permitted values is under test here.
type Values<T> = NonNullable<T>;

assertExact<
  Values<MerchantProductUrlLookupResponse["source"]>,
  Values<Contract["MerchantProductUrlLookupResponse"]["source"]>
>(true);

assertExact<
  Values<MerchantProductUrlLookupResponse["cacheStatus"]>,
  Values<Contract["MerchantProductUrlLookupResponse"]["cacheStatus"]>
>(true);

assertExact<
  Values<ProductResolutionMetadata["method"]>,
  Values<Contract["ProductResolutionMetadata"]["method"]>
>(true);

assertExact<
  Values<ProductRefreshResponse["workflowStatus"]>,
  Values<Contract["ProgrammaticProductRefreshResponse"]["workflowStatus"]>
>(true);

assertExact<Values<VoyageTask["status"]>, Values<Contract["VoyageTask"]["status"]>>(
  true,
);

assertExact<Values<VoyageTask["phase"]>, Values<Contract["VoyageTask"]["phase"]>>(true);

describe("hand-written response types match the generated contract types", () => {
  it("is enforced by `npm run typecheck`, not at runtime", () => {
    // Reaching this line means the assertions above compiled.
    expect(true).toBe(true);
  });
});
