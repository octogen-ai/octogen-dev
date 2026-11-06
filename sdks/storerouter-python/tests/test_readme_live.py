"""Run every Python example in README.md against the live API.

Skipped without ``STOREROUTER_API_KEY``. The README promises real output, so
this keeps each example runnable as the API evolves; it checks that the code
runs, not that the printed values still match the README byte for byte.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import pytest

README = Path(__file__).resolve().parents[1] / "README.md"
_PYTHON_BLOCK = re.compile(r"```python\n(.*?)```", re.DOTALL)

pytestmark = pytest.mark.skipif(
    not os.environ.get("STOREROUTER_API_KEY"),
    reason="live README examples need STOREROUTER_API_KEY",
)


def test_readme_examples_run_in_order() -> None:
    blocks = _PYTHON_BLOCK.findall(README.read_text())
    assert len(blocks) >= 5
    namespace: dict[str, object] = {"__name__": "readme"}
    try:
        for block in blocks:
            exec(compile(block, str(README), "exec"), namespace)  # noqa: S102
    finally:
        client = namespace.get("client")
        close = getattr(client, "close", None)
        if callable(close):
            close()
