"""Search for clothes with the Octogen Python SDK.

Run from the repository root:

    uv run --project sdks/python python examples/python/search_clothes.py

Requires OCTO_API_KEY in the environment.
"""

from __future__ import annotations

import asyncio

from octogen_ai_sdk import OctogenClient


async def main() -> None:
    async with OctogenClient() as client:
        catalogs = await client.list_catalogs()
        if not catalogs:
            print("No catalogs are available for this API key.")
            return

        catalog = catalogs[0].catalog
        results = await client.search_products(
            catalog=catalog,
            q="women's linen summer dresses",
            limit=5,
        )

        print(f"Catalog: {catalog}")
        for product in results.items:
            brand = product.brand.name if product.brand else "Unknown brand"
            price = (
                f"${product.current_price:.2f}"
                if product.current_price is not None
                else "Price unavailable"
            )
            title = product.title or "Untitled product"
            print(f"- {title} | {brand} | {price}")
            print(f"  {product.product_url}")


if __name__ == "__main__":
    asyncio.run(main())
