import { nodeHost } from "./node-host.js";
import { renderRootHelp as root, renderCommandHelp as command } from "./help-core.js";
import type { CommandSpec } from "./registry.js";
export function renderRootHelp(commands: readonly CommandSpec[]) {
  return root(commands, nodeHost.version);
}
export function renderCommandHelp(spec: CommandSpec, invokedAs?: string) {
  return command(spec, nodeHost.version, invokedAs);
}
