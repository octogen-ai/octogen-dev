"""Host normalization, shared by the covered-domain helpers.

``GET /v1/domains`` returns hosts already normalized by the server —
lowercased, with a leading ``www.`` stripped — so it reports ``macys.com`` and
never ``www.macys.com``. Product URLs in the wild overwhelmingly *do* carry
``www.``, so comparing a raw URL host against that list reports a covered
merchant as uncovered: a silent false negative, not an error. Every comparison
in this SDK runs both sides through :func:`normalize_host` first.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Protocol, cast
from urllib.parse import urlsplit

_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*://", re.IGNORECASE)
_NOT_AN_AUTHORITY = re.compile(r"[/\s?#@]")
_BRACKETED = re.compile(r"^\[(?P<address>[^\]]+)\](?::\d+)?$")


def normalize_host(value: str | None) -> str | None:
    """Normalize a URL or bare host the way the server stores ``source_hosts``.

    Accepts a full URL (``https://www.Macys.com/p/x?y=1``) or a bare host
    (``www.MACYS.com:443``), and returns ``None`` when no host can be read, so
    an unparseable input can never accidentally match.
    """
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not candidate:
        return None

    host = _host_from_url(candidate)
    if host is None:
        host = _host_from_authority(candidate)
    if not host:
        return None

    # Lowercase before stripping `www.`, so `WWW.Macys.com` lands on the same
    # key as `www.macys.com`. A trailing dot is the fully-qualified form of the
    # same host.
    host = host.lower().rstrip(".").removeprefix("www.")
    return host or None


def is_host_covered(
    url_or_host: str | None,
    hosts: Iterable[str | DomainEntryLike | Mapping[str, object]],
) -> bool:
    """Is ``url_or_host`` covered by ``hosts``?

    Both sides are normalized, so this answers correctly for a ``www.`` URL
    against the apex-only list the server returns.

    ``hosts`` accepts host strings or the ``DomainEntry`` objects (and dicts)
    ``GET /v1/domains`` returns, because passing ``response.domains`` straight
    in is the obvious first call and a helper whose entire purpose is
    preventing a silent false negative must not answer ``False`` to it.
    Anything else raises :class:`TypeError`: the return value decides whether a
    caller ever asks about a merchant again, so a shape this does not
    understand has to be loud rather than falsey.

    Prefer :class:`~octogen_ai_sdk.domains.DomainCoverage` when you hold a
    whole snapshot — it indexes the set once instead of rescanning per call.
    """
    host = normalize_host(url_or_host)
    if host is None:
        return False
    return any(normalize_host(_host_of(candidate)) == host for candidate in hosts)


class DomainEntryLike(Protocol):
    """Anything carrying a ``host``, which is what ``GET /v1/domains`` returns."""

    @property
    def host(self) -> str: ...


def _host_of(candidate: object) -> str:
    if isinstance(candidate, str):
        return candidate
    if isinstance(candidate, Mapping):
        mapped = cast("Mapping[str, object]", candidate).get("host")
        if isinstance(mapped, str):
            return mapped
    else:
        attribute = getattr(candidate, "host", None)
        if isinstance(attribute, str):
            return attribute
    raise TypeError(
        "is_host_covered: every element of `hosts` must be a host string or "
        "carry a string `host` (a DomainEntry or an equivalent mapping). "
        f"Received: {type(candidate).__name__}"
    )


def _host_from_url(value: str) -> str | None:
    if not _SCHEME.match(value):
        return None
    try:
        hostname = urlsplit(value).hostname
    except ValueError:
        return None
    return hostname or None


def _host_from_authority(value: str) -> str | None:
    # A bare authority: `example.com`, `example.com:8443`, `[::1]:8443`. Reject
    # anything carrying a path or whitespace so a mangled URL is not read as a
    # host.
    if _NOT_AN_AUTHORITY.search(value):
        return None
    bracketed = _BRACKETED.match(value)
    if bracketed:
        return bracketed.group("address")
    host = value.split(":", 1)[0]
    return host or None
