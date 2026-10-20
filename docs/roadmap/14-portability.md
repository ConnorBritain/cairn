# 14 · portability

**Goal.** Cairn installs in Cursor and in any harness that reads the Agent Plugins
manifest, and its always-on cost drops in every harness, without weakening a house rule.

## Harness facts (2026-10-20)

- **Codex 0.163** reads `.codex-plugin/plugin.json` and the plugin's `hooks/hooks.json`.
  Plugin hooks run only after the user trusts them (`/hooks`). SessionStart accepts
  `hookSpecificOutput.additionalContext`, which is what `hooks/session-start.mjs`
  writes, so the debt line works there unchanged. A skill's `agents/openai.yaml` with
  `policy.allow_implicit_invocation: false` keeps Codex from invoking it implicitly.
  Plugin `agents/*.md` are not loaded; the installer's custom agents remain the route.
- **Cursor** (cursor/plugins schema at 29fa938): `.cursor-plugin/plugin.json` takes
  `skills`, `agents`, `rules` and `hooks` paths; `author` allows `name` and `email` only.
  No SessionStart hook is verified, so the debt line becomes an always-applied rule that
  asks the agent to run `cairn debt`. That is advisory, and the README says so.

## Deliverables

1. `.cursor-plugin/plugin.json` (skills, agents, rules) and `rules/cairn.mdc`.
2. `.plugin/plugin.json`, the generic manifest.
3. `disable-model-invocation: true` and `agents/openai.yaml` on `cairn-review`,
   `cairn-score`, `cairn-tune`, `cairn-witness`. `cairn` and `cairn-resolve` stay
   automatic: capture and resolution are triggered by what the user says.
4. The debt line names the skill: `review due (cairn-review)`, since the model can no
   longer reach it without being asked. No slash: Claude Code types `/cairn-review`,
   Codex mentions `$cairn-review`, and the hook text is the same in both.
5. README and AGENTS.md: Codex runs the SessionStart hook once trusted; Cursor's debt line
   is a rule.
6. `tools/check-packaging.mjs` pins the Cursor and generic manifests: name, version,
   repository, Cursor author keys, and that every path the Cursor manifest names exists.

## Acceptance

`node tools/check.mjs` green; five manifests and the marketplace entry at 0.3.0;
STATUS and CHANGELOG at 0.3.0.

## Not in scope

A Cursor port of the opt-in Stop capture hook: it reads Claude Code's transcript format,
and Cursor's transcript has not been examined. Under Codex the same hook runs once trusted;
its transcript is Codex's own format, which the scanner was not written for and has not
been run against. Reading Codex transcripts is later work.

## Status

done
