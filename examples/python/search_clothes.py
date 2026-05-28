"""Search for clothes with the Octogen Python SDK.

Run from the repository root:

    uv run --project sdks/python python examples/python/search_clothes.py

Requires OCTO_API_KEY in the environment.
"""

from __future__ import annotations

import asyncio
from pprint import pformat

from octogen_ai_sdk import OctogenAPIError, OctogenClient


async def main() -> None:
    try:
        async with OctogenClient() as client:
            catalogs = await client.list_catalogs()
            if not catalogs:
                print("No catalogs are available for this API key.")
                return

            results = await client.search_products(
                q="women's linen summer dresses",
                limit=5,
            )

            print("Catalog scope: all granted catalogs")
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
    except OctogenAPIError as exc:
        print(f"Octogen API error: status={exc.status_code}")
        print(pformat(exc.detail))
        raise


if __name__ == "__main__":
    asyncio.run(main())
