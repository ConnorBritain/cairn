# 09 · instrument

**Goal.** The dial and the rest of the instrument surface: settings with undo, the
SessionStart hook, `/cairn-score`, `/cairn-tune`, export.

## Files

```
tools/lib/settings-core.mjs   schema, defaults, apply, undo (pure)
tools/lib/settings-store.mjs  revisions/ + current.json, lock, atomic pointer
tools/settings.mjs            CLI: cairn settings show|set k=v…|undo|history [--json]
hooks/hooks.json
hooks/session-start.mjs
tools/export.mjs              CLI: cairn export ledger|scores --format md|csv [--out path]
skills/cairn-score/SKILL.md
skills/cairn-score/references/explain.md
skills/cairn-tune/SKILL.md
tests/settings.mjs  tests/hooks.mjs  tests/export.mjs
```

## Settings

```json
{ "schema": "cairn-settings/1", "revision": 3, "parent_digest": "…",
  "bluntness": 1, "domains": ["work", "health"], "review_cadence_days": 7,
  "witnesses": [ { "name": "Sam", "note": "weekly call" } ], "capture_hook": false }
```

Defaults: bluntness 1, domains [], cadence 7, witnesses [], capture_hook false.
Validation: bluntness integer 0–3; cadence integer 1–90; domain names
`^[a-z0-9-]{1,32}$`.

Store, following vonnegut's preference store: each revision is an immutable file
`revisions/000003-<sha256>.json`; `current.json` points at one; writes take an
exclusive `.writer.lock`; the pointer is replaced atomically via rename. `undo` writes
revision n+1 equal to the parent of n. `history` lists revisions with what changed.

## SessionStart hook

`hooks.json` registers `node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs"` with a
10 s timeout. The script:

1. Reads hook input from stdin for `cwd`; falls back to `CLAUDE_PROJECT_DIR`,
   `CODEX_PROJECT_DIR`, `process.cwd()`.
2. Imports `../tools/lib/debt-core.mjs` and `../tools/lib/store.mjs` relatively.
3. Prints the two-line text form as `additionalContext`; prints nothing when debt is
   empty.
4. Any error → emit nothing, exit 0.

Codex: the same script is documented in `AGENTS.md` as a command to run at session
start (`cairn debt`), since Codex hooks are not assumed.

## `/cairn-score`

Runs `cairn score [--domain d] --json`, renders a table per domain, and explains
Brier and calibration in plain words from `references/explain.md` (a fixed text with
placeholders for the user's numbers). Marks every `insufficient` statistic as "not
enough resolved entries yet (n of 5)". No model computes or restates a number. At dial
≥ 2 the skill adds the one-sentence gap statement per domain; at 3 it leads with it.

## `/cairn-tune`

Shows current settings and the revision. Applies `cairn settings set …`, shows the
new revision and the undo command. Bluntness changes print the row from
`bluntness.md` for the new level.

## Export

`cairn export ledger --format md` writes a markdown table of entries with derived
status and resolution; `--format csv` one row per entry with resolution columns.
`cairn export scores --format md|csv` writes the score object flattened. Default out
path `<state>/exports/<name>-<date>.<ext>`; `--out -` for stdout.

## Tests

- Settings: set, validate, undo, history, lock contention, digest mismatch detection.
- Hook: no state dir; empty ledger; one overdue; one due; malformed ledger; missing
  module (simulated by a bad relative path in a copy) → all exit 0, correct output or
  silence.
- Export: CSV row count = entry count; markdown contains every id; scores CSV has one
  row per statistic.
- Skill files reference only existing commands.

## Status

planned
