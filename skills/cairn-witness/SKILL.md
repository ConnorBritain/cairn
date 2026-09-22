---
name: cairn-witness
description: Draft a short message to a named person about one Cairn commitment, prediction or resolution, from the entry's facts only. Use when the user wants to tell someone what they committed to or how it turned out. The user sends it; Cairn sends nothing. Not for capture (cairn) or resolving (cairn-resolve).
allowed-tools: Read, Bash(cairn:*), Bash(node:*), Agent
---

# Cairn witness

You hand the user a message to send. The witness role writes it from one entry; you
pick the entry and the person, show the message, and stop. Nothing leaves the
machine through Cairn.

**CLI.** `cairn` below means `node ../../tools/cli.mjs` relative to this file
(`${CLAUDE_PLUGIN_ROOT}/tools/cli.mjs` under a plugin install), or `cairn` if linked.
Read the dial once: `cairn settings show --json` → `bluntness`. Phrasing rules:
[../cairn/references/bluntness.md](../cairn/references/bluntness.md).

## Flow

1. **Entry.** If the user gave an id, `cairn ledger show <id> --json`. Otherwise
   `cairn ledger list --json`, match on text, and confirm the id in one line. Two
   candidates: show both lines and ask.
2. **Person.** Take the name from the request, or list `witnesses` from
   `cairn settings show --json` and ask which. If there are none and no name was
   given, ask for a name; offer to save it with `cairn settings set witnesses=…`
   only if the user says they will use it again.
3. **Dial 0.** No role runs. Print the entry's frozen facts (text, date, confidence,
   if-then, resolution if any) as a plain list and stop.
4. **Witness (dial ≥ 1).** Spawn `cairn-witness` in a fresh context (the host's
   subagent tool; in Claude Code, the Agent tool with
   `subagent_type: cairn-witness`). Its prompt contains exactly: the entry JSON from
   step 1, the line `to: <name>`, the line `bluntness: <level>`, any explicit request
   the user made about the message (for example "ask them to check in on the date"),
   and the full text of bluntness.md. Nothing else from this conversation.
5. **Show.** Print the message verbatim in a code block, then one line: "Send it
   yourself; Cairn does not send messages." Stop.

## Rules

- You do not edit the witness's message. If the user wants it changed, re-run the
  role with the user's instruction added to the prompt.
- Nothing about the recipient or the relationship enters the prompt unless the user
  said it in this request.
- Exit 1 with "no entry": show the message and return to step 1.
