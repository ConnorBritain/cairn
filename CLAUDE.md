@AGENTS.md

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
