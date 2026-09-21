# 08 · resolve-review

**Goal.** Closing the loop: resolutions that honor gates, and the weekly ritual that
ends in forced choices and stated priorities.

## Files

```
skills/cairn-resolve/SKILL.md
skills/cairn-review/SKILL.md
agents/cairn-reviewer.md
tools/ledger.mjs             gains `review` subcommand
tests/review.mjs
```

## `/cairn-resolve`

1. Identify the entry (id, or search `cairn ledger list --status open` by text).
2. Show its frozen fields: criterion, confidence, if-then, date.
3. Ask for the outcome label for its kind, and `stake_honored` when it has an if-then.
   Ask for an optional reflection.
4. `cairn ledger resolve <id> …`. Show `outcome_score` and `process_score` with one
   line each of what they mean (from `skills/cairn-score/references/explain.md`, item
   09; until then, a fixed sentence in the skill).
5. Release path: `cairn ledger release <id> --reason …`; refuse without a reason by
   showing the gate's message.

No model role runs here. At dial ≥ 2 the skill states the gap between confidence and
outcome in one sentence with the numbers; at 1 it asks what the user makes of the gap;
at 0 it prints the numbers only.

## `/cairn-review`

1. `cairn digest` (markdown). If `open_in_scope` and `resolved` are both empty and
   no review is due, say so in one line and stop.
2. Dial ≥ 1: spawn `cairn-reviewer` with the digest markdown, the dial level, and
   `bluntness.md`. Show its output.
3. **Forced choices.** For each `open_in_scope` item, in order: recommit (new date;
   `cairn ledger add … --supersedes <id>` copying frozen fields), adjust (new
   confidence or criterion, same mechanism), or release (reason). No fourth option.
   The skill does not proceed past an item without one.
4. **Priorities.** Ask for the domains and weights for the next period, in one line.
   Show the previous review's priorities beside them if any.
5. `cairn ledger review --file review.json`, which calls `canCloseReview` and refuses
   with `blocking` if anything was skipped.
6. Print the review id and the next review date.

## `review` event

```json
{ "event": "review", "id": "v-…", "ts": "…",
  "period": { "from": "…", "to": "…" },
  "choices": [ { "entry": "…", "action": "recommit|adjust|release", "result": "<new entry id or release id>" } ],
  "priorities": [ { "domain": "work", "weight": 60 }, { "domain": "health", "weight": 40 } ],
  "resolved": ["r-…"], "notes": "…" }
```

`priorities` weights are integers; the tool normalizes for drift. Notes are free text.

## `cairn-reviewer`

Frontmatter as the adversary. Input: the digest markdown, the dial level,
`bluntness.md`. Nothing else, enforced by the skill passing only those.

Outputs, labelled:

1. **What the numbers say.** Each statement cites an entry id or a named statistic
   with its value and `n`. No statement without a citation. `insufficient` statistics
   may be named as insufficient and nothing more.
2. **Where confidence drifted from hit rate.** The calibration buckets whose `gap`
   is outside ±0.10 with n ≥ MIN_N, stated as numbers.
3. **The forced-choice list.** Every `open_in_scope` id with its date and confidence,
   and the three options. No preference among them.
4. **Questions.** At most three, each tied to a cited id or statistic.

Never recommends what to decide. Never characterizes the person. Under 300 words.

## Tests

- `review` refused with an unaddressed in-scope item; allowed after each choice type.
- Recommit and adjust write a new entry with `supersedes`; the old entry's derived
  status becomes `superseded`; the old line is byte-identical before and after.
- Drift after a review reads the new priorities.
- Reviewer prompt file: cites-only rule present, no recommendation verbs, references
  `bluntness.md`.

## Status

planned
