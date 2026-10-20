/**
 * `storerouter skill`: the bundled agent skill.
 *
 * The skill is prose an agent acts on, so the tests hold it to the CLI it ships
 * with: it prints byte-for-byte what `skills/storerouter/SKILL.md` says, names
 * every command and every exit code, and every shell example in it parses
 * against the real flags (see documented-examples.test.ts).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { COMMAND_LIST } from "../src/commands/index.js";
import { ExitCode } from "../src/exit.js";
import { runCli } from "./harness.js";

const skill = readFileSync(
  new URL("../../skills/storerouter/SKILL.md", import.meta.url),
  "utf8",
);
const reference = readFileSync(new URL("../REFERENCE.md", import.meta.url), "utf8");

describe("storerouter skill", () => {
  it("prints the skill as Markdown, with no key and no network", async () => {
    const result = await runCli({ argv: ["skill", "--no-json"], env: {} });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).toBe(skill);
    expect(result.requests).toHaveLength(0);
  });

  it("keeps the JSON contract when piped, with the text in markdown", async () => {
    const result = await runCli({ argv: ["skill"], env: {} });
    expect(result.json()).toMatchObject({
      ok: true,
      command: "skill",
      path: "SKILL.md",
      files: ["SKILL.md", "references/commands.md"],
      markdown: skill,
      exitCode: ExitCode.Success,
    });
  });

  it("prints a linked reference, and refuses one it does not have", async () => {
    const commands = await runCli({
      argv: ["skill", "references/commands.md", "--no-json"],
      env: {},
    });
    expect(commands.stdout).toBe(reference);

    const missing = await runCli({ argv: ["skill", "references/nope.md"], env: {} });
    expect(missing.exitCode).toBe(ExitCode.Usage);
    expect(missing.json()["code"]).toBe("unknown_reference");
  });

  it("has the frontmatter skill loaders read", () => {
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? "";
    expect(frontmatter).toMatch(/^name: storerouter$/m);
    expect(frontmatter).toMatch(/^description: \S/m);
    const metadata = /^metadata: (.*)$/m.exec(frontmatter)?.[1] ?? "";
    expect(JSON.parse(metadata)).toEqual({
      openclaw: {
        requires: { bins: ["storerouter"] },
        install: [{ kind: "node", package: "@storerouter/cli", bins: ["storerouter"] }],
      },
    });
  });

  it("names every command and explains every exit code", () => {
    for (const command of COMMAND_LIST) {
      if (command.name === "skill" || command.name === "lookup") continue;
      expect(skill, command.name).toContain(`storerouter ${command.name}`);
    }
    // `lookup` is introduced through its alias, which is what the website calls it.
    expect(skill).toContain("`parse` and `lookup` are the same command");
    for (const code of Object.values(ExitCode)) {
      expect(skill, `exit ${String(code)}`).toContain(`| \`${String(code)}\`  |`);
    }
  });
});
