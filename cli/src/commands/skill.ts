/**
 * `storerouter skill [<reference>]` — the agent skill bundled with this CLI.
 *
 * Prints `skills/storerouter/SKILL.md` as it was when this CLI was built, so
 * the guidance an agent reads always matches the commands and flags it can
 * run. The skill links its references by path, and the same command prints
 * them: `storerouter skill references/commands.md`.
 *
 * No network and no credential, so it is the first thing an agent can run.
 * Piped output keeps the one-object JSON contract, with the text in
 * `markdown`; `--no-json` prints the Markdown itself.
 */

import type { CommandContext } from "../context.js";
import { ExitCode, usageError } from "../exit.js";
import { SKILL_FILES } from "../generated/skill.js";
import type { CommandSpec } from "../registry.js";

const ENTRY = "SKILL.md";
const FILES: ReadonlyMap<string, string> = new Map(Object.entries(SKILL_FILES));

function runSkill(context: CommandContext): Promise<ExitCode> {
  if (context.positionals.length > 1) {
    throw usageError(
      "storerouter skill takes at most one reference path.",
      "too_many_arguments",
    );
  }
  const path = context.positionals[0] ?? ENTRY;
  const markdown = FILES.get(path);
  if (markdown === undefined) {
    throw usageError(
      `No skill file ${path}. Available: ${[...FILES.keys()].join(", ")}.`,
      "unknown_reference",
    );
  }
  context.writer.emit({
    command: context.command,
    data: { path, files: [...FILES.keys()], markdown },
    exitCode: ExitCode.Success,
    human: () => markdown,
    ok: true,
  });
  return Promise.resolve(ExitCode.Success);
}

export const skillCommand = {
  name: "skill",
  notes: [
    "Prints the agent skill bundled with this CLI version: when to use",
    "StoreRouter, which command fits a task, what each exit code means, and",
    "how to present results. With a path, prints a reference it links to.",
    "",
    "Piped output is the usual JSON envelope with the text in `markdown`;",
    "--no-json prints the Markdown itself. No network, no credential.",
  ],
  operations: [] as const,
  run: runSkill,
  summary: "Print the agent skill: how to use this CLI well",
  usage: "skill [<reference>]",
} satisfies CommandSpec;
