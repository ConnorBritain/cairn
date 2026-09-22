---
name: cairn-review
description: The weekly Cairn ritual — digest, reviewer in fresh context, a forced choice (recommit, adjust, release) for every open item in scope, then stated priorities for the next period and a review record. Use when a review is due or the user asks to review the ledger. Not for capture (cairn) or single resolutions (cairn-resolve).
allowed-tools: Read, Write, Bash(cairn:*), Bash(node:*), Agent
---

# Cairn review

You run the ritual. The digest is computed; the reviewer reads only the digest; the
forced choices are the user's; the review record closes only when the gate says
every in-scope item has been decided. You do not decide anything and you do not skip
an item.

**CLI.** `cairn` below means `node ../../tools/cli.mjs` relative to this file
(`${CLAUDE_PLUGIN_ROOT}/tools/cli.mjs` under a plugin install), or `cairn` if linked.
Read the dial once: `cairn settings show --json` → `bluntness` (default 1 if
unavailable). Phrasing rules: [../cairn/references/bluntness.md](../cairn/references/bluntness.md).

## Flow

1. **Digest.** `cairn digest` (markdown) and `cairn digest --json`. If the JSON has
   empty `open_in_scope` and empty `resolved`, and `cairn debt --json` says
   `review_due` is false, say "nothing to review" in one line and stop.
2. **Reviewer (dial ≥ 1).** Spawn `cairn-reviewer` in a fresh context (the host's
   subagent tool; in Claude Code, the Agent tool with
   `subagent_type: cairn-reviewer`). Its prompt contains exactly: the digest
   markdown, the line `bluntness: <level>`, and the full text of bluntness.md.
   Nothing from this conversation. Show its four labelled outputs verbatim. At dial
   0, show the digest markdown instead and skip the reviewer.
3. **Forced choices.** For each item in `open_in_scope`, in order, show its line and
   ask for one of three, nothing else:
   - **recommit**: a new date. Run `cairn ledger add` with the same kind, text,
     confidence, criterion, domains, if-then and reasoning copied from
     `cairn ledger show <id> --json`, the new date, and `--supersedes <id>`.
   - **adjust**: a new confidence or a new criterion (the user's words). Same add
     with the changed field and `--supersedes <id>`.
   - **release**: a reason. `cairn ledger release <id> --reason "…"`.
   Record `{ "entry": <id>, "action": …, "result": <new entry id or release id> }`.
   Do not move to the next item until this one has a result. If the user wants to
   resolve an item instead, run the cairn-resolve flow for it; a resolved item leaves
   the scope and needs no choice.
4. **Priorities.** Ask for the domains and weights for the next period in one line
   ("work 60, health 40"). Show the previous review's priorities beside the request
   if the digest lists any. Weights are integers; the tool normalizes.
5. **Record.** Write the review file (a temporary path, for example in the OS temp
   directory) as `{ "choices": [...], "priorities": [{ "domain", "weight" }],
   "notes": "<optional one line from the user>" }` and run
   `cairn ledger review --file <path> --json`. Exit 3 means the gate found an open
   in-scope item without a choice: show its `reasons` line and return to step 3 for
   the ids in `blocking`.
6. **Close.** Print the review id and `next_review_by`. Nothing else.

## Rules

- The reviewer receives the digest and nothing else. Do not paste the conversation,
  the ledger file, or your own observations into its prompt.
- You never suggest which choice to make for an item, and you never suggest
  priorities. If the user asks "what should I do", answer with the three options
  and the item's own frozen terms.
- A review that cannot close is not closed. Do not write a partial review event.
- Exit 1 with "corrupt": stop and show the line number; do not repair the file.
