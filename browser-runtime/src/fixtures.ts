import type { Transport } from "./protocol.js";
/** Deterministic local harness data; these are not live API claims. */
export const fixtureTransport: Transport = (request, signal) => {
  signal.throwIfAborted();
  const path = new URL(request.url).pathname;
  let data: unknown;
  const brand = {
    brandUuid: "fixture-brand",
    brandName: "Example",
    brandSlug: "example",
    domain: "example.com",
    brandDescription: "Linen basics (fixture).",
  };
  if (path === "/v1/brands/prefix") data = ["Example", "Example Studio"];
  else if (path === "/v1/brands/search" || path === "/v1/brands/similar")
    data = { results: [brand], totalFound: 1 };
  else if (path.startsWith("/v1/brands/") && path.endsWith("/products"))
    data = {
      brandName: "Example",
      brandSlug: "example",
      total: 1,
      limit: 24,
      offset: 0,
      hasMore: false,
      products: [
        {
          uuid: "fixture-linen-dress",
          catalogKey: "example",
          productUrl: "https://example.com/linen-dress",
          title: "Linen dress (fixture)",
          brand: { name: "Example" },
          currentPrice: 89,
          currency: "USD",
          imageUrl: null,
        },
      ],
    };
  else if (path.startsWith("/v1/brands/") && path.endsWith("/top-categories"))
    data = {
      brandName: "Example",
      topCategories: [{ categoryName: "Dresses", categoryLevel: 2 }],
    };
  else if (path.startsWith("/v1/brands/"))
    data = {
      ...brand,
      foundedYear: 2020,
      originCountry: "US",
      priceTier: "mid",
      productCount: 1200,
      computedAt: "2026-10-19T00:00:00Z",
      fields: [
        {
          name: "color",
          displayName: "Color",
          source: "product",
          populated: 1100,
          coverage: 0.917,
          distinct: 12,
          topValues: [{ value: "black", label: "Black", count: 400 }],
          truncated: true,
        },
      ],
      price: null,
      catalogs: [
        {
          catalog: "example",
          catalogDisplayName: "Example (fixture)",
          hosts: ["example.com"],
          productCount: 1200,
        },
      ],
      catalogsTruncated: false,
    };
  else if (path === "/v1/stores/search" || path === "/v1/stores/similar")
    data = {
      results: [
        {
          store: {
            storeId: "catalog:example",
            catalog: "example",
            displayName: "Example (fixture)",
            primaryDomain: "example.com",
            domains: ["example.com"],
          },
          profileVersion: "fixture-profile",
          computedAt: "2026-10-19T00:00:00Z",
          summary: "Observed assortment (fixture).",
          matchedDepartment: {
            departmentId: "category:apparel & accessories > clothing",
            categoryPath: ["Apparel & Accessories", "Clothing"],
            productCount: 900,
            summary: "Linen dresses (fixture).",
            distributions: [],
          },
        },
      ],
    };
  else if (path.endsWith("/search"))
    data = {
      items: [
        {
          uuid: "fixture-linen-dress",
          catalogKey: "example",
          productUrl: "https://example.com/linen-dress",
          title: "Linen dress (fixture)",
          brand: { name: "Example" },
          currentPrice: 89,
          currency: "USD",
          imageUrl: null,
        },
      ],
      nextCursor: null,
    };
  else if (path.endsWith("/lookup") || path.endsWith("/parse"))
    data = {
      source: "index",
      catalogKey: "example",
      product: {
        title: "Linen dress (fixture)",
        brand: { name: "Example" },
        currentPrice: 89,
        currency: "USD",
        images: [],
        variants: [],
      },
    };
  else if (path.startsWith("/v1/stores/"))
    data = {
      host: path.slice("/v1/stores/".length),
      catalogs: [
        {
          catalog: "example",
          catalogDisplayName: "Example (fixture)",
          computedAt: "2026-10-19T00:00:00Z",
          productCount: 1200,
          fields: [
            {
              name: "color",
              displayName: "Color",
              source: "product",
              populated: 1100,
              coverage: 0.917,
              distinct: 12,
              truncated: true,
              topValues: [{ value: "black", label: "Black", count: 300 }],
            },
          ],
          price: {
            populated: 1150,
            median: 89,
            below: 3,
            above: 20,
            buckets: [{ min: 20, max: 200, count: 1127 }],
          },
        },
      ],
    };
  else if (path.endsWith("/more-like-this"))
    data = {
      source: {
        uuid: "fixture-linen-dress",
        catalogKey: "example",
        productUrl: "https://example.com/linen-dress",
      },
      items: [],
      nextCursor: null,
    };
  else return Promise.reject(new Error("No fixture for operation"));
  return Promise.resolve({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
};
