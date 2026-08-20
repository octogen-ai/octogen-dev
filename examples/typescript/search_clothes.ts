import { inspect } from "node:util";

import { OctogenAPIError, OctogenClient } from "../../sdks/typescript/src/index.js";

async function main(): Promise<void> {
  try {
    const client = new OctogenClient();
    const results = await client.searchProducts({
      limit: 5,
      q: "women's linen summer dresses",
    });

    console.log("Catalog scope: all active crawled catalogs");
    for (const product of results.items) {
      const brand = product.brand?.name ?? "Unknown brand";
      const price =
        product.currentPrice === null || product.currentPrice === undefined
          ? "Price unavailable"
          : `$${product.currentPrice.toFixed(2)}`;
      const title = product.title ?? "Untitled product";
      console.log(`- ${title} | ${brand} | ${price}`);
      console.log(`  ${product.productUrl}`);
    }
  } catch (error) {
    if (error instanceof OctogenAPIError) {
      console.error(`Octogen API error: status=${String(error.statusCode)}`);
      console.error(inspect(error.detail, { depth: null }));
    }
    throw error;
  }
}

await main();
