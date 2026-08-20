/**
 * Check coverage before looking a product up.
 *
 * `GET /v1/domains` returns hosts normalized by the server — lowercased, with a
 * leading `www.` stripped — so it reports `macys.com` and never
 * `www.macys.com`. Real product URLs usually *do* carry `www.`, which is why
 * comparing a raw URL host against that list silently reports covered
 * merchants as uncovered. `DomainCoverage#isHostCovered` normalizes both sides.
 *
 * Requires `OCTOGEN_PLATFORM_API_KEY` in the environment.
 */
import { inspect } from "node:util";

import { OctogenAPIError, OctogenClient } from "../../sdks/typescript/src/index.js";

const URLS = [
  "https://www.etro.com/us-en/cashmere-overshirt-MRBA008599TU2K3F0257.html",
  "https://www.jcrew.com/p/mens/categories/clothing/pajamas-and-loungewear/robes/fleece-robe/BM002",
  "https://www.example.com/products/definitely-not-covered",
];

async function main(): Promise<void> {
  try {
    const client = new OctogenClient();
    const coverage = await client.fetchDomainCoverage();

    console.log(`${String(coverage.hosts.length)} covered hosts`);
    console.log(`ETag ${coverage.etag ?? "(none)"}`);

    for (const url of URLS) {
      const covered = coverage.isHostCovered(url);
      const catalogs = coverage.catalogsFor(url);
      console.log(
        `- ${covered ? "covered" : "not covered"}: ${new URL(url).host}` +
          (catalogs.length > 0 ? ` → ${catalogs.join(", ")}` : ""),
      );
      if (!covered) {
        continue;
      }
      const found = await client.lookupProduct(url);
      console.log(`    ${found.product.title ?? "Untitled product"}`);
    }

    // Revalidation, not a refetch: the same ETag comes back as a 304 and the
    // snapshot is reused untouched.
    const revalidated = await client.fetchDomainCoverage(coverage);
    console.log(
      revalidated === coverage
        ? "revalidated: 304, snapshot reused"
        : "revalidated: coverage changed, snapshot replaced",
    );
  } catch (error) {
    if (error instanceof OctogenAPIError) {
      console.error(`Octogen API error: status=${String(error.statusCode)}`);
      console.error(inspect(error.detail, { depth: null }));
    }
    throw error;
  }
}

await main();
