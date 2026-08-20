import { defineConfig } from "vitest/config";

/**
 * This package's own suite. Explicit because there is now a root
 * `vitest.config.ts` for the cross-language contract tests, and Vitest would
 * otherwise walk up and find that one instead.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
