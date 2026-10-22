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

## Using Cairn from Codex

- Install: `node install-cairn-codex.mjs` (this checkout as a plugin, the three
  roles as custom agents); verify with `--check`.
- Codex 0.163 reads the plugin's `hooks/hooks.json`, so the SessionStart debt line
  runs once the hook is trusted (`/hooks`). Until then, run `node tools/cli.mjs debt`
  when a session starts; it prints at most two lines and nothing when nothing is due.
  The opt-in Stop capture hook runs there too, but has not been checked against Codex's
  transcript format.
- The ritual skills (`cairn-review`, `cairn-score`, `cairn-tune`, `cairn-witness`) run
  only when asked by name: `disable-model-invocation` in Claude Code,
  `agents/openai.yaml` in Codex. Capture and resolve stay automatic.
- Skills call the tools by relative path (`tools/cli.mjs`); the roles are the
  custom agents `cairn-adversary`, `cairn-reviewer`, `cairn-witness`, invoked with
  only the inputs the skill names.

## Useful commands

- `node tools/check.mjs`
- `node tools/check-status.mjs [--staged]`
- `node tools/cli.mjs help`

<!-- kit:begin gestalt-flow -->
## Way of work   <!-- gestalt -->

Order: orient → intend → plan → make → check → record. Checkers report; they never fix. Give every worker and critic the user's original request verbatim and the decisions made since.
- (Codex) At session start run `cairn debt`; it prints nothing when nothing is due.
- Route drafting or revising prose in my voice, in any repo → `sh ~/.gestalt/build/workers/prose.sh "<task>"`.
- Route the daily check-in, or anything that reads or updates Linear → the `linear` subagent.

Soft rules (the harness cannot enforce these):
- Do not use linear in this repository.
<!-- kit:end gestalt-flow -->

<!-- kit:begin gestalt-plugin -->
### In plugin (.claude-plugin/plugin.json present)   <!-- gestalt -->
- Before calling non-trivial work done: verification-gate gates (hook) → elonify diff-review (hook) ∥ verification-gate critics; when Stop hooks fire together, answer in that order, then compounder stop-lines, then platform git-check.
- On elonify diff-review REFRAME: once the user has decided, offer /cairn to log it as a choice.
<!-- kit:end gestalt-plugin -->
