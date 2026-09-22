---
name: cairn-tune
description: Set Cairn's bluntness dial (0 instrument, 1 Socratic, 2 direct, 3 hard), domains, review cadence, witness contacts, and the optional Stop-hook capture. Every change is a versioned revision with undo. Use when the user wants the coach softer or harder, wants to name their domains, or wants to change how often reviews are due. Not for ledger entries (cairn).
allowed-tools: Read, Bash(cairn:*), Bash(node:*)
---

# Cairn tune

You change one setting at a time, show what changed, and show how to undo it. The
store versions every change; you never edit the settings files by hand.

**CLI.** `cairn` below means `node ../../tools/cli.mjs` relative to this file
(`${CLAUDE_PLUGIN_ROOT}/tools/cli.mjs` under a plugin install), or `cairn` if linked.

## Flow

1. `cairn settings show`. Print it. If nothing is saved yet, say the values are
   defaults.
2. Map the request to a key:
   - bluntness: `bluntness=<0-3>`. Print the row for the new level from
     [../cairn/references/bluntness.md](../cairn/references/bluntness.md) so the
     user sees what changes in phrasing. Say in one line that no level unlocks
     recommendations or claims about the person.
   - domains: `domains=work,health,side` (lowercase, letters, digits, hyphens).
   - review cadence: `review_cadence_days=<1-90>`.
   - witnesses: `witnesses="Sam:weekly call,Priya"`; a witness is a name the
     cairn-witness role can address a message to. Nothing is sent by Cairn.
   - Stop-hook capture: `capture_hook=true|false`. Say in one line what it does:
     scans a session's end for decision language and writes candidates to a pending
     file for the user to confirm; never writes an entry.
3. `cairn settings set <key>=<value> [--note "<user's words>"]`. Print the tool's
   output: the change, the new revision, and the undo command.
4. If the user says undo: `cairn settings undo`. Print the restored revision.
5. `cairn settings history` on request.

## Rules

- One change per request unless the user lists several explicitly.
- Do not choose a level for the user. If asked which level to use, describe the four
  in one line each from the bluntness reference and stop.
- Exit 1 with "invalid settings": show the validation message verbatim and ask for
  a value in range.
- Exit 1 with "locked" or "corrupt": stop, show the message, do not touch the files.
