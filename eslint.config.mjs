// Root ESLint config for the whole repository.
//
// Packages do not carry their own ESLint config: `npm run lint` at the root
// lints every workspace against this one file, so a rule change cannot apply to
// one package and miss another. When a new TypeScript workspace is added, add
// its tsconfig to `projects` below.
import js from "@eslint/js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Every tsconfig that provides type information for linting. `examples/typescript`
 * has no tsconfig of its own — it is included by the TypeScript SDK's.
 */
const projects = [
  "./sdks/typescript/tsconfig.json",
  "./tests/contract/typescript/tsconfig.json",
  "./tsconfig.tools.json",
];

export default tseslint.config(
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "**/eslint.config.*",
      "**/node_modules/**",
      "**/src/generated/**",
      "sdks/python/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: projects,
        tsconfigRootDir,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
    },
  },
  // Maintainer scripts: plain Node ESM, in no package's tsconfig, so the
  // type-aware rules have no type information to work from. Still linted for
  // the rules that do not need it.
  {
    files: ["scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
);
