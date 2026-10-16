import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { GLOBAL_FLAGS, parseArgs } from "../src/args.js";
import { COMMAND_LIST } from "../src/commands/index.js";

it("all shell examples in the linked public CLI reference use accepted commands and flags", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const blocks = [...readme.matchAll(/```bash\n([\s\S]*?)```/g)];
  const examples = blocks
    .flatMap((block) => (block[1] ?? "").split("\n"))
    .filter((line) => /\bstorerouter\s|@storerouter\/cli@next\s/.test(line));
  expect(examples.length).toBeGreaterThan(10);
  for (const example of examples) {
    const invocation = example
      .replace(/^.*?\bstorerouter\s/, "")
      .replace(/\s+#.*$/, "");
    const argv = [...invocation.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map(
      (match) => match[1] ?? match[2] ?? match[3] ?? "",
    );
    const command = [...COMMAND_LIST]
      .sort((a, b) => b.name.length - a.name.length)
      .find((candidate) =>
        candidate.name.split(" ").every((word, index) => argv[index] === word),
      );
    expect(command, example).toBeDefined();
    if (command === undefined) throw new Error(example);
    expect(
      () =>
        parseArgs(argv.slice(command.name.split(" ").length), {
          ...GLOBAL_FLAGS,
          ...command.flags,
        }),
      example,
    ).not.toThrow();
  }
});
