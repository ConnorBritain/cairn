# 11 · release

**Goal.** Installable from a clone in either host, with a five-minute walkthrough that
ends in a scored prediction. Version 0.1.0.

## Files

```
README.md                          full: what it is, install (Claude Code, Codex), the walkthrough, the numbers explained, known limits
tools/check-packaging.mjs
install-cairn-codex.mjs
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
.codex-plugin/plugin.json
CHANGELOG.md                       0.1.0 entry
```

## Packaging check

Asserts, stdlib only:

- `package.json` version equals `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
  the marketplace entry, and STATUS `Last version:`.
- Every path in `plugin.json` `agents` / `skills` / `hooks` exists.
- Every `skills/*/SKILL.md` has `name` and `description`; every `agents/*.md` has
  `name`, `description`, `tools: []`.
- Every relative markdown link in maintained docs resolves (vonnegut's link walk).
- No `.github/workflows` directory.
- `hooks/hooks.json` references only files under `hooks/`.

## Codex installer

`install-cairn-codex.mjs` mirrors vonnegut's: installs this checkout as a Codex plugin
and renders the three agents as custom agents under `CODEX_HOME/agents` with a
generated-by marker; `--check` verifies; refuses to overwrite a user-modified file.

## README walkthrough

Runs as written in a temporary `CAIRN_HOME`:

```
cairn ledger add --kind prediction --text "…" --confidence 70 --resolve-by <tomorrow> --criterion "…" --domain demo
cairn debt
cairn ledger resolve <id> --outcome true --stake-honored n/a
cairn score --domain demo
```

The last command shows Brier for one entry and `insufficient` for calibration, which
the README explains is the point: the numbers earn trust with `n`.

## Acceptance

- `node tools/check.mjs` runs `check-status`, `check-packaging`, and every `tests/*.mjs`.
- Walkthrough executed in a test (`tests/walkthrough.mjs`) against a temp home.
- One commit bumps `package.json`, both manifests, marketplace, CHANGELOG and STATUS
  `Last version:` to 0.1.0 and ticks item 11.

## Status

planned
