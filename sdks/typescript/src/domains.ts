import { isHostCovered, normalizeHost } from "./hosts.js";
import type { DomainEntry } from "./models.js";

/**
 * An immutable snapshot of `GET /v1/domains`, with the host matching built in.
 *
 * The endpoint is `Cache-Control: max-age=300` behind a strong `ETag` and
 * clients are expected to revalidate rather than refetch, so a snapshot carries
 * the `etag` that produced it. Pass it back to
 * `OctogenClient#fetchDomainCoverage` and a `304` returns this same object.
 */
export class DomainCoverage {
  /** Every `(host, catalog)` pair, exactly as the server returned it. */
  readonly entries: readonly DomainEntry[];
  /** The strong `ETag` of this snapshot; revalidate with it. */
  readonly etag: string | undefined;
  /** `max-age` from `Cache-Control`, in seconds, when the server sent one. */
  readonly maxAgeSeconds: number | undefined;
  /** When this snapshot was received, for `maxAgeSeconds` staleness checks. */
  readonly retrievedAt: Date;

  private readonly catalogsByHost: ReadonlyMap<string, readonly string[]>;

  constructor(
    entries: readonly DomainEntry[],
    options: {
      etag?: string | undefined;
      maxAgeSeconds?: number | undefined;
      retrievedAt?: Date | undefined;
    } = {},
  ) {
    this.entries = Object.freeze([...entries]);
    this.etag = options.etag;
    this.maxAgeSeconds = options.maxAgeSeconds;
    this.retrievedAt = options.retrievedAt ?? new Date();

    const catalogsByHost = new Map<string, string[]>();
    for (const entry of this.entries) {
      // Normalize the server's side too. Today it only emits apex hosts, but a
      // `www.` entry appears in the published example, and normalizing both
      // sides means such an entry still matches rather than becoming a
      // duplicate key that nothing looks up.
      const host = normalizeHost(entry.host);
      if (host === undefined) {
        continue;
      }
      const catalogs = catalogsByHost.get(host);
      if (catalogs === undefined) {
        catalogsByHost.set(host, [entry.catalog]);
      } else if (!catalogs.includes(entry.catalog)) {
        catalogs.push(entry.catalog);
      }
    }
    this.catalogsByHost = catalogsByHost;
  }

  /** The normalized covered hosts — the raw set, for callers that want it. */
  get hosts(): readonly string[] {
    return [...this.catalogsByHost.keys()].sort();
  }

  /**
   * Is this URL's merchant covered?
   *
   * Takes a full product URL or a bare host and normalizes it before
   * comparing, so `https://www.macys.com/shop/product/x` matches the
   * `macys.com` the server reports.
   */
  isHostCovered(urlOrHost: string | null | undefined): boolean {
    const host = normalizeHost(urlOrHost);
    return host !== undefined && this.catalogsByHost.has(host);
  }

  /** Catalogs claiming this URL's host; empty when it is not covered. */
  catalogsFor(urlOrHost: string | null | undefined): readonly string[] {
    const host = normalizeHost(urlOrHost);
    if (host === undefined) {
      return [];
    }
    return this.catalogsByHost.get(host) ?? [];
  }

  /** True once `max-age` has elapsed — time to revalidate with `etag`. */
  isStale(now: Date = new Date()): boolean {
    if (this.maxAgeSeconds === undefined) {
      return true;
    }
    const ageSeconds = (now.getTime() - this.retrievedAt.getTime()) / 1000;
    return ageSeconds >= this.maxAgeSeconds;
  }
}

export { isHostCovered, normalizeHost };
