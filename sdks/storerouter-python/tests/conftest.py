from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
import respx

BASE_URL = "https://api.test.storerouter.ai/v1"


def product_payload(url: str, *, title: str = "Tree Runner") -> dict[str, Any]:
    return {
        "source": "indexed",
        "catalogKey": "allbirds",
        "product": {
            "uuid": "2b7a52cc-93e4-545a-999c-ed6f41f54ea6",
            "productUrl": url,
            "title": title,
            "brand": {"name": "Allbirds"},
            "currentPrice": 110.0,
            "currency": "USD",
            "inStock": True,
        },
    }


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "STOREROUTER_API_KEY",
        "STOREROUTER_BASE_URL",
        "OCTOGEN_PLATFORM_API_KEY",
        "OCTO_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def api() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as router:
        yield router
