/** Fast, offline build/test gate; full regeneration remains codegen:check's job. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PUBLIC_CONTRACT } from "../src/generated/contract.js";
const snapshot = readFileSync(
  new URL("../../tests/fixtures/openapi/platform-v1.json", import.meta.url),
);
if (createHash("sha256").update(snapshot).digest("hex") !== PUBLIC_CONTRACT.sha256) {
  throw new Error(
    "CLI public contract is stale. Run npm run codegen (use the canonical snapshot formatting).",
  );
}
await import("./reference.js");
