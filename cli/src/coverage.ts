/**
 * The covered-domain snapshot, its cache, and the rule that keeps a coverage
 * verdict honest.
 *
 * ## Why this file is the careful one
 *
 * `GET /v1/domains` returns hosts **normalized**: lowercased, leading `www.`
 * stripped. It reports `macys.com` and never `www.macys.com` — zero of the 416
 * live entries carry `www.` Real product URLs overwhelmingly do. So a raw
 * comparison (`hosts.includes(new URL(url).host)`) reports "not covered" for a
 * covered merchant, and *nothing errors*: the agent simply abandons a domain
 * that would have answered. That bug shipped in the live `SKILL.md` and was
 * fixed in monorepo #8689. Every comparison here therefore goes through the
 * SDK's {@link DomainCoverage}, which normalizes both sides.
 *
 * ## Provenance, and why a verdict carries it
 *
 * A `covered: false` may only ever be said on the strength of an answer from
 * the server. Three provenances qualify, and they are the only three:
 *
 * * `api` — a `200` we just received;
 * * `revalidated` — a `304`, which is the server saying our snapshot is current;
 * * `cache` — a snapshot still inside its `max-age=300` window.
 *
 * Everything else — exhaustion, `401`, `403`, a timeout, a parse failure —
 * reports `coverage: "unknown"` and never the words "not covered". That is the
 * mechanism keeping "you are out of quota" from being read as "Octogen does not
 * have this merchant", and `tests/coverage-invariants.test.ts` asserts the
 * string cannot appear on any other path.
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { DomainCoverage, type DomainEntry } from "@octogen-ai/sdk";

import { call, type ApiContext } from "./client.js";

/** How a snapshot came to be, and therefore whether it can answer. */
export type CoverageProvenance = "api" | "revalidated" | "cache";

export interface CoverageSnapshot {
  coverage: DomainCoverage;
  provenance: CoverageProvenance;
}

interface CacheFile {
  schemaVersion: 1;
  baseUrl: string;
  etag: string | undefined;
  maxAgeSeconds: number | undefined;
  retrievedAt: string;
  domains: DomainEntry[];
}

/**
 * Where the snapshot is cached.
 *
 * Under the user's cache directory rather than the project: the covered-domain
 * set is a property of Octogen, not of a checkout, and writing it into somebody
 * else's repository for a read-only query would be rude. Keyed by base URL and
 * the credential's key id, because a different key can resolve a different
 * catalog scope and answering from another one's snapshot would be a wrong
 * answer of exactly the kind this file exists to prevent.
 */
export function cachePath(options: {
  baseUrl: string;
  keyPrefix: string | undefined;
  env?: Readonly<Record<string, string | undefined>>;
}): string {
  const env = options.env ?? process.env;
  const root =
    env["OCTOGEN_CACHE_DIR"] ??
    join(env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache"), "octogen");
  const scope = createHash("sha256")
    .update(`${options.baseUrl}\n${options.keyPrefix ?? "keyless"}`)
    .digest("hex")
    .slice(0, 16);
  return join(root, "domains", `${scope}.json`);
}

/**
 * Read the cache, treating the file as untrusted.
 *
 * It was written by *some* version of this CLI, not necessarily this one, so
 * every field is validated before use and anything unrecognized is a cache miss
 * rather than an error. A corrupt cache must cost a round trip, never a wrong
 * coverage answer.
 */
export function readCache(path: string): CoverageSnapshot | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const file = parsed as Partial<CacheFile>;
  if (file.schemaVersion !== 1 || !Array.isArray(file.domains)) {
    return undefined;
  }
  const retrievedAt = new Date(String(file.retrievedAt));
  if (Number.isNaN(retrievedAt.getTime())) {
    return undefined;
  }
  return {
    coverage: new DomainCoverage(file.domains, {
      etag: file.etag,
      maxAgeSeconds: file.maxAgeSeconds,
      retrievedAt,
    }),
    provenance: "cache",
  };
}

export function writeCache(
  path: string,
  baseUrl: string,
  coverage: DomainCoverage,
): void {
  const file: CacheFile = {
    baseUrl,
    domains: [...coverage.entries],
    etag: coverage.etag,
    maxAgeSeconds: coverage.maxAgeSeconds,
    retrievedAt: coverage.retrievedAt.toISOString(),
    schemaVersion: 1,
  };
  mkdirSync(dirname(path), { mode: 0o700, recursive: true });
  writeFileSync(path, `${JSON.stringify(file)}\n`, { mode: 0o600 });
  // `writeFileSync`'s mode is only applied when it creates the file, so an
  // existing file keeps whatever it had. Set it either way.
  chmodSync(path, 0o600);
}

export interface FetchCoverageOptions {
  /** Skip the cache entirely, for `--no-cache` and for `status --verbose`. */
  noCache?: boolean;
  baseUrl?: string | undefined;
  env?: Readonly<Record<string, string | undefined>> | undefined;
}

/**
 * Get a usable snapshot: from cache when it is fresh, by revalidation when it
 * is not, by download when there is none.
 *
 * The endpoint is `Cache-Control: max-age=300` behind a strong `ETag`, so this
 * is the access pattern it was built for. A `304` costs a round trip and no
 * body, which is why a stale-but-present cache revalidates rather than
 * re-downloading 34 KB of hosts.
 */
export async function fetchCoverage(
  context: ApiContext,
  options: FetchCoverageOptions = {},
): Promise<CoverageSnapshot> {
  const baseUrl = options.baseUrl ?? "https://api.octogen.ai/v1";
  const path = cachePath({
    baseUrl,
    keyPrefix: context.key.keyPrefix,
    ...(options.env === undefined ? {} : { env: options.env }),
  });
  const cached = options.noCache === true ? undefined : readCache(path);

  if (cached !== undefined && !cached.coverage.isStale()) {
    context.writer.trace(
      `GET /domains served from ${path} (fresh, etag ${cached.coverage.etag ?? "none"})`,
    );
    return cached;
  }

  const coverage = await call(
    context,
    "GET /domains",
    () => context.client.fetchDomainCoverage(cached?.coverage),
    { coverageAdjacent: true },
  );

  // `fetchDomainCoverage` returns the *same object* on a `304`, which is how a
  // revalidation is distinguished from a fresh download without inspecting the
  // response again.
  const revalidated = coverage === cached?.coverage;
  if (revalidated) {
    context.writer.trace("GET /domains 304 — the cached snapshot is current");
    // Re-stamp `retrievedAt`: the server has just confirmed this snapshot, so
    // it is good for another `max-age` and the next call needs no request. The
    // entries are reused verbatim, which is what a `304` licenses.
    const confirmed = new DomainCoverage(coverage.entries, {
      etag: coverage.etag,
      maxAgeSeconds: coverage.maxAgeSeconds,
      retrievedAt: new Date(),
    });
    writeCacheQuietly(path, baseUrl, confirmed, context);
    return { coverage: confirmed, provenance: "revalidated" };
  }

  writeCacheQuietly(path, baseUrl, coverage, context);
  return { coverage, provenance: "api" };
}

function writeCacheQuietly(
  path: string,
  baseUrl: string,
  coverage: DomainCoverage,
  context: ApiContext,
): void {
  try {
    writeCache(path, baseUrl, coverage);
  } catch (error) {
    // An unwritable cache directory must not fail a coverage query: the answer
    // is already in hand, and the cache is an optimization.
    context.writer.trace(
      `could not write ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
