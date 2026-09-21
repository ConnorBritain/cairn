# 05 · debt

**Goal.** One fast, machine-readable answer to "what is overdue, what is due this week,
what is blocked, when did I last review". This is what the SessionStart hook prints
and what the overdue gate reads.

## Files

```
tools/lib/debt-core.mjs   pure function debt(events, now, settings)
tools/debt.mjs            CLI: cairn debt [--json] [--now ISO]
tests/debt.mjs            suite
```

## Output

```json
{
  "overdue": [ { "id": "…", "kind": "…", "tier": "…", "date": "…", "days_over": 3, "text": "…" } ],
  "due_this_week": [ { "id": "…", "kind": "…", "date": "…", "days_left": 2, "text": "…" } ],
  "blocked": { "full_tier_capture": true, "by": ["p-…"] },
  "last_review": { "id": "v-…", "at": "…", "days_since": 9 } ,
  "review_due": true,
  "counts": { "overdue": 1, "due_this_week": 1, "open": 7 }
}
```

- `due_this_week` = open, not overdue, date within the next seven days (inclusive of
  today).
- `blocked.full_tier_capture` mirrors `gates.canAdd({tier:"full"})`.
- `review_due` = no review yet and any entry exists, or `days_since` ≥
  `settings.review_cadence_days` (default 7).
- `last_review` is `null` when no review event exists.

Text mode prints at most two lines, the hook's exact format:

```
cairn: 1 overdue (p-20260921-k7q2 due 2026-09-30) · 1 due this week · full-tier capture blocked
cairn: last review 9 days ago · review due
```

When `overdue`, `due_this_week` are empty and `review_due` is false, text mode prints
nothing and exits 0. Missing state directory or empty ledger: same.

## Tests

- Empty ledger, missing directory → empty object, no text, exit 0.
- Overdue and due-this-week classification at the day boundaries.
- `blocked` agrees with `gates.canAdd`.
- `review_due` for: never reviewed with entries, reviewed 6 days ago, 7 days ago.
- Text form is exactly two lines when both lines have content, one when only one does.
- Runs under 100 ms on a generated 10k-line ledger (assert on wall time with margin).

## Status

planned
