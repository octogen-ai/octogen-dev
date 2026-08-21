import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The CLI's own suite. `@octogen-ai/sdk` resolves to the workspace source, the
 * same mapping `tsconfig.json` gives the typechecker, so the suite runs on a
 * clean checkout with no build step and an SDK change is visible here
 * immediately.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@octogen-ai/sdk": fileURLToPath(
        new URL("../sdks/typescript/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
