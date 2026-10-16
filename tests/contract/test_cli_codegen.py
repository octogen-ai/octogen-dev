"""Exercise schema mutations at the actual generation boundary."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
module_spec = importlib.util.spec_from_file_location(
    "cli_contract", ROOT / "tools/codegen/cli_contract.py"
)
assert module_spec is not None and module_spec.loader is not None
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)


def document() -> dict:
    return json.loads((ROOT / "tests/fixtures/openapi/platform-v1.json").read_text())


def test_cli_projection_matches_committed_output() -> None:
    assert (
        module.render(document())
        == (ROOT / "cli/src/generated/contract.ts").read_text()
    )


def test_request_changes_regenerate_artifact_even_without_version_bump() -> None:
    spec = document()
    original = module.render(spec)
    field = spec["components"]["schemas"]["ProgrammaticProductSearchRequest"][
        "properties"
    ]["limit"]
    for key, value in (
        ("default", 7),
        ("minimum", 2),
        ("maximum", 80),
        ("type", "number"),
        ("description", "New help"),
    ):
        field[key] = value
        assert module.render(spec) != original
        original = module.render(spec)


def test_new_validation_keywords_require_validator_support() -> None:
    spec = document()
    spec["components"]["schemas"]["ProgrammaticProductSearchRequest"]["properties"][
        "q"
    ]["pattern"] = "^[a-z]+$"
    with pytest.raises(ValueError, match="pattern"):
        module.render(spec)


def test_new_and_removed_operations_change_projection() -> None:
    spec = document()
    original = module.render(spec)
    spec["paths"]["/new"] = {"get": {"operationId": "newPublicOperation"}}
    assert '"newPublicOperation"' in module.render(spec)
    del spec["paths"]["/products/search"]
    assert module.render(spec) != original
    assert '"searchProducts"' not in module.render(spec)
