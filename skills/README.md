# Agent Skills

Skills and agent instructions for building with the Octogen AI commerce platform.

Keep runtime-specific files in separate directories:

- `codex/`
- `claude/`
- `cursor/`

Shared platform context should live in `docs/guides/` and be referenced from each skill where possible.

`storerouter/SKILL.md` is the CLI's agent skill. `storerouter skill` prints the
copy bundled at build time; edit it here, then run `npm run codegen`.
