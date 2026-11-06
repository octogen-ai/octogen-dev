"""Every request and response model, re-exported from ``octogen_ai_sdk.models``.

The friendlier names below are aliases of the same classes:

- :data:`Product` -- the full normalized product a lookup returns.
- :data:`ProductListItem` -- one search, brand-browse or more-like-this result.
- :data:`ProductLookupResponse` -- a lookup's envelope: ``product`` plus how
  it was resolved.
- :data:`ProductSearchPage` -- one page of search results.
"""

from octogen_ai_sdk.models import *  # noqa: F403
from octogen_ai_sdk.models import (
    MerchantProductListItem,
    MerchantProductUrlLookupResponse,
    MerchantProductView,
    MerchantVariantView,
    ProgrammaticProductSearchPage,
)

Product = MerchantProductView
ProductVariant = MerchantVariantView
ProductListItem = MerchantProductListItem
ProductLookupResponse = MerchantProductUrlLookupResponse
ProductSearchPage = ProgrammaticProductSearchPage
