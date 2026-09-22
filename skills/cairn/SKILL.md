---
name: cairn
description: Capture a prediction, choice, commitment or note into the Cairn ledger from a natural-language sentence. Quick tier commits in one exchange; full tier runs the fresh-context adversary first. Use when the user states an expectation, a decision, or a promise with a date. Not for resolving, reviewing or scoring (see cairn-resolve, cairn-review, cairn-score).
allowed-tools: Read, Bash(cairn:*), Bash(node:*), Agent
---

# Cairn capture

You turn one sentence into one ledger entry, fast. Scripts decide what is valid and
what is allowed; you decide what kind of thing the user said and ask only for what is
missing. The record is the user's; you never write it by hand.

**CLI.** `cairn` below means `node ../../tools/cli.mjs` relative to this file
(`${CLAUDE_PLUGIN_ROOT}/tools/cli.mjs` under a plugin install), or `cairn` if the
package is linked on PATH. State lives where the CLI resolves it (`CAIRN_HOME`, a
project `docs/cairn/`, or `~/.cairn`); never write under the plugin directory.

Read [references/kinds.md](references/kinds.md) for cues and required fields and
[references/bluntness.md](references/bluntness.md) for the dial before the first
capture in a session. Read the dial once: `cairn settings show --json` → `bluntness`
(default 1 if the command is unavailable).

## Flow

1. **Recognize.** Pick the kind from the sentence using the cues table. Say it in one
   line ("Reading this as a prediction.") so the user can correct it. Do not ask.
2. **Tier.** Quick unless the user asks for full, supplies reasoning, or gives an
   if-then. Say which and why in at most five words ("Full: reasoning given.").
   At dial 0 the tier is always quick: full requires an adversary pass and no role
   runs at 0. Say so in one line if the user asked for full.
3. **Gate.** Run `cairn gates check add --tier <tier> --kind <kind>`. Exit 3 means
   refused: show the `reasons` line verbatim. If the line says `full-tier capture
   blocked`, offer quick tier; if it says `overdue_gate=strict`, offer a note (the
   only kind that always passes). Never argue with the gate and never look for a
   way around it.
4. **Missing fields only.** Compare the sentence against the required fields for the
   kind and tier. Ask for every missing one in a single message, in table order, with
   the short meanings from kinds.md. Domain: use the settings' single domain if there
   is exactly one, else ask. Offer no other defaults.
5. **Adversary (full tier, dial ≥ 1).**
   - `cairn score --domain <d> --summary --json`
   - `cairn ledger related --domain <d> --kind <kind> --text "<text>" --json`
   - Spawn the `cairn-adversary` agent in a fresh context (the host's subagent tool;
     in Claude Code, the Agent tool with `subagent_type: cairn-adversary`). Its
     prompt contains exactly: the draft entry as JSON, the summary JSON, the related
     entries JSON, the line `bluntness: <level>`, and the full text of
     references/bluntness.md. Nothing from this conversation.
   - Show its four labelled outputs verbatim. Then ask exactly: "Commit as is,
     change the confidence, or drop it?" A changed confidence is the user's number,
     not one the adversary suggested (it must not have suggested one).
6. **Commit.** `cairn ledger add --kind <kind> [--tier full] … --json`. For full
   tier pass the adversary pass as `--adversary-json '<json>'` with `ran: true`,
   `at: <ISO now>`, and the four outputs under `other_side`, `failure_conditions`,
   `base_rate_question`, `record_question`. Print the id and the date it comes due,
   for example `p-20260922-k7q2 · due 2026-10-15`. Nothing else: no encouragement,
   no summary, no next steps.

Quick tier is one exchange when the sentence carries the required fields and two when
it does not. Do not run score, related, or the adversary at quick tier.

## Pending candidates

If `cairn pending list --json` exists and returns candidates (item 10), offer each one
before the new capture: confirm (run this flow with the text prefilled) or discard.
Never commit a candidate without the user's word.

## Refusals you pass through

- Exit 3 from any command: a gate. Show the reason, offer the allowed path.
- Exit 1 with "immutable": the user asked to edit a committed entry. Explain in one
  line that corrections are new entries and offer `--supersedes <id>`.
- Exit 1 with "corrupt": stop and show the line number; do not repair the file.
