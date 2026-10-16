import type { Transport } from "./protocol.js";
/** Deterministic local harness data; these are not live API claims. */
export const fixtureTransport: Transport = (request, signal) => {
  signal.throwIfAborted();
  const path = new URL(request.url).pathname;
  let data: unknown;
  if (path.endsWith("/domains"))
    data = {
      domains: [
        {
          host: "example.com",
          catalog: "example",
          catalogDisplayName: "Example fixture",
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
