import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 20000 },
  resolve: {
    alias: {
      "@octogen-ai/sdk": new URL("../sdks/typescript/src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
