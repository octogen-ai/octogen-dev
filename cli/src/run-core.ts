/**
 * Argument dispatch, and the one place an exit code is decided.
 *
 * `run()` returns a code rather than calling `process.exit`, so the whole CLI
 * is testable in-process: every test in `tests/` drives the real dispatcher
 * with real argv and asserts on the real envelope. `bin.ts` is the only file
 * that touches the process.
 */

import type { CliHost } from "./host.js";

import { Args, GLOBAL_FLAGS, parseArgs, type FlagSpecs } from "./args.js";
import { resolveKey } from "./auth-core.js";
import { buildContext, type ApiContext } from "./client.js";
import { COMMAND_LIST, COMMAND_TABLE } from "./commands/index.js";
import { resolveBaseUrl } from "./config.js";
import type { CommandContext } from "./context.js";
import { CliError, ExitCode, usageError } from "./exit.js";
import { renderCommandHelp, renderRootHelp } from "./help-core.js";
import { Redactor } from "./redact.js";
import { resolveJsonMode, Writer } from "./output.js";
import type { CommandSpec } from "./registry.js";

export interface RunOptions {
  onResult?: (operation: string, data: unknown) => void;
  host: CliHost;
  argv: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  /** Whether stdout is a TTY. Decides human-versus-JSON when unforced. */
  isTty?: boolean;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  readStdin?: () => string;
  /** Optional host-specific credential stdin diagnostic adapter. */
  readKeyStdin?: () => string;
}

/**
 * Match multi-word commands before their shorter prefixes.
 */
function matchCommand(
  positionals: readonly string[],
): { command: CommandSpec; rest: string[] } | undefined {
  for (const words of [2, 1]) {
    const name = positionals.slice(0, words).join(" ");
    const command = COMMAND_TABLE.get(name === "parse" ? "lookup" : name);
    if (command !== undefined) {
      return { command, rest: positionals.slice(words) };
    }
  }
  return undefined;
}

export async function run(options: RunOptions): Promise<ExitCode> {
  const argv = [...options.argv];
  const cwd = options.cwd ?? "/";
  const env = options.env ?? {};
  // `isatty(1)` rather than `process.stdout.isTTY`, which Node types as a
  // boolean but leaves `undefined` on a pipe — and a pipe is the case that
  // decides the output format, since that is how an agent runs the CLI.
  const isTty = options.isTty ?? false;
  const redactor = new Redactor();

  // Parsed twice: once loosely, to learn the command and the output mode before
  // anything can fail, and once strictly against that command's own flags. It
  // means a usage error is still reported in the caller's chosen format, which
  // is the format an agent is parsing.
  const preliminary = looseParse(argv);
  const unavailable = new Set(options.host.unavailableCommands ?? []);
  const commands = COMMAND_LIST.filter((command) => !unavailable.has(command.name));
  const writer = new Writer({
    json: resolveJsonMode({ isTty, json: preliminary.json }),
    quiet: preliminary.quiet,
    redactor,
    stderr: options.stderr,
    stdout: options.stdout,
    verbose: preliminary.verbose,
  });

  try {
    const bare = argv.filter((token) => !token.startsWith("-"));

    if (preliminary.version) {
      writer.emit({
        command: "version",
        data: {
          cli: {
            node: options.host.version.node,
            sdkVersion: options.host.version.sdkVersion,
            version: options.host.version.version,
          },
        },
        exitCode: ExitCode.Success,
        human: () =>
          `storerouter ${options.host.version.version} (sdk ${options.host.version.sdkVersion})`,
        ok: true,
      });
      return ExitCode.Success;
    }

    if (bare.length === 0) {
      // No command at all is not an error: print help on stderr, keep stdout
      // clean, and exit `2` because nothing was asked for.
      writer.diagnostic(renderRootHelp(commands, options.host.version));
      return ExitCode.Usage;
    }

    const matched = matchCommand(bare);
    if (matched === undefined) {
      throw usageError(`Unknown command: ${bare[0] ?? ""}`, "unknown_command");
    }
    const { command } = matched;
    if (unavailable.has(command.name)) {
      throw usageError(
        `storerouter ${command.name} is not available here. Install the CLI to use it: npm i -g @storerouter/cli`,
        "unavailable_command",
      );
    }
    const specs: FlagSpecs = { ...GLOBAL_FLAGS, ...(command.flags ?? {}) };
    const parsed = parseArgs(argv, specs);
    const args = new Args(parsed);

    if (args.flag("help")) {
      writer.diagnostic(renderCommandHelp(command, options.host.version));
      return ExitCode.Success;
    }

    // Re-derive the positionals from the strict parse, so a flag value is not
    // mistaken for one: `--catalog macys` leaves `macys` out of positionals.
    const positionals = parsed.positionals.slice(command.name.split(" ").length);

    let api: ApiContext | undefined;
    const context: CommandContext = {
      api: () => {
        api ??= buildContext({
          ...(options.onResult === undefined ? {} : { onResult: options.onResult }),
          host: options.host,
          key: resolveKey({
            host: options.host,
            apiKeyStdin: args.flag("api-key-stdin"),
            cwd,
            env,
            ...(args.string("api-key-file") === undefined
              ? {}
              : { apiKeyFile: args.string("api-key-file") }),
            ...((options.readKeyStdin ?? options.readStdin) === undefined
              ? {}
              : { readStdin: options.readKeyStdin ?? options.readStdin }),
          }),
          noRetry: args.flag("no-retry"),
          writer,
          baseUrl: resolveBaseUrl(args.string("base-url"), env),
          ...(args.number("timeout") === undefined
            ? {}
            : { timeoutSeconds: args.number("timeout") }),
          ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
          ...(options.random === undefined ? {} : { random: options.random }),
          ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
        });
        return api;
      },
      host: options.host,
      args,
      command: command.name,
      cwd,
      env,
      help: () => {
        writer.diagnostic(renderCommandHelp(command, options.host.version));
      },
      positionals,
      readStdin: options.readStdin ?? (() => ""),
      writer,
    };

    return await command.run(context);
  } catch (error) {
    const failure =
      error instanceof CliError
        ? error
        : new CliError(unexpected(error, redactor), {
            cause: error,
            code: "unexpected",
            exitCode: ExitCode.Unexpected,
          });
    if (writer.hasEmitted) {
      // stdout is already written and must stay a single object, so a late
      // failure is reported on stderr only. Rare by construction: commands emit
      // last.
      writer.diagnostic(`${failure.code}: ${failure.message}`);
      return failure.exitCode;
    }
    return writer.fail(commandNameFor(argv), failure);
  }
}

function commandNameFor(argv: readonly string[]): string {
  const bare = argv.filter((token) => !token.startsWith("-"));
  const matched = matchCommand(bare);
  return matched?.command.name ?? bare[0] ?? "storerouter";
}

/**
 * The output-affecting flags, read without validating anything else.
 *
 * Hand-scanned rather than parsed, because the strict parse can *throw* and its
 * error has to be rendered in the mode these flags select.
 */
function looseParse(argv: readonly string[]): {
  json: boolean | undefined;
  quiet: boolean;
  verbose: boolean;
  version: boolean;
} {
  let json: boolean | undefined;
  let quiet = false;
  let verbose = false;
  let version = false;
  for (const token of argv) {
    switch (token) {
      case "--json":
        json = true;
        break;
      case "--no-json":
        json = false;
        break;
      case "--quiet":
        quiet = true;
        break;
      case "--verbose":
        verbose = true;
        break;
      case "--version":
      case "-V":
        version = true;
        break;
      default:
        break;
    }
  }
  return { json, quiet, verbose, version };
}

/**
 * An unexpected throw, rendered through the redactor.
 *
 * The stack is included under nothing at all — it goes into the message only
 * when it has been redacted, because an unhandled exception's stack is the leak
 * nobody plans for and the only one that can carry a request URL.
 */
function unexpected(error: unknown, redactor: Redactor): string {
  if (error instanceof Error) {
    const stack = error.stack ?? `${error.name}: ${error.message}`;
    return redactor.redact(stack);
  }
  return redactor.redact(`Unexpected failure: ${String(error)}`);
}
