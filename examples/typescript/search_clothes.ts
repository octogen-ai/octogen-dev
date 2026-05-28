import { inspect } from "node:util";

import {
  OctogenAPIError,
  OctogenClient,
} from "../../sdks/typescript/src/index.js";

async function main(): Promise<void> {
  try {
    const client = new OctogenClient();
    const catalogs = await client.listCatalogs();
    if (catalogs.length === 0) {
      console.log("No catalogs are available for this API key.");
      return;
    }

    const results = await client.searchProducts({
      limit: 5,
      q: "women's linen summer dresses",
    });

    console.log("Catalog scope: all granted catalogs");
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
