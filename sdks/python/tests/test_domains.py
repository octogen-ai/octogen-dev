"""Covered-domain matching — the `www.` false negative, and ETag revalidation."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
import respx
from octogen_ai_sdk import (
    DomainCoverage,
    DomainEntry,
    OctogenClient,
    coverage_hosts,
    is_host_covered,
    normalize_host,
)

BASE_URL = "https://api.octogen.ai/v1"
ETAG = '"9f2c0b1d4e5a6f708192a3b4c5d6e7f8"'

# The apex-only shape `GET /v1/domains` actually returns. Not one of the 414
# live entries carries `www.`, which is what makes a naive
# `urlsplit(url).hostname in hosts` check report a covered merchant as
# uncovered.
APEX_ONLY = [
    DomainEntry(host="macys.com", catalog="macys", catalogDisplayName="Macy's"),
    DomainEntry(host="etro.com", catalog="etro", catalogDisplayName="Etro"),
    DomainEntry(host="jcrew.com", catalog="jcrew", catalogDisplayName="J.Crew"),
]
APEX_ONLY_JSON = {
    "domains": [
        entry.model_dump(mode="json", by_alias=True, exclude_none=True)
        for entry in APEX_ONLY
    ]
}


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("https://www.macys.com/shop/product/x?y=1", "macys.com"),
        ("HTTPS://WWW.Macys.COM/Shop", "macys.com"),
        ("www.macys.com", "macys.com"),
        ("macys.com", "macys.com"),
        ("macys.com:443", "macys.com"),
        ("macys.com.", "macys.com"),
        ("  https://www.macys.com  ", "macys.com"),
        # Only a leading `www.` label is stripped.
        ("https://wwwx.macys.com", "wwwx.macys.com"),
        ("https://shop.www.macys.com", "shop.www.macys.com"),
    ],
)
def test_normalize_host(value: str, expected: str) -> None:
    assert normalize_host(value) == expected


@pytest.mark.parametrize("value", [None, "", "   ", "not a host", "https://"])
def test_normalize_host_refuses_to_guess(value: str | None) -> None:
    assert normalize_host(value) is None


def test_matches_www_product_url_against_apex_only_list() -> None:
    coverage = DomainCoverage(APEX_ONLY, etag=ETAG)

    # The bug this test exists for: every one of these is covered, and a client
    # comparing raw hosts would call all of them uncovered.
    assert coverage.is_host_covered("https://www.macys.com/shop/product/dress")
    assert coverage.is_host_covered(
        "https://www.etro.com/us-en/cashmere-overshirt-MRBA008599TU2K3F0257.html"
    )
    assert coverage.is_host_covered(
        "https://www.jcrew.com/p/mens/categories/clothing/"
        "pajamas-and-loungewear/robes/fleece-robe/BM002"
    )


def test_matches_without_www_and_rejects_the_uncovered() -> None:
    coverage = DomainCoverage(APEX_ONLY)

    assert coverage.is_host_covered("https://macys.com/shop/product/dress")
    assert coverage.is_host_covered("macys.com")
    assert not coverage.is_host_covered("https://www.example.com/p/1")
    assert not coverage.is_host_covered("")
    assert not coverage.is_host_covered(None)


def test_exposes_the_raw_list_and_the_normalized_host_set() -> None:
    coverage = DomainCoverage(APEX_ONLY, etag=ETAG)

    assert coverage.entries == tuple(APEX_ONLY)
    assert coverage.hosts == ("etro.com", "jcrew.com", "macys.com")
    assert coverage.etag == ETAG


def test_normalizes_the_servers_side_too() -> None:
    # The published OpenAPI example shows both `allbirds.com` and
    # `www.allbirds.com`. Should the server ever emit that, both collapse onto
    # one key instead of one of them becoming unreachable.
    coverage = DomainCoverage(
        [
            DomainEntry(
                host="allbirds.com", catalog="allbirds", catalogDisplayName="Allbirds"
            ),
            DomainEntry(
                host="www.allbirds.com",
                catalog="allbirds",
                catalogDisplayName="Allbirds",
            ),
        ]
    )

    assert coverage.hosts == ("allbirds.com",)
    assert coverage.is_host_covered("https://www.allbirds.com/products/x")
    assert coverage.catalogs_for("allbirds.com") == ("allbirds",)


def test_reports_every_catalog_claiming_a_host() -> None:
    coverage = DomainCoverage(
        [
            DomainEntry(host="shop.example", catalog="a", catalogDisplayName="A"),
            DomainEntry(host="www.shop.example", catalog="b", catalogDisplayName="B"),
        ]
    )

    assert coverage.catalogs_for("https://shop.example/p/1") == ("a", "b")
    assert coverage.catalogs_for("https://other.example/p/1") == ()


def test_goes_stale_once_max_age_has_elapsed() -> None:
    retrieved_at = datetime(2026, 8, 20, 12, 0, tzinfo=UTC)
    coverage = DomainCoverage(APEX_ONLY, max_age_seconds=300, retrieved_at=retrieved_at)

    assert not coverage.is_stale(datetime(2026, 8, 20, 12, 4, tzinfo=UTC))
    assert coverage.is_stale(datetime(2026, 8, 20, 12, 5, tzinfo=UTC))
    # No Cache-Control at all: revalidate rather than trust it indefinitely.
    assert DomainCoverage(APEX_ONLY).is_stale()


def test_is_host_covered_normalizes_both_sides() -> None:
    hosts = ["macys.com", "etro.com"]

    assert is_host_covered("https://www.macys.com/shop/x", hosts)
    assert is_host_covered("https://www.macys.com/shop/x", ["www.macys.com"])
    assert is_host_covered("https://macys.com", ["WWW.MACYS.COM"])
    assert not is_host_covered("https://nordstrom.com", hosts)
    assert not is_host_covered("nonsense url", hosts)


def test_coverage_hosts_helper() -> None:
    assert coverage_hosts(APEX_ONLY) == ("etro.com", "jcrew.com", "macys.com")


@respx.mock
async def test_list_domains_surfaces_the_etag_and_max_age() -> None:
    route = respx.get(f"{BASE_URL}/domains").mock(
        return_value=httpx.Response(
            200,
            json=APEX_ONLY_JSON,
            headers={"ETag": ETAG, "Cache-Control": "max-age=300"},
        )
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.list_domains()

    assert route.called
    assert result.not_modified is False
    assert result.domains is not None
    assert [entry.host for entry in result.domains] == [
        "macys.com",
        "etro.com",
        "jcrew.com",
    ]
    assert result.etag == ETAG
    assert result.max_age_seconds == 300


@respx.mock
async def test_list_domains_sends_if_none_match_and_reports_304() -> None:
    route = respx.get(f"{BASE_URL}/domains").mock(
        return_value=httpx.Response(
            304, headers={"ETag": ETAG, "Cache-Control": "max-age=300"}
        )
    )

    async with OctogenClient(api_key="key") as client:
        result = await client.list_domains(if_none_match=ETAG)

    assert route.calls.last.request.headers["If-None-Match"] == ETAG
    assert result.not_modified is True
    assert result.domains is None
    assert result.etag == ETAG


@respx.mock
async def test_fetch_domain_coverage_reuses_the_snapshot_on_304() -> None:
    respx.get(f"{BASE_URL}/domains").mock(
        return_value=httpx.Response(
            200,
            json=APEX_ONLY_JSON,
            headers={"ETag": ETAG, "Cache-Control": "max-age=300"},
        )
    )

    async with OctogenClient(api_key="key") as client:
        first = await client.fetch_domain_coverage()
        assert first.etag == ETAG
        assert "If-None-Match" not in respx.calls.last.request.headers

        respx.get(f"{BASE_URL}/domains").mock(
            return_value=httpx.Response(304, headers={"ETag": ETAG})
        )
        second = await client.fetch_domain_coverage(first)

    assert respx.calls.last.request.headers["If-None-Match"] == ETAG
    # The same object, not an equal one: nothing was re-parsed.
    assert second is first
    assert second.is_host_covered("https://www.macys.com/shop/x")
