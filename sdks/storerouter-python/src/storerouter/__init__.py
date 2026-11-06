"""StoreRouter Python SDK: structured product data from real merchant catalogs.

Look up any product URL as normalized JSON, search products across stores,
and discover brands and stores::

    from storerouter import StoreRouter

    with StoreRouter() as client:  # reads STOREROUTER_API_KEY
        product = client.lookup_product("https://www.allbirds.com/products/mens-tree-runners").product
        page = client.search_products(q="linen shirt", stores=["everlane.com"], limit=5)

:class:`AsyncStoreRouter` has the same methods as coroutines.
"""

import importlib.metadata as _metadata

from octogen_ai_sdk import (
    Facet,
    MissingAPIKeyError,
    RequestContext,
    RequestContextDefaults,
    SearchFacet,
)
from octogen_ai_sdk import OctogenAPIError as APIError
from octogen_ai_sdk import OctogenAuthenticationError as AuthenticationError
from octogen_ai_sdk import OctogenConnectionError as APIConnectionError
from octogen_ai_sdk import OctogenError as StoreRouterError
from octogen_ai_sdk import OctogenForbiddenError as PermissionDeniedError
from octogen_ai_sdk import OctogenInsufficientCreditError as InsufficientCreditError
from octogen_ai_sdk import OctogenNotFoundError as NotFoundError
from octogen_ai_sdk import OctogenRateLimitError as RateLimitError
from octogen_ai_sdk import OctogenServerError as InternalServerError
from octogen_ai_sdk import OctogenTimeoutError as APITimeoutError
from octogen_ai_sdk import OctogenValidationError as ValidationError

from storerouter import models
from storerouter._client import (
    API_KEY_ENV_VAR,
    BASE_URL_ENV_VAR,
    DEFAULT_BASE_URL,
    AsyncStoreRouter,
    LookupResult,
    StoreRouter,
)
from storerouter._retry import RetryTransport
from storerouter.models import (
    Product,
    ProductListItem,
    ProductLookupResponse,
    ProductSearchPage,
    ProductVariant,
)

try:
    __version__ = _metadata.version("storerouter")
except _metadata.PackageNotFoundError:  # pragma: no cover - source checkout
    __version__ = "0.0.0"

__all__ = [
    "API_KEY_ENV_VAR",
    "BASE_URL_ENV_VAR",
    "DEFAULT_BASE_URL",
    "APIConnectionError",
    "APIError",
    "APITimeoutError",
    "AsyncStoreRouter",
    "AuthenticationError",
    "Facet",
    "InsufficientCreditError",
    "InternalServerError",
    "LookupResult",
    "MissingAPIKeyError",
    "NotFoundError",
    "PermissionDeniedError",
    "Product",
    "ProductListItem",
    "ProductLookupResponse",
    "ProductSearchPage",
    "ProductVariant",
    "RateLimitError",
    "RequestContext",
    "RequestContextDefaults",
    "RetryTransport",
    "SearchFacet",
    "StoreRouter",
    "StoreRouterError",
    "ValidationError",
    "__version__",
    "models",
]
