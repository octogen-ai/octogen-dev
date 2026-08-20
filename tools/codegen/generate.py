#!/usr/bin/env python3
"""Emit committed SDK types from the published `/v1` OpenAPI contract.

Two things are generated, both committed so a contract change lands as a
reviewable diff rather than as a surprise at runtime:

* ``sdks/typescript/src/generated/types.ts`` — ``openapi-typescript``
* ``sdks/python/src/octogen_ai_sdk/generated/models.py`` — ``datamodel-code-generator``

The input is the **committed snapshot** at
``tests/fixtures/openapi/platform-v1.json``, not the network, so codegen is
reproducible offline and in CI. ``--fetch`` refreshes that snapshot from
``cdn.octogen.ai`` first; ``--check`` regenerates into a temporary directory and
fails when the committed output is stale.

Only the *types* are generated. The method layer in each SDK is hand-written —
see "Generated versus hand-written" in the repository README.
"""

from __future__ import annotations

import argparse
import filecmp
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

CONTRACT_URL = "https://cdn.octogen.ai/openapi/platform/v1/openapi.json"
SNAPSHOT = REPO_ROOT / "tests" / "fixtures" / "openapi" / "platform-v1.json"

TS_OUTPUT = REPO_ROOT / "sdks" / "typescript" / "src" / "generated" / "types.ts"
PY_OUTPUT = (
    REPO_ROOT / "sdks" / "python" / "src" / "octogen_ai_sdk" / "generated" / "models.py"
)

# Pinned so regeneration on two machines produces byte-identical output. The npm
# pin is in the root package-lock.json; this is the openapi-typescript binary
# name resolved from node_modules.
OPENAPI_TYPESCRIPT_BIN = REPO_ROOT / "node_modules" / ".bin" / "openapi-typescript"

BANNER = """/**
 * Generated from the published Octogen `/v1` OpenAPI contract. Do not edit.
 *
 * Regenerate with `npm run codegen` (the snapshot lives in
 * `tests/fixtures/openapi/platform-v1.json`). Only types are generated; the
 * method layer in `../client.ts` is hand-written.
 */
"""

PY_HEADER = '''"""Generated from the published Octogen ``/v1`` contract. Do not edit.

Regenerate with ``npm run codegen`` (or ``uv run --project sdks/python --frozen
python tools/codegen/generate.py``). The snapshot lives in
``tests/fixtures/openapi/platform-v1.json``.

Only types are generated. The method layer in :mod:`octogen_ai_sdk.client` is
hand-written; these models are what it validates against.
"""

'''


def _display(path: Path) -> str:
    """Repo-relative path when it is inside the repo, else the raw path.

    ``--check`` generates into a temporary directory, which is not.
    """
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def fetch_snapshot() -> None:
    """Refresh the committed contract snapshot from the CDN."""
    with urllib.request.urlopen(CONTRACT_URL, timeout=30) as response:  # noqa: S310
        spec = json.load(response)
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.write_text(
        json.dumps(spec, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"fetched {CONTRACT_URL} -> {_display(SNAPSHOT)}")


def generate_typescript(destination: Path) -> None:
    if not OPENAPI_TYPESCRIPT_BIN.exists():
        raise SystemExit(
            "openapi-typescript is not installed. Run `npm install` at the "
            "repository root first."
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            str(OPENAPI_TYPESCRIPT_BIN),
            str(SNAPSHOT),
            "--empty-objects-unknown",
            "--alphabetize",
        ],
        capture_output=True,
        text=True,
        check=True,
        cwd=REPO_ROOT,
    )
    # openapi-typescript writes its own provenance comment; replace it with one
    # that names the regeneration command a reader of this repo can run.
    body = result.stdout
    marker = "*/\n"
    if body.startswith("/**") and marker in body:
        body = body.split(marker, 1)[1]
    destination.write_text(BANNER + body.lstrip("\n"), encoding="utf-8")
    print(f"generated {_display(destination)}")


# Value-range keywords the Python mirror deliberately drops. A constrained
# scalar inside an `anyOf` makes `datamodel-code-generator` interpose a named
# root model (`Url4(RootModel[str])`), so `rejected[0].target.uuid` comes back
# as `Url4(root="…")` rather than a string — for every constrained field in
# every response. The mirror's job is the *shape* of a payload: field names,
# types, optionality. Range enforcement belongs to the server, and to the
# hand-written request models in `octogen_ai_sdk.models` for the rules worth
# catching locally. Structural keywords (`enum`, `required`,
# `additionalProperties`) are untouched.
_DROPPED_VALIDATION_KEYWORDS = frozenset(
    {
        "exclusiveMaximum",
        "exclusiveMinimum",
        "maxItems",
        "maxLength",
        "maximum",
        "minItems",
        "minLength",
        "minimum",
        "multipleOf",
        "pattern",
        "uniqueItems",
    }
)


def _without_validation_keywords(node: object) -> object:
    if isinstance(node, dict):
        return {
            key: _without_validation_keywords(value)
            for key, value in node.items()
            if key not in _DROPPED_VALIDATION_KEYWORDS
        }
    if isinstance(node, list):
        return [_without_validation_keywords(item) for item in node]
    return node


def generate_python(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "models.py"
        spec = Path(tmp) / "openapi.json"
        spec.write_text(
            json.dumps(
                _without_validation_keywords(
                    json.loads(SNAPSHOT.read_text(encoding="utf-8"))
                ),
                indent=2,
                sort_keys=True,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        subprocess.run(
            [
                sys.executable,
                "-m",
                "datamodel_code_generator",
                "--input",
                str(spec),
                "--input-file-type",
                "openapi",
                # Schemas only: the operation table is the hand-written
                # registry's job (see `octogen_ai_sdk.operations`), and the
                # conformance test checks it against this same snapshot.
                "--openapi-scopes",
                "schemas",
                "--output-model-type",
                "pydantic_v2.BaseModel",
                "--target-python-version",
                "3.11",
                "--snake-case-field",
                "--allow-population-by-field-name",
                # Enums as Literal unions rather than generated Enum classes:
                # inline enums otherwise get positional names (`Type`,
                # `Status1`) that churn whenever the contract gains a schema.
                "--enum-field-as-literal",
                "all",
                # `Annotated[str, Field(min_length=1)]` for a constrained
                # scalar. The two alternatives are both wrong here: bare
                # `constr(...)` is a function call in a type expression, which
                # `ty` rejects, and `--field-constraints` wraps the scalar in a
                # named root-model alias, so `rejected[0].target.uuid` would
                # come back as `Uuid1(root="…")` instead of a string.
                "--collapse-root-models",
                "--use-standard-collections",
                "--use-union-operator",
                # `extra` is NOT forced here: the contract sets
                # `additionalProperties: false` on `/v1` request bodies, so
                # request models inherit `extra="forbid"` and a misspelled key
                # fails locally instead of as a server 422.
                "--disable-timestamp",
                "--formatters",
                "ruff-format",
                "--output",
                str(raw),
            ],
            check=True,
            cwd=REPO_ROOT,
        )
        body = raw.read_text(encoding="utf-8")
    # Drop the generator's `filename:` provenance header — it records the
    # absolute temp path and would make the output non-reproducible.
    lines = [
        line for line in body.splitlines(keepends=True) if not line.startswith("#")
    ]
    destination.write_text(PY_HEADER + "".join(lines).lstrip("\n"), encoding="utf-8")
    print(f"generated {_display(destination)}")


def run_check() -> int:
    """Regenerate into a temp tree and report any drift from what's committed."""
    stale: list[Path] = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp_ts = Path(tmp) / "types.ts"
        tmp_py = Path(tmp) / "models.py"
        generate_typescript(tmp_ts)
        generate_python(tmp_py)
        for committed, fresh in ((TS_OUTPUT, tmp_ts), (PY_OUTPUT, tmp_py)):
            if not committed.exists() or not filecmp.cmp(
                committed, fresh, shallow=False
            ):
                stale.append(committed)
                print(f"\n--- drift in {_display(committed)} ---")
                subprocess.run(
                    ["diff", "-u", str(committed), str(fresh)],
                    check=False,
                )
    if stale:
        print(
            "\nGenerated types are stale. Run `npm run codegen` and commit the result.",
            file=sys.stderr,
        )
        return 1
    print("generated types are up to date")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="refresh the committed contract snapshot from cdn.octogen.ai first",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail instead of writing when the committed output is stale",
    )
    args = parser.parse_args()

    if args.fetch:
        fetch_snapshot()
    if not SNAPSHOT.exists():
        raise SystemExit(
            f"missing contract snapshot {_display(SNAPSHOT)}; run with --fetch"
        )
    if not shutil.which("diff") and args.check:
        print("warning: `diff` not found; drift will be reported without a patch")

    if args.check:
        return run_check()

    generate_typescript(TS_OUTPUT)
    generate_python(PY_OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
