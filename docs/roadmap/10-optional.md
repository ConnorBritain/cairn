# 10 · optional

**Goal.** The two opt-in surfaces, off by default, that must never write an entry on
their own: Stop-hook capture and the witness.

## Files

```
hooks/stop-capture.mjs
tools/lib/pending-core.mjs    matchers and candidate shaping (pure)
tools/pending.mjs             CLI: cairn pending list|confirm <n>|discard <n> [--json]
agents/cairn-witness.md
skills/cairn-witness/SKILL.md
tests/pending.mjs
```

## Stop hook

Registered in `hooks.json` under `Stop`, 12 s timeout. The script:

1. Exits immediately if `stop_hook_active` is true in the input.
2. Resolves the state dir; reads settings; exits if `capture_hook` is not `true`,
   **before** touching the transcript.
3. Reads the transcript path from hook input, scans assistant-visible user turns since
   the last scan (cursor stored in `pending.jsonl` as a `cursor` line) for decision
   language:
   - choice: `going with`, `decided (to|on)`, `we'll use`, `over` in the same sentence
   - prediction: `I think .* will`, `I bet`, `probably by`, a percentage
   - commitment: `I'll have .* by`, `I will .* by`, `done by`
4. Appends `{ "event": "candidate", "n", "ts", "kind_guess", "text", "source": "stop-hook" }`
   lines to `pending.jsonl`. Never writes to `ledger.jsonl`. Emits nothing.
5. Any error → exit 0 silently.

`/cairn` checks `cairn pending list` at its start and offers each candidate: confirm
(runs the normal capture flow with the text prefilled) or discard.

## Witness

`agents/cairn-witness.md`: input is one entry (and its resolution if any) as JSON, a
person's name from `settings.witnesses`, and the dial level. Output is a message of at
most 80 words containing only facts from the entry: what was committed or predicted,
the date, the confidence, and the outcome if resolved. No request, no framing, no
"please hold me to this" unless the user asked for it in the prompt. The skill shows
the message and stops; the user sends it.

## Tests

- Setting off → hook returns before opening the transcript (assert with a transcript
  path that does not exist).
- `stop_hook_active` → immediate exit.
- A transcript with each cue type → one candidate each, correct `kind_guess`; ledger
  untouched (byte-compare).
- Cursor: a second run over the same transcript adds nothing.
- `confirm` hands the text through; `discard` marks the candidate; both append-only.
- Witness prompt: only-facts rule, word cap, no recommendation verbs.

## Status

planned
