#!/usr/bin/env python3
"""Validate and package the Octogen plugin without credentials or network access."""

from __future__ import annotations

import argparse
import json
import re
import struct
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

REPO_ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = REPO_ROOT / "plugins" / "octogen"
FILES = (
    "README.md",
    "assets/octogen-mark.png",
    "mcp.json",
    "plugin.json",
    "skills/product-discovery/SKILL.md",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def package(output_dir: Path) -> Path:
    output_dir = output_dir.resolve()
    require(
        not output_dir.is_relative_to(PLUGIN_ROOT.resolve()),
        "Write the archive outside the plugin directory.",
    )
    paths = list(PLUGIN_ROOT.rglob("*"))
    require(not any(p.is_symlink() for p in paths), "Do not package symlinks.")
    actual = {p.relative_to(PLUGIN_ROOT).as_posix() for p in paths if p.is_file()}
    require(actual == set(FILES), f"Unexpected or missing package files: {actual}")

    manifest = json.loads((PLUGIN_ROOT / "plugin.json").read_text(encoding="utf-8"))
    require(
        manifest["$schema"]
        == "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        "Use the Agent Plugins 1.0 manifest schema.",
    )
    require(
        manifest["name"] == PLUGIN_ROOT.name, "Manifest name must match its folder."
    )
    require(
        re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", manifest["version"])
        is not None,
        "Use a stable semantic version.",
    )
    require(
        not {"skills", "mcpServers", "apps", "interface"}.intersection(manifest),
        "Keep portable skills and MCP config at their fixed paths.",
    )
    interface = manifest["extensions"]["com.openai"]["interface"]
    require(len(interface["shortDescription"]) <= 30, "Subtitle exceeds 30 characters.")
    prompts = interface["defaultPrompt"]
    prompts = [prompts] if isinstance(prompts, str) else prompts
    require(
        isinstance(prompts, list)
        and 1 <= len(prompts) <= 3
        and all(isinstance(p, str) and len(p) <= 128 for p in prompts),
        "Use one to three prompts of at most 128 characters each.",
    )
    for field in ("logo", "composerIcon"):
        require(
            interface[field] == "./assets/octogen-mark.png",
            f"{field} must reference the packaged Octogen logo.",
        )

    mcp = json.loads((PLUGIN_ROOT / "mcp.json").read_text(encoding="utf-8"))
    require(
        mcp
        == {
            "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
            "mcpServers": {
                "octogen": {
                    "type": "streamable-http",
                    "url": "https://mcp.octogen.ai/mcp",
                }
            },
        },
        "Use the canonical Streamable HTTP endpoint without embedded credentials.",
    )
    skill = (PLUGIN_ROOT / FILES[-1]).read_text(encoding="utf-8")
    require(
        skill.startswith("---\nname: product-discovery\ndescription: ")
        and "\n---\n" in skill,
        "Skill frontmatter must name product-discovery and describe its trigger.",
    )
    logo = (PLUGIN_ROOT / "assets" / "octogen-mark.png").read_bytes()
    require(logo[:8] == b"\x89PNG\r\n\x1a\n" and len(logo) >= 33, "Logo must be a PNG.")
    width, height = struct.unpack(">II", logo[16:24])
    require(
        width == height and 48 <= width <= 4096, "Logo must be square, 48..4096 px."
    )
    require(len(logo) <= 10_000, "Keep the supplied logo within the 10 KB budget.")

    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / f"octogen-plugin-{manifest['version']}.zip"
    with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as zipped:
        for relative in FILES:
            # Fixed timestamps and permissions make output independent of the checkout.
            info = ZipInfo(f"octogen/{relative}", date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            zipped.writestr(info, (PLUGIN_ROOT / relative).read_bytes())
    with ZipFile(archive) as zipped:
        require(zipped.testzip() is None, "ZIP integrity check failed.")
        for relative in FILES:
            require(
                zipped.read(f"octogen/{relative}")
                == (PLUGIN_ROOT / relative).read_bytes(),
                f"ZIP content mismatch: {relative}",
            )
    print(f"Packaged {len(FILES)} files: {archive} ({archive.stat().st_size} bytes)")
    return archive


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=REPO_ROOT / "dist")
    args = parser.parse_args()
    package(args.output_dir)


if __name__ == "__main__":
    main()
