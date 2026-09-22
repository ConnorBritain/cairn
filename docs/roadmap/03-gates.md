# 03 · gates

**Goal.** Pressure by mechanism: the three rules as pure functions that the CLI and
every skill call before writing, returning a machine-readable verdict.

## Files

```
tools/lib/gates-core.mjs   pure functions
tools/gates.mjs            CLI: cairn gates check add|release|review [...] [--json]
tests/gates.mjs            suite
```

## Rules

1. **Overdue gate.** A `full`-tier entry is refused while any `full`-tier entry is
   overdue. `quick`-tier entries of any kind are always allowed. Notes are always
   allowed. (ROADMAP cross-cutting: "quick tier always allowed" is the chosen reading
   of "quick notes always allowed"; if the narrower reading is wanted, change the
   predicate in `canAdd` and the one test that pins it.)
2. **Release gate.** A release requires a non-empty reason.
3. **Review gate.** A review cannot close while any open item in its scope lacks a
   forced choice. Scope = every open entry that is overdue, or whose date falls before
   the next review date (`review.period.to + settings.review_cadence_days`), plus any
   entry the review explicitly lists. A forced choice is one of `recommit`, `adjust`
   (both: a new entry with `supersedes` = the item), or `release` (a release event with
   a reason).

## Interface

```js
canAdd(draft, events, now, settings)      → { allowed, reasons: [], blocking: [ids] }
canRelease(entryId, reason, events)       → { allowed, reasons: [], blocking: [] }
canCloseReview(review, events, now, settings) → { allowed, reasons: [], blocking: [ids] }
```

`reasons` are short imperative strings a skill can show verbatim ("full-tier capture
blocked: 2 full-tier entries overdue (p-…, c-…). Resolve, release, or capture at quick
tier."). `blocking` lists the ids that would have to change.

CLI: `cairn gates check add --tier full`, `cairn gates check release <id> --reason …`,
`cairn gates check review --file review.json`. Exit 0 when allowed, 3 when refused,
1 on error. `--json` prints the verdict object.

## Wiring

- `ledger.mjs add` calls `canAdd` and refuses with the verdict; `--force` does not
  exist.
- `ledger.mjs release` calls `canRelease`.
- `ledger.mjs review` (item 08) calls `canCloseReview`.
- Skills call the CLI first and show `reasons` to the user; they do not re-implement
  the rules.

## Tests

- Full add refused with one full-tier overdue; allowed with only quick-tier overdue;
  allowed the moment the overdue entry is resolved or released.
- Quick add and note add always allowed, including with many overdue full entries.
- Release: empty, whitespace-only, missing reason refused; entry already closed refused.
- Review: an open in-scope item with no choice → refused, its id in `blocking`; each
  of the three choices satisfies it; an out-of-scope open item does not block.
- CLI exit codes and `--json` shape match the function results for every case.

## Status

done
