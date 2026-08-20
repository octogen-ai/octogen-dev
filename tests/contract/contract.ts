/**
 * The published `/v1` contract, flattened to `operationId → {method, path}`.
 *
 * Both language runners flatten the same committed snapshot the same way —
 * `tests/fixtures/openapi/platform-v1.json`, refreshed by `npm run codegen
 * --fetch` — so a TypeScript failure and a Python failure mean the same thing.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const SNAPSHOT_PATH = resolve(
  HERE,
  "..",
  "fixtures",
  "openapi",
  "platform-v1.json",
);

export const CONTRACT_URL = "https://cdn.octogen.ai/openapi/platform/v1/openapi.json";

/** HTTP methods an OpenAPI path item may carry. */
const HTTP_METHODS = [
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
] as const;

export interface PublishedOperation {
  operationId: string;
  method: string;
  path: string;
}

export interface OpenApiDocument {
  info?: { version?: string };
  paths?: Record<string, Record<string, { operationId?: string } | undefined>>;
}

export function readSnapshot(): OpenApiDocument {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as OpenApiDocument;
}

/** Fetch the live contract. Callers decide what a network failure means. */
export async function fetchPublishedContract(): Promise<OpenApiDocument> {
  const response = await fetch(CONTRACT_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${CONTRACT_URL} returned ${String(response.status)}`);
  }
  return (await response.json()) as OpenApiDocument;
}

export function publishedOperations(document: OpenApiDocument): PublishedOperation[] {
  const operations: PublishedOperation[] = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation?.operationId === undefined) {
        continue;
      }
      operations.push({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path,
      });
    }
  }
  return operations.sort((a, b) => a.operationId.localeCompare(b.operationId));
}
