---
name: cairn-resolve
description: Resolve or release a Cairn ledger entry when its date arrives or the outcome is known, enforcing the gates (release needs a reason). Use when the user says a prediction came true or false, a criterion was met, a commitment was kept or missed, or wants to drop an entry. Not for capture (cairn) or the weekly review (cairn-review).
allowed-tools: Read, Bash(cairn:*), Bash(node:*)
---

# Cairn resolve

You close one entry against its own pre-registered terms. The criterion, confidence,
if-then and date were frozen at capture; you show them back, take the outcome, and
let the script score it. No role runs here.

**CLI.** `cairn` below means `node ../../tools/cli.mjs` relative to this file
(`${CLAUDE_PLUGIN_ROOT}/tools/cli.mjs` under a plugin install), or `cairn` if linked.
Read the dial once: `cairn settings show --json` → `bluntness` (default 1 if the
command is unavailable); phrasing rules are in
[../cairn/references/bluntness.md](../cairn/references/bluntness.md).

## Flow

1. **Identify.** If the user gave an id, use it. Otherwise
   `cairn ledger list --status open --json` and `--status overdue --json`, match on
   text, and confirm the id in one line. Never guess between two candidates; show
   both lines and ask.
2. **Show the frozen terms.** `cairn ledger show <id>`. Print criterion, confidence,
   if-then (if any) and the date, verbatim. These are what the outcome is judged
   against, not the user's memory of them.
3. **Take the outcome.** Ask for the label for the kind: prediction `true|false`;
   choice `yes|partial|no` (was the criterion met); commitment `kept|missed`; note
   `true|false`. If the entry has an if-then, also ask `stake honored: yes|no` (was
   the if-then carried out). Ask for an optional one-line reflection. One message.
4. **Resolve.** `cairn ledger resolve <id> --outcome <label> [--stake-honored yes|no]
   [--reflection "…"] --json`. Print:
   - `outcome_score` with one sentence: "Brier: squared distance between your
     confidence and what happened; 0 is perfect, 0.25 is a coin flip, 1 is certain
     and wrong."
   - `process_score` with one sentence: "Process: how many of adversary, criterion,
     reasoning were on the entry, out of three."
   - The dial-dependent line, from the bluntness reference: at 0 nothing more; at 1
     one question about the gap between confidence and outcome; at 2 the gap stated
     in numbers, then the question; at 3 the gap first, no framing.
5. **Release path.** If the user wants to drop the entry instead:
   `cairn ledger release <id> --reason "…"`. Exit 3 means no reason was given; show
   the gate's line and ask for the reason. Do not supply one.
6. **Later reflection.** `cairn ledger reflect <id> --text "…"` appends; nothing is
   edited.

## Refusals you pass through

- "it is resolved / released / superseded": the entry is closed. Show its
  resolution via `cairn ledger show <id>` and stop.
- "stake-honored yes|no required": the entry has an if-then; ask.
- Exit 1 with "corrupt": stop and show the line number; do not repair the file.

Say nothing about what the user should have predicted. The numbers and the question
are the whole output.
