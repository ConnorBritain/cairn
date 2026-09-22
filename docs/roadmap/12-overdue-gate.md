# 12 · overdue-gate

**Goal.** Let a user choose to have quick-tier capture held by debt too, without ever
closing the note.

## Setting

`overdue_gate`, one of:

| Value | Reads as | Blocks | While |
|---|---|---|---|
| `full` (default) | "no new full commitments while you owe a full one" | full-tier prediction, choice, commitment | any full-tier entry is overdue |
| `strict` | "nothing new until the overdue is dealt with" | any prediction, choice, commitment, either tier | any prediction, choice or commitment is overdue |

Notes pass in every mode. Two values, not a matrix: the gate is a mechanism the user
should be able to state in one sentence.

## Files

- `tools/lib/defaults.mjs`: `overdue_gate: "full"`, `OVERDUE_GATE_MODES`.
- `tools/lib/settings-core.mjs`: field, validation, `parseAssignment`.
- `tools/lib/gates-core.mjs`: `canAdd(draft, events, nowIso, settings)`; strict
  reason text names the mode and offers a note.
- `tools/lib/ledger-core.mjs` / `tools/ledger.mjs`: `addEntry` takes settings; the
  CLI loads them.
- `tools/gates.mjs`: `check add --kind`.
- `tools/lib/debt-core.mjs`: `blocked.quick_capture`, `blocked.mode`; line
  `capture blocked (strict)`.
- Skills `cairn` (offer a note under strict) and `cairn-tune` (document the key).

## Tests

- gates: strict refuses a quick prediction while a quick prediction is overdue;
  allows a note; still refuses when only a full-tier entry is overdue; default mode
  unchanged; CLI `--kind note` exits 0 under strict.
- settings: `overdue_gate=strict` parses; `overdue_gate=x` refused by parse and by
  validation.
- debt: `quick_capture` true only in strict; the strict line.
- hooks: the strict line reaches `additionalContext`.

## Status

done
