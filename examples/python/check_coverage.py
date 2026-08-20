"""Check coverage before looking a product up.

``GET /v1/domains`` returns hosts normalized by the server — lowercased, with a
leading ``www.`` stripped — so it reports ``macys.com`` and never
``www.macys.com``. Real product URLs usually *do* carry ``www.``, which is why
comparing a raw URL host against that list silently reports covered merchants as
uncovered. ``DomainCoverage.is_host_covered`` normalizes both sides.

Requires OCTOGEN_PLATFORM_API_KEY in the environment.
"""

from __future__ import annotations

import asyncio
from urllib.parse import urlsplit

from octogen_ai_sdk import OctogenAPIError, OctogenClient

URLS = (
    "https://www.etro.com/us-en/cashmere-overshirt-MRBA008599TU2K3F0257.html",
    "https://www.jcrew.com/p/mens/categories/clothing/"
    "pajamas-and-loungewear/robes/fleece-robe/BM002",
    "https://www.example.com/products/definitely-not-covered",
)


async def main() -> None:
    async with OctogenClient() as client:
        coverage = await client.fetch_domain_coverage()

        print(f"{len(coverage.hosts)} covered hosts")
        print(f"ETag {coverage.etag or '(none)'}")

        for url in URLS:
            covered = coverage.is_host_covered(url)
            catalogs = coverage.catalogs_for(url)
            label = "covered" if covered else "not covered"
            suffix = f" -> {', '.join(catalogs)}" if catalogs else ""
            print(f"- {label}: {urlsplit(url).hostname}{suffix}")
            if not covered:
                continue
            found = await client.lookup_product(url)
            print(f"    {found.product.title or 'Untitled product'}")

        # Revalidation, not a refetch: the same ETag comes back as a 304 and the
        # snapshot is reused untouched.
        revalidated = await client.fetch_domain_coverage(coverage)
        print(
            "revalidated: 304, snapshot reused"
            if revalidated is coverage
            else "revalidated: coverage changed, snapshot replaced"
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except OctogenAPIError as error:
        raise SystemExit(f"Octogen API error: status={error.status_code}") from error
