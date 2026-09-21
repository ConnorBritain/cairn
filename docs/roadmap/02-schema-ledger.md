# 02 · schema-ledger

**Goal.** A validated, append-only ledger that refuses edits to committed lines and
can show any entry with its derived status.

## Files

```
tools/lib/schema.mjs     kinds, tiers, required fields, validation, id generation
tools/lib/store.mjs      state-dir resolution, read events, atomic append (the only writer)
tools/lib/status.mjs     derive status per entry from the event stream; overdue from dates
tools/ledger.mjs         CLI: add · resolve · release · reflect · list · show · related
tests/ledger.mjs         suite
```

`tools/cli.mjs` (added here, extended by later items) dispatches `cairn ledger …`,
`cairn add …` as an alias, and prints usage.

## Event schema

Every line in `ledger.jsonl` is a JSON object with `event` and `ts` (ISO 8601, UTC).

### `entry`

```json
{
  "event": "entry",
  "id": "p-20260921-k7q2",
  "ts": "2026-09-21T14:02:11Z",
  "kind": "prediction",
  "tier": "full",
  "domains": ["work"],
  "text": "We ship the billing rewrite before Q4 starts",
  "confidence": 70,
  "criterion": "PR merged to main and deployed to prod by 2026-09-30 23:59 UTC",
  "dates": { "resolve_by": "2026-09-30" },
  "reasoning": "…frozen at commit…",
  "if_then": null,
  "chosen": null,
  "over": null,
  "adversary": { "ran": true, "at": "…", "other_side": "…", "failure_conditions": "…", "base_rate_question": "…", "record_question": "…" },
  "links": { "related": ["c-20260901-x1a9"], "supersedes": null }
}
```

Per-kind fields:

| Kind | Required | Full-tier additionally required | Date key |
|---|---|---|---|
| prediction | `text`, `confidence`, `criterion`, `dates.resolve_by` | `reasoning`, `adversary.ran` | `resolve_by` |
| choice | `chosen`, `over`, `confidence`, `criterion`, `dates.review_by` | `if_then`, `reasoning`, `adversary.ran` | `review_by` |
| commitment | `text`, `dates.due_by` | `if_then`, `reasoning`, `adversary.ran` | `due_by` |
| note | `text` | — (notes are always `quick`) | optional `dates.resolve_by` |

`domains` must be non-empty except on notes (default `["general"]`). `confidence` is an
integer 0–100; on commitments it defaults to 100 when omitted at quick tier and must be
given at full tier. `text` is the note text, the prediction claim, or the commitment;
for choices `text` is generated as `"<chosen> over <over>"` if omitted.

`tier` is validated against the fields: `full` is refused if any full-tier field is
missing; `quick` is accepted with extra fields present, but `adversary.ran` may not be
true on a quick entry (an adversary pass makes it full by definition, so the validator
promotes and says so).

### `resolution`

```json
{ "event": "resolution", "id": "r-20260930-m2p1", "ts": "…", "entry": "p-20260921-k7q2",
  "outcome": "true", "outcome_score": 0.09, "criterion_met": null,
  "process_score": 1.0, "process": { "adversary": true, "criterion": true, "reasoning": true },
  "stake_honored": "n/a", "reflection": "…" }
```

Outcome labels: prediction `true|false`; choice `yes|partial|no` (stored in
`criterion_met`, with `outcome` = the same); commitment `kept|missed`.
`outcome_score` is Brier: `(confidence/100 − o)²` with `o` = 1 for true/yes/kept, 0.5
for partial, 0 for false/no/missed. `process_score` is the mean of the three process
booleans, computed from the entry. `stake_honored` is `yes|no` when the entry has an
`if_then`, else `n/a`; the tool asks for it and refuses to default it.

### `release`

```json
{ "event": "release", "id": "l-…", "ts": "…", "entry": "…", "reason": "…" }
```

`reason` must be non-empty after trim. Any open entry can be released.

### `reflection`

```json
{ "event": "reflection", "id": "f-…", "ts": "…", "entry": "…", "text": "…" }
```

### `review`

Defined in item 08; the schema module reserves the event name and validates it there.

## Derived status (`tools/lib/status.mjs`)

`statusOf(entry, events, now)` returns one of `open`, `resolved`, `released`,
`superseded`, `overdue`. Precedence: superseded > resolved > released > overdue > open.
An entry is overdue when open and `now` is after the end of its date key's day (UTC).
Notes without a date are never overdue.

## Store (`tools/lib/store.mjs`)

- `resolveStateDir({ env, cwd, home })` — `CAIRN_HOME`, else nearest `docs/cairn/`
  walking up, else `~/.cairn`. Does not create it.
- `readEvents(dir)` — parses `ledger.jsonl`; a malformed line is reported with its
  line number and the read fails (a corrupt ledger must be noticed, not skipped).
- `appendEvent(dir, event)` — validates, then appends one line with `O_APPEND` under
  an exclusive `.ledger.lock` (`wx` create; stale-lock message names the file).
  Creates the directory with mode `0700` on first write.
- No function in this module rewrites, truncates or deletes a line. Grep-able
  guarantee: the module never imports `writeFileSync` with a truncating flag on the
  ledger path.

## CLI (`tools/ledger.mjs`)

```
cairn ledger add --kind <k> [--tier quick|full] --text … --confidence N --domain d [--domain d2]
                 [--criterion …] [--resolve-by|--review-by|--due-by YYYY-MM-DD]
                 [--chosen … --over …] [--if-then …] [--reasoning …]
                 [--adversary-file path.json] [--related id]... [--supersedes id] [--json]
cairn ledger resolve <id> --outcome <label> --stake-honored yes|no [--reflection …] [--json]
cairn ledger release <id> --reason … [--json]
cairn ledger reflect <id> --text … [--json]
cairn ledger list [--status open|overdue|resolved|released|superseded] [--kind k] [--domain d] [--json]
cairn ledger show <id> [--json]
cairn ledger related --domain d [--kind k] [--text …] [--limit 5] [--json]
```

`add` calls `gates.canAdd` once item 03 lands (until then, a stub that always allows;
item 03 replaces it). `release` calls `gates.canRelease`. Any attempt to pass an id to
`add` for modification is refused with: `entries are immutable; add a new entry with
--supersedes <id>`.

`related` ranks resolved entries by shared domain, then shared words in `text`, then
recency, and returns at most `--limit` (default 5). Deterministic; no model.

`--json` prints one object; text mode prints one entry per line as
`<status>  <id>  <kind>  <confidence>%  <date>  <text>`.

## Tests (`tests/ledger.mjs`)

Each test states why it matters. Minimum set:

- Round-trip every kind at both tiers through the CLI in a temp `CAIRN_HOME`.
- Missing required field per kind → refusal naming the field.
- `tier: full` without adversary → refusal; quick with `adversary.ran` → promoted to
  full with a notice.
- Resolution: Brier and process score values; `stake_honored` required when `if_then`
  present.
- Release without reason → refused.
- Status derivation for each precedence case; overdue at the day boundary.
- Two concurrent appends (spawned processes) → both lines present, file parseable.
- A malformed line → `readEvents` fails with the line number.
- State dir resolution: env, walk-up, home; never the plugin directory.
- Grep guard: `store.mjs` contains no truncating write of the ledger path.

## Status

planned
