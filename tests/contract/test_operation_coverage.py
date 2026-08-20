"""Contract conformance: the SDK's routing table versus the published contract.

The Python half of the same check ``operation-coverage.test.ts`` runs, over the
same committed snapshot. Failing in either direction is a hard failure, with
**no allowlist**:

* a published ``operationId`` with no SDK method is an operation callers cannot
  reach through the SDK, and
* an SDK method calling a path the contract does not define is a guaranteed 404
  at runtime.

Brands were deferred from CLI v1 on 2026-08-20, so there is no unpublished
surface left for an SDK method to legitimately call. This test is what makes
``POST /products/recrawl`` — shipped in both SDKs, never a real route —
impossible to reintroduce.

The three assertions together pin each routing table to *exactly* the published
operation set, so the two SDKs are held to each other transitively without
either test having to read the other language's source.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, NamedTuple

from octogen_ai_sdk.operations import OPERATIONS

REPO_ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = REPO_ROOT / "tests" / "fixtures" / "openapi" / "platform-v1.json"

CONTRACT_URL = "https://cdn.octogen.ai/openapi/platform/v1/openapi.json"

HTTP_METHODS = (
    "delete",
    "get",
    "head",
    "options",
    "patch",
    "post",
    "put",
    "trace",
)


class PublishedOperation(NamedTuple):
    operation_id: str
    method: str
    path: str

    def __str__(self) -> str:
        return f"{self.operation_id} ({self.method} {self.path})"


def read_snapshot() -> dict[str, Any]:
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def published_operations(document: dict[str, Any]) -> list[PublishedOperation]:
    operations = [
        PublishedOperation(operation["operationId"], method.upper(), path)
        for path, path_item in document.get("paths", {}).items()
        for method in HTTP_METHODS
        if isinstance(operation := path_item.get(method), dict)
        and "operationId" in operation
    ]
    return sorted(operations)


PUBLISHED = published_operations(read_snapshot())
DECLARED = [
    PublishedOperation(operation_id, operation.method, operation.path)
    for operation_id, operation in OPERATIONS.items()
]


def test_snapshot_is_a_usable_contract() -> None:
    document = read_snapshot()
    assert isinstance(document.get("info", {}).get("version"), str)
    assert PUBLISHED


def test_published_operation_ids_are_unique() -> None:
    ids = [operation.operation_id for operation in PUBLISHED]
    assert len(set(ids)) == len(ids)


def test_every_published_operation_has_an_sdk_method() -> None:
    declared_ids = {operation.operation_id for operation in DECLARED}
    missing = [str(op) for op in PUBLISHED if op.operation_id not in declared_ids]
    assert not missing, "published operations with no SDK method:\n  " + "\n  ".join(
        missing
    )


def test_no_sdk_method_calls_an_unpublished_path() -> None:
    published_ids = {operation.operation_id for operation in PUBLISHED}
    unknown = [str(op) for op in DECLARED if op.operation_id not in published_ids]
    assert not unknown, (
        "SDK methods naming an operation the contract does not publish:\n  "
        + "\n  ".join(unknown)
    )


def test_verbs_and_paths_agree_with_the_contract() -> None:
    published_by_id = {op.operation_id: op for op in PUBLISHED}
    mismatched = [
        f"{op.operation_id}: SDK calls {op.method} {op.path}, "
        f"contract publishes {expected.method} {expected.path}"
        for op in DECLARED
        if (expected := published_by_id.get(op.operation_id)) is not None
        and (expected.method, expected.path) != (op.method, op.path)
    ]
    assert not mismatched, "\n  ".join(mismatched)
