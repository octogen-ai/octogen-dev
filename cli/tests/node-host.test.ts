import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("preserves credential-stdin I/O failure as unreadable_input exit 2", () => {
  const runUrl = new URL("../src/run.ts", import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import { closeSync } from 'node:fs';
    import { run } from ${JSON.stringify(runUrl)};
    closeSync(0);
    process.exitCode = await run({ argv: ['status', '--api-key-stdin', '--offline', '--json'], env: {} });
  `,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({
    code: "unreadable_input",
    exitCode: 2,
  });
});
