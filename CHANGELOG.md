# Changelog

All notable changes to this repository.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The version
recorded here is the one in `package.json`, both plugin manifests, the marketplace
entry and `docs/roadmap/STATUS.md`, which must agree.

## Unreleased

Nothing yet.

## [0.1.0] — 2026-09-22

First release. Everything in [`docs/ROADMAP.md`](docs/ROADMAP.md) items 01–11.

- **Added** the durable plan: `docs/ROADMAP.md`, per-item specs under
  `docs/roadmap/`, `STATUS.md`, the resume protocol in `CONTRIBUTING.md`, the house
  rules in `DESIGN.md`, and `tools/check-status.mjs`, which fails a version bump that
  does not change STATUS.
- **Added** the append-only ledger (`tools/ledger.mjs`) with schema validation,
  tier derived from fields, derived status, and corrections by `--supersedes`.
- **Added** the three gates (`tools/gates.mjs`): full-tier capture refused while a
  full-tier entry is overdue, release requires a reason, a review cannot close over
  an undecided item.
- **Added** scores (`tools/score.mjs`): Brier by domain and kind, calibration
  buckets with folding, informativeness, release rate, process score, stake rate,
  drift against stated priorities; every statistic with its `n`, `insufficient`
  below five.
- **Added** `tools/debt.mjs` (the two-line debt form) and `tools/digest.mjs` (the
  review packet, labels only).
- **Added** the skills `/cairn`, `/cairn-resolve`, `/cairn-review`, `/cairn-score`,
  `/cairn-tune`, `/cairn-witness` and the roles `cairn-adversary`, `cairn-reviewer`,
  `cairn-witness`, all reading tone from one bluntness reference.
- **Added** settings as immutable revisions with undo (`tools/settings.mjs`), the
  SessionStart hook, the opt-in Stop-hook capture with `tools/pending.mjs`, and
  `tools/export.mjs` for markdown and CSV.
- **Added** packaging: Claude Code and Codex manifests, `install-cairn-codex.mjs`,
  `tools/check-packaging.mjs`, and a README walkthrough that runs as a test.
