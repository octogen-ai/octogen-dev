import { defineConfig } from "vitest/config";

/**
 * Root test project: the hermetic cross-language contract tests.
 *
 * Each package's own suite runs from its own workspace (`npm run test` fans out
 * over the workspaces, then runs this). The contract tests live at the root
 * because they belong to no single package — they hold both SDKs to one
 * published document.
 *
 * `published-contract.test.ts` is excluded on purpose: it needs the network and
 * runs from `npm run test:published-contract` in its own CI job, so a red
 * build says whether the SDK drifted from the contract or the contract moved.
 */
export default defineConfig({
  test: {
    include: ["tests/contract/**/*.test.ts"],
    exclude: ["tests/contract/published-contract.test.ts"],
  },
});
