/** Node cache adapter; format, SHA scope, permissions and location stay compatible. */
import { nodeHost } from "./node-host.js";
import {
  cachePath as corePath,
  readCache as coreRead,
  writeCache as coreWrite,
} from "./coverage-core.js";
export * from "./coverage-core.js";
export function cachePath(options: Omit<Parameters<typeof corePath>[0], "host">) {
  return corePath({ ...options, env: options.env ?? process.env, host: nodeHost });
}
export function readCache(path: string) {
  return coreRead(path, nodeHost);
}
export function writeCache(
  ...args: Parameters<typeof coreWrite> extends [...infer A, unknown] ? A : never
) {
  coreWrite(...args, nodeHost);
}
