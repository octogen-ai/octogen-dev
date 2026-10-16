import { defineConfig } from "vite";
const csp =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'";
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  preview: { headers: { "Content-Security-Policy": csp } },
  build: {
    target: "es2022",
    rolldownOptions: {
      input: { harness: "index.html", runtime: "src/runtime.ts" },
      output: { entryFileNames: "[name].js" },
    },
  },
});
