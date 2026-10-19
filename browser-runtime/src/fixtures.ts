import type { Transport } from "./protocol.js";
/** Deterministic local harness data; these are not live API claims. */
export const fixtureTransport: Transport = (request, signal) => {
  signal.throwIfAborted();
  const path = new URL(request.url).pathname;
  let data: unknown;
  if (path.endsWith("/search"))
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
  else if (path.startsWith("/v1/domains/"))
    data = {
      host: path.slice("/v1/domains/".length),
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
