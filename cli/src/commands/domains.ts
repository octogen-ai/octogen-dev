/**
 * `octogen domains [--check <url>]` — the coverage gate.
 *
 * This is the highest-stakes command in the CLI, and `--check` earns its own
 * flag rather than making an agent grep JSON, because getting it wrong is the
 * expensive failure mode in the whole product: an agent that concludes "not
 * covered" for a merchant we cover abandons the domain silently.
 *
 * Exit `0` covered, `6` not covered, and **never `6` for any other reason**.
 * See `coverage.ts` for the provenance rule that enforces the second half.
 */

import type { CommandContext } from "../context.js";
import { fetchCoverage, type CoverageProvenance } from "../coverage.js";
import { ExitCode, noResult, usageError } from "../exit.js";
import type { CommandSpec } from "../registry.js";

async function runDomains(context: CommandContext): Promise<ExitCode> {
  const { args, writer } = context;
  const check = args.string("check");
  const limit = args.integer("limit", { max: 10_000, min: 1 });

  if (context.positionals.length > 0) {
    throw usageError(
      `octogen domains takes no positional arguments; did you mean --check ${
        context.positionals[0] ?? ""
      }?`,
    );
  }

  const api = context.api();

  const snapshot = await fetchCoverage(api, {
    baseUrl: args.string("base-url"),
    env: context.env,
    noCache: args.flag("no-cache"),
  });
  const { coverage, provenance } = snapshot;

  if (check === undefined) {
    const hosts = limit === undefined ? coverage.hosts : coverage.hosts.slice(0, limit);
    writer.emit({
      command: context.command,
      data: {
        source: provenance,
        etag: coverage.etag ?? null,
        hostCount: coverage.hosts.length,
        catalogCount: new Set(coverage.entries.map((entry) => entry.catalog)).size,
        hosts,
        truncated: hosts.length < coverage.hosts.length,
      },
      exitCode: ExitCode.Success,
      human: () =>
        [
          `${String(coverage.hosts.length)} covered hosts (${describeProvenance(provenance)})`,
          ...hosts.map((host) => `  ${host}  ${coverage.catalogsFor(host).join(", ")}`),
          hosts.length < coverage.hosts.length
            ? `  … ${String(coverage.hosts.length - hosts.length)} more (raise --limit)`
            : "",
        ]
          .filter((line) => line.length > 0)
          .join("\n"),
      ok: true,
    });
    return ExitCode.Success;
  }

  // The whole point. `isHostCovered` normalizes both sides, so a `www.` product
  // URL matches the apex-only host the server returns.
  const covered = coverage.isHostCovered(check);
  const catalogs = coverage.catalogsFor(check);

  if (!covered) {
    // Exit `6`, and reachable only from a server-confirmed snapshot: `noResult`
    // demands the evidence, and `provenance` is where it comes from.
    throw noResult({
      answeredWith: `${provenance} snapshot of GET /domains`,
      code: "host_not_covered",
      coverage: "not_covered",
      // Emitted so `covered` is a field an agent can read in both directions
      // rather than one that is present on a hit and absent on a miss.
      data: { catalogs: [], covered: false, source: provenance, url: check },
      message: `${check} is not covered: no catalog claims that host.`,
      remediation: { command: `octogen voyage ${check}` },
      serverAnswered: true,
    });
  }

  writer.emit({
    command: context.command,
    data: {
      coverage: "covered",
      covered: true,
      url: check,
      // Two catalogs can claim one host (`lagence.com` is claimed by `lagence`
      // and `myshopify`), so this is a list and `lookup` may resolve either.
      catalogs,
      source: provenance,
      etag: coverage.etag ?? null,
    },
    exitCode: ExitCode.Success,
    human: () => `${check} is covered by ${catalogs.join(", ")}`,
    ok: true,
  });
  return ExitCode.Success;
}

function describeProvenance(provenance: CoverageProvenance): string {
  switch (provenance) {
    case "api":
      return "fetched";
    case "revalidated":
      return "revalidated, 304";
    case "cache":
      return "cached, still fresh";
  }
}

export const domainsCommand = {
  flags: {
    check: {
      describe:
        "Answer 'is this merchant covered?' for one URL or host. Exit 0 covered, 6 not covered.",
      kind: "string",
      placeholder: "url",
    },
    limit: {
      describe: "Print at most this many hosts (listing mode only).",
      kind: "number",
      placeholder: "n",
    },
    "no-cache": {
      describe: "Ignore the local ETag cache and re-fetch.",
      kind: "boolean",
    },
  },
  name: "domains",
  notes: [
    "Hosts come back normalized — lowercased, leading `www.` stripped — so the",
    "server reports `macys.com` and never `www.macys.com`. --check normalizes",
    "your URL the same way before comparing, which is the difference between",
    "a correct answer and a silent false negative on almost every real",
    "product URL.",
    "",
    "The snapshot is cached with its ETag and revalidated with If-None-Match;",
    "a 304 means the cache was current. Keyless-eligible.",
  ],
  operations: ["listDomains"] as const,
  run: runDomains,
  summary: "List covered merchant hosts, or check one with --check",
  usage: "domains [--check <url>] [--limit <n>] [--no-cache]",
} satisfies CommandSpec;
