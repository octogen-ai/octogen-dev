"""Covered-domain snapshot for ``GET /v1/domains``."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import UTC, datetime

from octogen_ai_sdk.generated.models import DomainEntry
from octogen_ai_sdk.hosts import normalize_host


class DomainCoverage:
    """An immutable snapshot of ``GET /v1/domains``, with host matching built in.

    The endpoint is ``Cache-Control: max-age=300`` behind a strong ``ETag`` and
    clients are expected to revalidate rather than refetch, so a snapshot
    carries the ``etag`` that produced it. Pass it back to
    :meth:`OctogenClient.fetch_domain_coverage` and a ``304`` returns this same
    object.
    """

    __slots__ = (
        "_catalogs_by_host",
        "entries",
        "etag",
        "max_age_seconds",
        "retrieved_at",
    )

    def __init__(
        self,
        entries: Sequence[DomainEntry],
        *,
        etag: str | None = None,
        max_age_seconds: int | None = None,
        retrieved_at: datetime | None = None,
    ) -> None:
        self.entries: tuple[DomainEntry, ...] = tuple(entries)
        self.etag = etag
        self.max_age_seconds = max_age_seconds
        self.retrieved_at = retrieved_at or datetime.now(UTC)

        catalogs_by_host: dict[str, list[str]] = {}
        for entry in self.entries:
            # Normalize the server's side too. Today it only emits apex hosts,
            # but a `www.` entry appears in the published example; normalizing
            # both sides means such an entry still matches instead of becoming
            # a duplicate key nothing looks up.
            host = normalize_host(entry.host)
            if host is None:
                continue
            catalogs = catalogs_by_host.setdefault(host, [])
            if entry.catalog not in catalogs:
                catalogs.append(entry.catalog)
        self._catalogs_by_host = catalogs_by_host

    @property
    def hosts(self) -> tuple[str, ...]:
        """The normalized covered hosts — the raw set, for callers who want it."""
        return tuple(sorted(self._catalogs_by_host))

    def is_host_covered(self, url_or_host: str | None) -> bool:
        """Is this URL's merchant covered?

        Takes a full product URL or a bare host and normalizes it before
        comparing, so ``https://www.macys.com/shop/product/x`` matches the
        ``macys.com`` the server reports.
        """
        host = normalize_host(url_or_host)
        return host is not None and host in self._catalogs_by_host

    def catalogs_for(self, url_or_host: str | None) -> tuple[str, ...]:
        """Catalogs claiming this URL's host; empty when it is not covered."""
        host = normalize_host(url_or_host)
        if host is None:
            return ()
        return tuple(self._catalogs_by_host.get(host, ()))

    def is_stale(self, now: datetime | None = None) -> bool:
        """True once ``max-age`` has elapsed — revalidate with :attr:`etag`."""
        if self.max_age_seconds is None:
            return True
        moment = now or datetime.now(UTC)
        age = (moment - self.retrieved_at).total_seconds()
        return age >= self.max_age_seconds

    def __repr__(self) -> str:
        return (
            f"DomainCoverage(hosts={len(self._catalogs_by_host)}, "
            f"entries={len(self.entries)}, etag={self.etag!r})"
        )


def coverage_hosts(entries: Iterable[DomainEntry]) -> tuple[str, ...]:
    """Normalized hosts from raw ``/v1/domains`` entries, deduped and sorted."""
    return DomainCoverage(list(entries)).hosts
