"""Contract conformance for ``octogen-ai-sdk``.

The Python half of the cross-language suite; see the TypeScript sibling in
``tests/contract/typescript/conformance.test.ts``. Both read the same contract
snapshot and the same allowlist, and both assert in three directions:

1. Every published ``operationId`` has an SDK method.
2. Every SDK method calls the method and path the contract defines for it.
3. Every request-issuing method on the client is registered here, so a new one
   cannot be added without a contract check.

(2) does not read the source: it *calls* each method against a mock transport
and observes the request line. Both SDKs shipped a ``recrawl_products`` that
posted to ``/products/recrawl`` — a route that has never existed — and this
assertion fails on it.
"""

from __future__ import annotations

import json
import re
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, NamedTuple

import httpx
import pytest
from octogen_ai_sdk import OctogenClient

CONTRACT_ROOT = Path(__file__).resolve().parents[1]
CONTRACT = json.loads((CONTRACT_ROOT / "openapi" / "platform-v1.json").read_text())
ALLOWLIST = json.loads((CONTRACT_ROOT / "allowlist.json").read_text())

#: Stand-in for any path parameter. Chosen so the SDK's percent-encoding leaves
#: it untouched, which lets an observed path be turned back into the contract's
#: templated form.
PARAM = "__PARAM__"


def _published_operations() -> dict[str, str]:
    """``operationId`` -> ``"METHOD /templated/path"``."""
    operations: dict[str, str] = {}
    for route, item in CONTRACT["paths"].items():
        for method, operation in item.items():
            operation_id = operation.get("operationId")
            if operation_id:
                operations[operation_id] = f"{method.upper()} {route}"
    return operations


PUBLISHED = _published_operations()

ALLOWED_REQUESTS = {
    f"{method} {entry['path']}"
    for entry in ALLOWLIST["unpublishedPaths"]
    for method in entry["methods"]
}


class Invocation(NamedTuple):
    """How to reach one published operation through the SDK."""

    #: The ``OctogenClient`` method this operation is reached through. Method
    #: names are deliberately not the operation ids, so the mapping is written
    #: out rather than derived.
    client_method: str
    call: Callable[[OctogenClient], Awaitable[Any]]


INVOCATIONS: dict[str, Invocation] = {
    "listDomains": Invocation("list_domains", lambda c: c.list_domains()),
    "lookupProduct": Invocation(
        "lookup_product", lambda c: c.lookup_product("https://shop.example/p")
    ),
    "searchProducts": Invocation(
        "search_products", lambda c: c.search_products(q="dress")
    ),
    "moreLikeThisProducts": Invocation(
        "more_like_this_products",
        lambda c: c.more_like_this_products(source_url="https://shop.example/p"),
    ),
    "refreshProducts": Invocation(
        "refresh_products",
        lambda c: c.refresh_products(targets=[{"url": "https://shop.example/p"}]),
    ),
    "resolveProductFromHtml": Invocation(
        "resolve_product_from_html",
        lambda c: c.resolve_product_from_html(html="<html></html>"),
    ),
    "startVoyage": Invocation("start_voyage", lambda c: c.start_voyage("shop.example")),
    "listVoyages": Invocation("list_voyages", lambda c: c.list_voyages()),
    "getVoyage": Invocation("get_voyage", lambda c: c.get_voyage(PARAM)),
    "createUrlList": Invocation(
        "create_coverage_url_list",
        lambda c: c.create_coverage_url_list(name="contract-test"),
    ),
    "listUrlLists": Invocation(
        "list_coverage_url_lists", lambda c: c.list_coverage_url_lists()
    ),
    "getUrlList": Invocation(
        "get_coverage_url_list", lambda c: c.get_coverage_url_list(PARAM)
    ),
    "deleteUrlList": Invocation(
        "delete_coverage_url_list", lambda c: c.delete_coverage_url_list(PARAM)
    ),
    "addUrlListUrls": Invocation(
        "add_coverage_url_list_urls",
        lambda c: c.add_coverage_url_list_urls(PARAM, urls=["https://shop.example/p"]),
    ),
    "removeUrlListUrls": Invocation(
        "remove_coverage_url_list_urls",
        lambda c: c.remove_coverage_url_list_urls(
            PARAM, urls=["https://shop.example/p"]
        ),
    ),
    "checkUrlListUrls": Invocation(
        "check_coverage_url_list_urls",
        lambda c: c.check_coverage_url_list_urls(PARAM, urls=["https://shop.example/p"]),
    ),
    "listUrlListUrls": Invocation(
        "list_coverage_url_list_urls", lambda c: c.list_coverage_url_list_urls(PARAM)
    ),
}

#: Public client members that issue no request.
NOT_A_REQUEST = {"aclose"}


def _templatize(observed_path: str, contract_path: str) -> str:
    """Turn ``/voyage/__PARAM__`` back into the contract's ``/voyage/{task_id}``."""
    if PARAM not in observed_path:
        return observed_path
    names = re.findall(r"\{([^}]+)\}", contract_path)
    parts = observed_path.split(PARAM)
    result = parts[0]
    for index, part in enumerate(parts[1:]):
        name = names[index] if index < len(names) else None
        result += (PARAM if name is None else f"{{{name}}}") + part
    return result


async def _observe_one(operation_id: str) -> str:
    """Call one SDK method and return the ``"METHOD /templated/path"`` it issued."""
    observed: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        observed.append(f"{request.method} {request.url.path.removeprefix('/v1')}")
        return httpx.Response(200, json={})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = OctogenClient(api_key="key", http_client=http_client)
        try:
            await INVOCATIONS[operation_id].call(client)
        except Exception:  # noqa: BLE001 - the response body is deliberately not
            # a valid model for every operation; this suite asserts on the
            # *request*. The `len(observed) == 1` check below is what makes
            # swallowing safe: a method that never issued a request still fails.
            pass

    assert len(observed) == 1, (
        f"{operation_id} issued {len(observed)} requests; expected exactly 1"
    )
    contract_path = PUBLISHED.get(operation_id, " ").split(" ", 1)[1]
    method, _, path = observed[0].partition(" ")
    return f"{method} {_templatize(path, contract_path)}"


def test_contract_snapshot_is_the_one_this_sdk_targets() -> None:
    assert CONTRACT["info"]["version"] == "1.0.0"
    assert len(PUBLISHED) == 17


@pytest.mark.parametrize("operation_id", sorted(PUBLISHED))
def test_every_published_operation_has_an_sdk_method(operation_id: str) -> None:
    assert operation_id in INVOCATIONS, (
        f"{operation_id} is published at '{PUBLISHED[operation_id]}' but no "
        f"octogen-ai-sdk method calls it. A published operation with no SDK "
        f"method is a caller reaching for raw httpx."
    )


@pytest.mark.parametrize("operation_id", sorted(PUBLISHED))
async def test_every_sdk_method_calls_the_contract_path(operation_id: str) -> None:
    assert await _observe_one(operation_id) == PUBLISHED[operation_id]


@pytest.mark.parametrize("operation_id", sorted(PUBLISHED))
async def test_no_sdk_method_calls_an_undefined_path(operation_id: str) -> None:
    request = await _observe_one(operation_id)
    assert request in set(PUBLISHED.values()) or request in ALLOWED_REQUESTS, (
        f"{operation_id} called '{request}', which the published contract does "
        f"not define and tests/contract/allowlist.json does not allow."
    )


def test_every_request_issuing_client_method_is_contract_checked() -> None:
    registered = {invocation.client_method for invocation in INVOCATIONS.values()}
    unchecked = sorted(
        name
        for name in dir(OctogenClient)
        if not name.startswith("_") and name not in NOT_A_REQUEST | registered
    )
    assert unchecked == [], (
        f"these octogen-ai-sdk methods are not covered by a contract check: "
        f"{', '.join(unchecked)}. Add each to INVOCATIONS, or to NOT_A_REQUEST "
        f"if it issues no request."
    )
