# AGENTS.md

This repo is workable from Codex or Claude Code without repo-specific bootstrapping.

## What this repo is

`cairn` is a decision and prediction ledger: a dependency-free Node CLI (`tools/`),
model roles that run in clean context (`agents/`), slash-command skills (`skills/`)
and two hooks (`hooks/`). The user's state lives in `~/.cairn` or a project's
`docs/cairn/`, never here.

## Before doing anything

Read [`docs/ROADMAP.md`](docs/ROADMAP.md) and [`docs/roadmap/STATUS.md`](docs/roadmap/STATUS.md),
then follow **Resuming work** in [`CONTRIBUTING.md`](CONTRIBUTING.md). Take the first
unchecked item. The house rules in [`DESIGN.md`](DESIGN.md) override any spec.

## Working agreements

- Scripts count; models judge. Never have a role estimate a number a tool computes.
- The ledger is append-only. No tool, test or fix rewrites a committed line.
- Roles have `tools: []` and receive their inputs in the prompt.
- No dependencies. No GitHub Actions. `node tools/check.mjs` is the gate.
- Tests set `CAIRN_HOME` to a temp directory. Never touch a real `~/.cairn`.
- STATUS ticks in the same commit as the deliverable. Version bumps need a STATUS change.

## Useful commands

- `node tools/check.mjs`
- `node tools/check-status.mjs [--staged]`
