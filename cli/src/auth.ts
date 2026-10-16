/** Node credential adapter. The precedence algorithm lives in auth-core. */
import { nodeHost, readKeyStdin } from "./node-host.js";
import {
  resolveKey as coreResolveKey,
  dotenvCandidates as coreCandidates,
  type ResolveKeyOptions as CoreOptions,
} from "./auth-core.js";
export * from "./auth-core.js";
export type ResolveKeyOptions = Omit<CoreOptions, "host">;
export function resolveKey(options: ResolveKeyOptions = {}) {
  return coreResolveKey({
    ...options,
    host: nodeHost,
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd(),
    readStdin: options.readStdin ?? readKeyStdin,
  });
}
export function dotenvCandidates(cwd: string) {
  return coreCandidates(cwd, nodeHost);
}
