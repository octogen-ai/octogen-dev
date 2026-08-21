import { describe, expect, it } from "vitest";

import {
  DomainCoverage,
  OctogenClient,
  isHostCovered,
  normalizeHost,
  type DomainEntry,
  type FetchLike,
} from "../src/index.js";

/**
 * The apex-only shape `GET /v1/domains` actually returns. Not one of the 414
 * live entries carries `www.`, which is exactly what makes a naive
 * `hosts.includes(new URL(url).host)` check report a covered merchant as
 * uncovered.
 */
const APEX_ONLY_DOMAINS: DomainEntry[] = [
  { host: "macys.com", catalog: "macys", catalogDisplayName: "Macy's" },
  { host: "etro.com", catalog: "etro", catalogDisplayName: "Etro" },
  { host: "jcrew.com", catalog: "jcrew", catalogDisplayName: "J.Crew" },
];

const ETAG = '"9f2c0b1d4e5a6f708192a3b4c5d6e7f8"';

describe("normalizeHost", () => {
  it("normalizes the way the server normalizes source hosts", () => {
    expect(normalizeHost("https://www.macys.com/shop/product/x?y=1")).toBe("macys.com");
    expect(normalizeHost("HTTPS://WWW.Macys.COM/Shop")).toBe("macys.com");
    expect(normalizeHost("www.macys.com")).toBe("macys.com");
    expect(normalizeHost("macys.com")).toBe("macys.com");
    expect(normalizeHost("macys.com:443")).toBe("macys.com");
    expect(normalizeHost("macys.com.")).toBe("macys.com");
    expect(normalizeHost("  https://www.macys.com  ")).toBe("macys.com");
  });

  it("strips only a leading www. label", () => {
    expect(normalizeHost("https://wwwx.macys.com")).toBe("wwwx.macys.com");
    expect(normalizeHost("https://shop.www.macys.com")).toBe("shop.www.macys.com");
  });

  it("returns undefined rather than guessing", () => {
    expect(normalizeHost(undefined)).toBeUndefined();
    expect(normalizeHost(null)).toBeUndefined();
    expect(normalizeHost("")).toBeUndefined();
    expect(normalizeHost("   ")).toBeUndefined();
    expect(normalizeHost("not a host")).toBeUndefined();
    expect(normalizeHost("https://")).toBeUndefined();
  });
});

describe("DomainCoverage", () => {
  it("matches a www. product URL against an apex-only list", () => {
    const coverage = new DomainCoverage(APEX_ONLY_DOMAINS, { etag: ETAG });

    // The bug this test exists for: every one of these is covered, and a
    // client comparing raw hosts would call all of them uncovered.
    expect(coverage.isHostCovered("https://www.macys.com/shop/product/dress")).toBe(
      true,
    );
    expect(
      coverage.isHostCovered(
        "https://www.etro.com/us-en/cashmere-overshirt-MRBA008599TU2K3F0257.html",
      ),
    ).toBe(true);
    expect(
      coverage.isHostCovered(
        "https://www.jcrew.com/p/mens/categories/clothing/pajamas-and-loungewear/robes/fleece-robe/BM002",
      ),
    ).toBe(true);
  });

  it("matches without www. too, and rejects what is genuinely uncovered", () => {
    const coverage = new DomainCoverage(APEX_ONLY_DOMAINS);

    expect(coverage.isHostCovered("https://macys.com/shop/product/dress")).toBe(true);
    expect(coverage.isHostCovered("macys.com")).toBe(true);
    expect(coverage.isHostCovered("https://www.example.com/p/1")).toBe(false);
    expect(coverage.isHostCovered("")).toBe(false);
    expect(coverage.isHostCovered(undefined)).toBe(false);
  });

  it("exposes the raw list and the normalized host set", () => {
    const coverage = new DomainCoverage(APEX_ONLY_DOMAINS, { etag: ETAG });

    expect(coverage.entries).toEqual(APEX_ONLY_DOMAINS);
    expect(coverage.hosts).toEqual(["etro.com", "jcrew.com", "macys.com"]);
    expect(coverage.etag).toBe(ETAG);
  });

  it("normalizes the server's side, so a www. entry is not a second host", () => {
    // The published OpenAPI example shows both `allbirds.com` and
    // `www.allbirds.com`. Should the server ever emit that, both collapse onto
    // one key instead of one of them becoming unreachable.
    const coverage = new DomainCoverage([
      { host: "allbirds.com", catalog: "allbirds", catalogDisplayName: "Allbirds" },
      {
        host: "www.allbirds.com",
        catalog: "allbirds",
        catalogDisplayName: "Allbirds",
      },
    ]);

    expect(coverage.hosts).toEqual(["allbirds.com"]);
    expect(coverage.isHostCovered("https://www.allbirds.com/products/x")).toBe(true);
    expect(coverage.catalogsFor("allbirds.com")).toEqual(["allbirds"]);
  });

  it("reports every catalog claiming a host", () => {
    const coverage = new DomainCoverage([
      { host: "shop.example", catalog: "a", catalogDisplayName: "A" },
      { host: "www.shop.example", catalog: "b", catalogDisplayName: "B" },
    ]);

    expect(coverage.catalogsFor("https://shop.example/p/1")).toEqual(["a", "b"]);
    expect(coverage.catalogsFor("https://other.example/p/1")).toEqual([]);
  });

  it("goes stale once max-age has elapsed", () => {
    const retrievedAt = new Date("2026-08-20T12:00:00Z");
    const coverage = new DomainCoverage(APEX_ONLY_DOMAINS, {
      maxAgeSeconds: 300,
      retrievedAt,
    });

    expect(coverage.isStale(new Date("2026-08-20T12:04:00Z"))).toBe(false);
    expect(coverage.isStale(new Date("2026-08-20T12:05:00Z"))).toBe(true);
    // No Cache-Control at all: revalidate rather than trust it indefinitely.
    expect(new DomainCoverage(APEX_ONLY_DOMAINS).isStale()).toBe(true);
  });
});

describe("isHostCovered", () => {
  it("normalizes both sides", () => {
    const hosts = ["macys.com", "etro.com"];

    expect(isHostCovered("https://www.macys.com/shop/x", hosts)).toBe(true);
    expect(isHostCovered("https://www.macys.com/shop/x", ["www.macys.com"])).toBe(true);
    expect(isHostCovered("https://macys.com", ["WWW.MACYS.COM"])).toBe(true);
    expect(isHostCovered("https://nordstrom.com", hosts)).toBe(false);
    expect(isHostCovered("nonsense url", hosts)).toBe(false);
  });
});

describe("OctogenClient#listDomains", () => {
  it("requests /domains and surfaces the ETag and max-age", async () => {
    const calls: { input: string; init: RequestInit | undefined }[] = [];
    const fetchMock: FetchLike = (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(
        new Response(JSON.stringify({ domains: APEX_ONLY_DOMAINS }), {
          headers: {
            "Cache-Control": "max-age=300",
            "Content-Type": "application/json",
            ETag: ETAG,
          },
          status: 200,
        }),
      );
    };
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const result = await client.listDomains();

    expect(calls[0]?.input).toBe("https://api.octogen.ai/v1/domains");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(result.notModified).toBe(false);
    expect(result.domains).toEqual(APEX_ONLY_DOMAINS);
    expect(result.etag).toBe(ETAG);
    expect(result.maxAgeSeconds).toBe(300);
  });

  it("sends If-None-Match and reports a 304 without a body", async () => {
    const calls: { input: string; init: RequestInit | undefined }[] = [];
    const fetchMock: FetchLike = (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(
        new Response(null, {
          headers: { "Cache-Control": "max-age=300", ETag: ETAG },
          status: 304,
        }),
      );
    };
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const result = await client.listDomains({ ifNoneMatch: ETAG });

    expect(calls[0]?.init?.headers).toMatchObject({ "If-None-Match": ETAG });
    expect(result.notModified).toBe(true);
    expect(result.domains).toBeUndefined();
    expect(result.etag).toBe(ETAG);
  });
});

describe("OctogenClient#fetchDomainCoverage", () => {
  it("revalidates with the previous ETag and reuses the snapshot on 304", async () => {
    const calls: { input: string; init: RequestInit | undefined }[] = [];
    let status = 200;
    const fetchMock: FetchLike = (input, init) => {
      calls.push({ input, init });
      if (status === 304) {
        return Promise.resolve(
          new Response(null, { headers: { ETag: ETAG }, status: 304 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ domains: APEX_ONLY_DOMAINS }), {
          headers: {
            "Cache-Control": "max-age=300",
            "Content-Type": "application/json",
            ETag: ETAG,
          },
          status: 200,
        }),
      );
    };
    const client = new OctogenClient({ apiKey: "key", fetch: fetchMock });

    const first = await client.fetchDomainCoverage();
    expect(first.etag).toBe(ETAG);
    expect(calls[0]?.init?.headers).not.toMatchObject({ "If-None-Match": ETAG });

    status = 304;
    const second = await client.fetchDomainCoverage(first);

    expect(calls[1]?.init?.headers).toMatchObject({ "If-None-Match": ETAG });
    // The same object, not an equal one: nothing was re-parsed.
    expect(second).toBe(first);
    expect(second.isHostCovered("https://www.macys.com/shop/x")).toBe(true);
  });
});

describe("isHostCovered's footgun", () => {
  it("accepts the entry objects `GET /v1/domains` actually returns", () => {
    // The bug this fixes: `isHostCovered(url, response.domains)` — the obvious
    // first call — used to return `false` for everything, silently, because the
    // elements are `{host, catalog, catalogDisplayName}` and not strings. A
    // helper whose entire purpose is preventing a silent false negative must not
    // have one of its own.
    expect(
      isHostCovered("https://www.macys.com/shop/product/x", APEX_ONLY_DOMAINS),
    ).toBe(true);
    expect(isHostCovered("https://www.example.invalid/p", APEX_ONLY_DOMAINS)).toBe(
      false,
    );
  });

  it("still accepts plain host strings", () => {
    const hosts = APEX_ONLY_DOMAINS.map((entry) => entry.host);
    expect(isHostCovered("https://www.macys.com/shop/product/x", hosts)).toBe(true);
    expect(isHostCovered("macys.com", hosts)).toBe(true);
  });

  it("throws on an element it does not understand rather than answering false", () => {
    // Loud, because the return value decides whether a caller ever asks about a
    // merchant again. `false` for a shape we failed to read is the one answer
    // this function must never give.
    expect(() => isHostCovered("https://www.macys.com/p", [42] as never)).toThrow(
      TypeError,
    );
    expect(() =>
      isHostCovered("https://www.macys.com/p", [{ hostname: "macys.com" }] as never),
    ).toThrow(/must be a host string or an object with a string `host`/);
    expect(() => isHostCovered("https://www.macys.com/p", [null] as never)).toThrow(
      TypeError,
    );
  });

  it("does not throw when the URL side is unreadable — that is just a miss", () => {
    expect(isHostCovered("not a url", APEX_ONLY_DOMAINS)).toBe(false);
    expect(isHostCovered(undefined, APEX_ONLY_DOMAINS)).toBe(false);
  });
});
