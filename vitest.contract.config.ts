import { defineConfig } from "vitest/config";

/**
 * The cross-language contract suite. Separate from each package's own Vitest
 * run because it tests the *published* SDK entry point, not `src/`, so it
 * depends on a build.
 */
export default defineConfig({
  test: {
    include: ["tests/contract/typescript/**/*.test.ts"],
  },
});
