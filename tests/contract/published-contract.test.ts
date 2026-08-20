/**
 * The committed snapshot versus the contract `cdn.octogen.ai` is serving right
 * now.
 *
 * This is the drift alarm, and it is deliberately a separate file from
 * `operation-coverage.test.ts`: that one is hermetic and gates every job, this
 * one needs the network and runs in its own CI job, so a red build says which
 * of the two things went wrong. A newly published operation turns this red
 * until someone adds the SDK method and re-runs `npm run codegen -- --fetch`,
 * which is the point — CI owns drift.
 *
 * Skipped, not failed, when the contract is unreachable: a CDN blip is not an
 * SDK defect. Set `OCTOGEN_REQUIRE_PUBLISHED_CONTRACT=1` to make unreachable a
 * failure instead.
 */
import { describe, expect, it } from "vitest";

import {
  CONTRACT_URL,
  fetchPublishedContract,
  publishedOperations,
  readSnapshot,
  type OpenApiDocument,
} from "./contract.js";

const REQUIRED = process.env["OCTOGEN_REQUIRE_PUBLISHED_CONTRACT"] === "1";

let live: OpenApiDocument | undefined;
let fetchError: unknown;

try {
  live = await fetchPublishedContract();
} catch (error) {
  fetchError = error;
}

describe.skipIf(live === undefined && !REQUIRED)("published contract", () => {
  it("was reachable", () => {
    expect(fetchError, `could not fetch ${CONTRACT_URL}`).toBeUndefined();
  });

  it("matches the committed snapshot, operation for operation", () => {
    const snapshot = publishedOperations(readSnapshot()).map(
      (operation) => `${operation.operationId} ${operation.method} ${operation.path}`,
    );
    const published = publishedOperations(live ?? {}).map(
      (operation) => `${operation.operationId} ${operation.method} ${operation.path}`,
    );

    expect(
      published,
      "the published contract has moved. Run `npm run codegen -- --fetch`, add " +
        "or update the SDK methods for any new operation, and commit the result.",
    ).toEqual(snapshot);
  });

  it("matches the committed snapshot's info.version", () => {
    expect(live?.info?.version).toBe(readSnapshot().info?.version);
  });
});
