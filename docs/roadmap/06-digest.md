# 06 · digest

**Goal.** The one artifact the reviewer role reads. Because the reviewer sees nothing
else, it can only say what the record supports.

## Files

```
tools/lib/digest-core.mjs   pure function digest(events, now, settings)
tools/digest.mjs            CLI: cairn digest [--json] [--now ISO]
tests/digest.mjs            suite on the item 04 fixtures
```

## Contents

```json
{
  "period": { "from": "<last review ts or first entry ts>", "to": "<now>", "first_review": false },
  "resolved": [ { "id", "kind", "domains", "confidence", "outcome", "outcome_score", "process_score", "stake_honored", "text", "criterion" } ],
  "released": [ { "id", "kind", "reason", "text" } ],
  "overdue":  [ { "id", "kind", "tier", "date", "days_over", "confidence", "text" } ],
  "open_in_scope": [ { "id", "kind", "date", "confidence", "text" } ],
  "scores": { "…the score.mjs object, by domain and overall…" },
  "drift": { "…the score.mjs drift object…" },
  "priorities_stated": [ { "domain", "weight" } ]
}
```

`open_in_scope` is exactly the set the review gate (item 03) will require a forced
choice for. `scores` and `drift` are taken from `score-core`, not recomputed.

Markdown mode renders the same data as headed sections with one line per entry,
`<id> · <kind> · <confidence>% · <outcome> · Brier <score>`. No prose, no adjectives.
The markdown is what the review skill pastes into the reviewer's prompt.

## Tests

- Every id that appears in the markdown appears in the JSON and exists in the ledger.
- A ledger with no review event yields `first_review: true` and `period.from` = first
  entry.
- `open_in_scope` equals `gates.canCloseReview(...).blocking` for an empty review.
- Markdown contains no words outside a fixed allow-list of labels plus entry text.

## Status

planned
