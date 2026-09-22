# 13 · live-verification

**Goal.** A repeatable way to prove the plugin installs and the skills and roles
behave in a real Claude Code or Codex session, kept out of `tools/check.mjs`, which
stays free of CLIs and model calls.

## Three layers, all opt-in

1. **`tools/check-installation.mjs`** — installs into isolated configuration
   directories and makes no model calls. Needs `claude` and/or `codex` on PATH;
   skips a missing CLI with a printed line and fails only if neither is present.
   - Claude Code: `CLAUDE_CONFIG_DIR=<temp>`; `claude plugin marketplace add <root>`;
     `claude plugin install cairn@cairn --scope user`; `claude plugin list --json`
     shows the entry enabled with no errors; the installed path contains
     `skills/cairn/SKILL.md`, `agents/cairn-adversary.md`, `hooks/hooks.json`; and
     `node <installPath>/tools/cli.mjs debt` runs against a temp `CAIRN_HOME`, which
     proves the relative tool paths survive the install.
   - Codex: `CODEX_HOME=<temp>`; `install-cairn-codex.mjs --agents-only` then
     `--check --agents-only`; the plugin path only when `codex` is present.
   - Temp directories are removed in `finally`.
2. **`tools/live-smoke.mjs --yes`** — real model calls; refuses without `--yes` and
   prints the cost warning first. Each case gets a fresh `CAIRN_HOME` and
   `CLAUDE_CONFIG_DIR`. Claude Code runs
   `claude -p "<prompt>" --plugin-dir <root> --output-format stream-json --verbose
   --no-session-persistence --setting-sources "" --permission-mode dontAsk
   --allowedTools "Bash(node *)" "Bash(cairn *)" Read Agent`. `CLAUDE_CONFIG_DIR` is
   not overridden (that would drop the CLI's credentials); isolation is the empty
   setting sources plus a temp `CAIRN_HOME`, as vonnegut's runtime does it.
   Assertions are on the ledger file and the tool-call stream, never on prose:
   | Case | Prompt | Asserts |
   |---|---|---|
   | `capture-quick` | `/cairn I think the vendor ships the API by <date>, 70%` | one `entry`, prediction, confidence 70, tier quick; no `Agent` call |
   | `capture-full-adversary` | full tier with reasoning | an `Agent` call naming `cairn-adversary`; entry `adversary.ran` true; the adversary text has no recommendation phrase |
   | `gate-blocks` | full-tier capture with a seeded full-tier overdue entry | ledger byte-identical; a Bash call to `gates check add` exited 3 |
   | `hook-context` | any, with a seeded overdue entry | reported, not asserted: SessionStart in `-p` is not documented |
   Codex runs the same three through `codex exec --json --ephemeral
   --skip-git-repo-check -C <root>` with a temp `CODEX_HOME` the installer populated,
   asserting on the ledger only. Output: one `PASS`/`FAIL`/`SKIP` line per case, exit
   1 on any `FAIL`.
3. **`evals/`** for `claude plugin eval` (model calls, run by hand): `capture-quick`
   (`tool_used` Skill `cairn`), `capture-full` (`tool_used` Agent naming
   `cairn-adversary`), `no-recommendation` (`regex` negative match on recommendation
   phrases plus an `llm` rubric that fails if the reply picks an option or a
   confidence).

## Files

`tools/check-installation.mjs`, `tools/live-smoke.mjs`, `tools/lib/live-core.mjs`
(pure: stream-json parsing to `{ toolCalls, texts, result }`, the case table, the
assertions) with `tests/live-core.mjs` over hand-written fixture streams in
`tests/fixtures/stream-*.jsonl`; `evals/<case>/prompt.md` and `graders/*.md`;
CONTRIBUTING "Live verification" section; README Development paragraph;
`tools/check-packaging.mjs` checks each eval case has frontmatter and a grader and
that `package.json` `files` lists the new tools. Version 0.2.0 in package.json, both
manifests, the marketplace entry, CHANGELOG and STATUS.

## Acceptance

- `tests/live-core.mjs` passes on the fixture streams, so the smoke's logic is
  tested where the CLIs are not.
- Both scripts skip a missing CLI with a line; the smoke refuses without `--yes`.
- `node tools/check.mjs` never invokes `claude` or `codex`.

## Status

done
