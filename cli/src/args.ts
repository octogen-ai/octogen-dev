/**
 * A small, dependency-free argument parser.
 *
 * Hand-rolled rather than pulled in, for two reasons that both come back to
 * `npx -y`: every dependency is bytes and a supply-chain surface on a package
 * strangers execute on trust, and the parser has to produce *our* usage errors
 * (exit `2`, one JSON object on stdout) rather than printing a library's help
 * text and calling `process.exit` itself.
 *
 * Deliberately strict: an unknown flag is a usage error, not a positional.
 * A typo in a flag an agent generated should fail loudly instead of silently
 * changing the request.
 */

import { usageError } from "./exit.js";

export type FlagKind = "boolean" | "string" | "number";

export interface FlagSpec {
  kind: FlagKind;
  /** Repeatable: `--facet a=1 --facet b=2` collects both. */
  multiple?: boolean;
  /** A `--no-<name>` counterpart, for booleans that need a forced `false`. */
  negatable?: boolean;
  describe: string;
  /** Shown in `--help` as `--name <placeholder>`. */
  placeholder?: string;
  /** Allowed values, enforced here so a bad value never reaches the API. */
  choices?: readonly string[];
}

export type FlagSpecs = Readonly<Record<string, FlagSpec>>;

export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string[] | boolean | number>;
}

/**
 * Flags every command accepts. Declared once so `--json` on `lookup` and
 * `--json` on `status` cannot drift apart.
 */
export const GLOBAL_FLAGS: FlagSpecs = Object.freeze({
  json: {
    describe:
      "Force JSON on stdout (the default when stdout is not a TTY). --no-json forces human output.",
    kind: "boolean",
    negatable: true,
  },
  quiet: {
    describe: "Suppress stderr diagnostics. Never changes stdout.",
    kind: "boolean",
  },
  verbose: {
    describe: "Add request timing and allow-listed response headers on stderr.",
    kind: "boolean",
  },
  "no-retry": {
    describe: "Do not retry anything, so a measured latency is one request.",
    kind: "boolean",
  },
  "api-key-stdin": {
    describe: "Read the API key as one line from stdin.",
    kind: "boolean",
  },
  "api-key-file": {
    describe: "Read the API key from a file.",
    kind: "string",
    placeholder: "path",
  },
  timeout: {
    describe: "Per-request timeout in seconds.",
    kind: "number",
    placeholder: "seconds",
  },
  "base-url": {
    describe: "Override the API base URL. For Octogen staging only.",
    kind: "string",
    placeholder: "url",
  },
  yes: {
    describe: "Accepted everywhere for symmetry; a no-op when not a TTY.",
    kind: "boolean",
  },
  help: { describe: "Show help for this command.", kind: "boolean" },
  // Handled before the strict parse (so `octogen --version` works with no
  // command at all), and declared here so it appears in `--help` and is not
  // rejected as an unknown option alongside a command.
  version: {
    describe: "Print the CLI version and the exact SDK version it is pinned to.",
    kind: "boolean",
  },
});

/**
 * Parse `argv` against a flag table.
 *
 * `--` ends flag parsing, so a positional that looks like a flag (a URL with a
 * leading dash, say) is still reachable.
 */
export function parseArgs(argv: readonly string[], specs: FlagSpecs): ParsedArgs {
  const flags = new Map<string, string[] | boolean | number>();
  const positionals: string[] = [];
  let onlyPositionals = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";

    if (onlyPositionals || !token.startsWith("-") || token === "-") {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      onlyPositionals = true;
      continue;
    }

    const equals = token.indexOf("=");
    const rawName = equals === -1 ? token : token.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : token.slice(equals + 1);
    const name = rawName.replace(/^--?/, "");

    const negated = name.startsWith("no-") && !(name in specs);
    const lookupName = negated ? name.slice(3) : name;
    const spec = specs[lookupName];
    if (spec === undefined) {
      throw usageError(`Unknown option: ${rawName}`, "unknown_option");
    }

    if (negated) {
      if (spec.kind !== "boolean" || spec.negatable !== true) {
        throw usageError(`${rawName} is not a negatable option`, "unknown_option");
      }
      flags.set(lookupName, false);
      continue;
    }

    if (spec.kind === "boolean") {
      if (inlineValue !== undefined) {
        throw usageError(`${rawName} does not take a value`, "invalid_option_value");
      }
      flags.set(lookupName, true);
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (value === undefined || (inlineValue === undefined && value.startsWith("--"))) {
      throw usageError(`${rawName} requires a value`, "missing_option_value");
    }
    if (spec.choices !== undefined && !spec.choices.includes(value)) {
      throw usageError(
        `${rawName} must be one of: ${spec.choices.join(", ")} (got ${value})`,
        "invalid_option_value",
      );
    }

    if (spec.kind === "number") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw usageError(
          `${rawName} must be a number (got ${value})`,
          "invalid_option_value",
        );
      }
      flags.set(lookupName, parsed);
      continue;
    }

    if (spec.multiple === true) {
      const existing = flags.get(lookupName);
      const list = Array.isArray(existing) ? existing : [];
      list.push(value);
      flags.set(lookupName, list);
      continue;
    }
    flags.set(lookupName, [value]);
  }

  return { flags, positionals };
}

/** Typed accessors. Each one keeps a `Map<string, …>` from leaking upward. */
export class Args {
  constructor(private readonly parsed: ParsedArgs) {}

  get positionals(): readonly string[] {
    return this.parsed.positionals;
  }

  boolean(name: string): boolean | undefined {
    const value = this.parsed.flags.get(name);
    return typeof value === "boolean" ? value : undefined;
  }

  /** A boolean flag's value, defaulting to `false` when absent. */
  flag(name: string): boolean {
    return this.boolean(name) ?? false;
  }

  string(name: string): string | undefined {
    const value = this.parsed.flags.get(name);
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value[value.length - 1];
  }

  strings(name: string): readonly string[] {
    const value = this.parsed.flags.get(name);
    return Array.isArray(value) ? value : [];
  }

  number(name: string): number | undefined {
    const value = this.parsed.flags.get(name);
    return typeof value === "number" ? value : undefined;
  }

  /** An integer within bounds, as a usage error rather than a `422`. */
  integer(name: string, bounds: { min: number; max: number }): number | undefined {
    const value = this.number(name);
    if (value === undefined) {
      return undefined;
    }
    if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      throw usageError(
        `--${name} must be an integer between ${String(bounds.min)} and ${String(
          bounds.max,
        )} (got ${String(value)})`,
        "invalid_option_value",
      );
    }
    return value;
  }
}
