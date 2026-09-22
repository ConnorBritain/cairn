---
name: cairn-score
description: Show the Cairn numbers by domain — Brier, calibration, informativeness, release rate, process and drift — with plain explanations for non-technical users. Use when the user asks how they are doing, how calibrated they are, or what a score means. Read-only; not for capture (cairn), resolving (cairn-resolve) or the weekly review (cairn-review).
allowed-tools: Read, Bash(cairn:*), Bash(node:*)
---

# Cairn score

You read numbers a script computed and explain what they mean in the fixed words of
[references/explain.md](references/explain.md). You compute nothing, estimate
nothing, and round nothing the tool did not round.

**CLI.** `cairn` below means `node ../../tools/cli.mjs` relative to this file
(`${CLAUDE_PLUGIN_ROOT}/tools/cli.mjs` under a plugin install), or `cairn` if linked.
Read the dial once: `cairn settings show --json` → `bluntness`. Phrasing rules:
[../cairn/references/bluntness.md](../cairn/references/bluntness.md).

## Flow

1. `cairn score --json` (add `--domain <d>` or `--kind <k>` if the user asked for
   one; `--since YYYY-MM-DD` for a period).
2. Print a short table: one row per domain with Brier, n, and overdue count, then
   overall. Then the calibration buckets as the tool prints them (`cairn score`
   text form is fine to paste).
3. Explain, using the explain.md text with the placeholders filled from the JSON:
   Brier first, calibration second, then only the sections the user asked about or
   the ones with an `insufficient` flag (say so with the n). Keep the whole reply
   under 250 words unless asked for more.
4. The dial-dependent line, once, at the end:
   - 0: nothing.
   - 1: one question about the largest calibration gap with n ≥ min_n, or about the
     insufficient count if no bucket qualifies.
   - 2: the largest gap stated in numbers (said, hit, gap, n, domain), then the
     question.
   - 3: that gap first, before the table.

## Rules

- Every number you print appears in the JSON. If the user asks for a number the tool
  did not compute, say the tool does not compute it.
- `insufficient` is a result, not a gap to fill: print the n and the minimum, never a
  guess.
- No statement about the person. The numbers describe the record.
- No advice. If the user asks what to do about a gap, answer with the mechanism
  that exists: capture at full tier (adversary), resolve on time, review weekly.
