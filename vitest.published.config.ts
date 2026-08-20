import { defineConfig } from "vitest/config";

/** Network-dependent drift alarm; see `tests/contract/published-contract.test.ts`. */
export default defineConfig({
  test: {
    include: ["tests/contract/published-contract.test.ts"],
  },
});
