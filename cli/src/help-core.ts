/**
 * `--help`, on stderr.
 *
 * Help is a diagnostic, not a result: it goes to stderr so that
 * `storerouter lookup --help` piped into a parser does not corrupt the one-object
 * stdout contract. Which also means help is never colorized and never paged.
 */

import { GLOBAL_FLAGS, type FlagSpec, type FlagSpecs } from "./args.js";
import { ExitCode } from "./exit.js";
import type { CommandSpec } from "./registry.js";
import type { CliHost } from "./host.js";

export function renderRootHelp(
  commands: readonly CommandSpec[],
  version: CliHost["version"],
): string {
  const width = Math.max(...commands.map((command) => command.name.length));
  const lines = [
    `storerouter ${version.version} (sdk ${version.sdkVersion})`,
    "",
    "Usage: storerouter <command> [options]",
    "",
    "Commands:",
  ];
  for (const command of commands) {
    lines.push(`  ${command.name.padEnd(width)}  ${command.summary}`);
  }
  lines.push(
    "",
    "Aliases: parse = lookup; octogen = storerouter (compatibility executable).",
    "",
    "Agents: storerouter skill --no-json prints how to use this CLI well.",
    "",
    "Credentials: --api-key-stdin, --api-key-file, STOREROUTER_API_KEY,",
    "  OCTOGEN_PLATFORM_API_KEY, OCTO_API_KEY (deprecated), then nearest .env.",
    "",
    "Global options:",
    ...flagLines(GLOBAL_FLAGS),
    "",
    "Output:",
    "  Human-readable when stdout is a TTY; JSON when it is not, so an agent",
    "  gets parseable output without having to ask. JSON is one object on one",
    "  line with schemaVersion first. Diagnostics go to stderr.",
    "",
    "Exit codes:",
    ...exitCodeLines(),
    "",
    "storerouter --help <command> for a command's own options.",
  );
  return lines.join("\n");
}

/** `storerouter brands`: a command group's subcommands, as root help lists commands. */
export function renderGroupHelp(
  group: string,
  commands: readonly CommandSpec[],
  version: CliHost["version"],
): string {
  const subcommands = commands.map((command) => ({
    name: command.name.slice(group.length + 1),
    summary: command.summary,
  }));
  const width = Math.max(...subcommands.map((command) => command.name.length));
  return [
    `storerouter ${version.version} (sdk ${version.sdkVersion})`,
    "",
    `Usage: storerouter ${group} <subcommand> [options]`,
    "",
    "Subcommands:",
    ...subcommands.map(
      (command) => `  ${command.name.padEnd(width)}  ${command.summary}`,
    ),
    "",
    `storerouter ${group} <subcommand> --help for a subcommand's own options.`,
  ].join("\n");
}

/** `invokedAs` is the alias typed, if any: `storerouter parse --help` shows `parse`. */
export function renderCommandHelp(
  command: CommandSpec,
  version: CliHost["version"],
  invokedAs: string = command.name,
): string {
  const usage = command.usage.startsWith(command.name)
    ? `${invokedAs}${command.usage.slice(command.name.length)}`
    : command.usage;
  const lines = [`storerouter ${usage}`, "", `  ${command.summary}`];
  if (command.notes !== undefined && command.notes.length > 0) {
    lines.push("");
    for (const note of command.notes) {
      lines.push(note.length === 0 ? "" : `  ${note}`);
    }
  }
  if (command.flags !== undefined && Object.keys(command.flags).length > 0) {
    lines.push("", "Options:", ...flagLines(command.flags));
  }
  if (command.operations.length > 0) {
    lines.push(
      "",
      `Calls: ${command.operations.join(", ")} (through @octogen-ai/sdk ${version.sdkVersion})`,
    );
  }
  lines.push("", "Global options: storerouter --help");
  return lines.join("\n");
}

function flagLines(specs: FlagSpecs): string[] {
  const entries = Object.entries(specs).map(
    ([name, spec]) => [invocation(name, spec), spec.describe] as const,
  );
  const width = Math.max(...entries.map(([left]) => left.length));
  return entries.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`);
}

function invocation(name: string, spec: FlagSpec): string {
  const negation = spec.negatable === true ? ` / --no-${name}` : "";
  if (spec.kind === "boolean") {
    return `--${name}${negation}`;
  }
  const placeholder = spec.placeholder ?? (spec.kind === "number" ? "n" : "value");
  return `--${name} <${placeholder}>`;
}

function exitCodeLines(): string[] {
  return [
    `  ${String(ExitCode.Success)}  success`,
    `  ${String(ExitCode.Unexpected)}  unexpected failure (network, 5xx after retries, unhandled)`,
    `  ${String(ExitCode.Usage)}  usage error`,
    `  ${String(ExitCode.NoCredential)}  no usable credential (none found, invalid, or revoked)`,
    `  ${String(ExitCode.NotEntitled)}  not entitled (403; not a Developer organization)`,
    `  ${String(ExitCode.Throttled)}  throttled or out of quota (any 429, including the keyless cap)`,
    `  ${String(ExitCode.NoResult)}  no result: the server answered and the answer was empty`,
    `  ${String(ExitCode.Partial)}  partial success`,
  ];
}
