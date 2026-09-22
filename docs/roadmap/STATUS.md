# Status

Last version: 0.1.0

Take the first unchecked item, in order. Tick it in the same commit that lands it.
`tools/check-status.mjs` fails when `package.json` bumps without this file changing,
and when `Last version:` above disagrees with `package.json`.

- [x] 01 plan — ROADMAP, specs, STATUS, CONTRIBUTING resume protocol, check scripts
- [x] 02 schema-ledger — `tools/lib/schema.mjs`, `tools/lib/store.mjs`, `tools/ledger.mjs`, `tests/ledger.mjs`
- [x] 03 gates — `tools/gates.mjs`, `tests/gates.mjs`, wired into `ledger.mjs`
- [x] 04 score — `tools/score.mjs`, `tools/lib/score-core.mjs`, `tests/fixtures/`, `tests/score.mjs`
- [x] 05 debt — `tools/debt.mjs`, `tests/debt.mjs`
- [x] 06 digest — `tools/digest.mjs`, `tests/digest.mjs`
- [x] 07 capture — `skills/cairn/`, `agents/cairn-adversary.md`, `skills/cairn/references/bluntness.md`
- [x] 08 resolve-review — `skills/cairn-resolve/`, `skills/cairn-review/`, `agents/cairn-reviewer.md`, `ledger.mjs review`
- [x] 09 instrument — `tools/settings.mjs`, `hooks/`, `skills/cairn-score/`, `skills/cairn-tune/`, `tools/export.mjs`, tests
- [x] 10 optional — `hooks/stop-capture.mjs`, `tools/pending.mjs`, `agents/cairn-witness.md`, tests
- [x] 11 release — README walkthrough, `tools/check-packaging.mjs`, manifests, Codex installer, 0.1.0
