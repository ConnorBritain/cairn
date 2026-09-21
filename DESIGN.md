# Cairn — design

Cairn is a decision and prediction ledger. You pre-register what you expect, what you
chose and what you will do; a script scores the record when it resolves; a model role
in clean context argues the other side before you commit and reads the numbers back to
you at review. The files are yours, in your directory, in Markdown and JSONL.

## House rules

These are not preferences. A change that violates one is a design regression, whatever
else it improves.

1. **Anything countable is computed by a script; the model is reserved for judgment.**
   Brier scores, calibration buckets, release rates, overdue counts, process scores and
   drift come from `tools/*.mjs`. No role estimates a number the tools can compute.
2. **Model roles run in clean context, are invoked at defined moments, and are never
   ambient.** The adversary runs at full-tier commit time. The reviewer runs at review
   time and reads only the digest. The witness runs when asked. Nothing watches the
   session and comments unprompted.
3. **The coach is evidence-bound.** It may only assert what the ledger supports, and it
   cites the record (entry ids) when it does. It is Socratic: it asks and confronts. It
   never recommends which option to choose.
4. **Committed reasoning is immutable.** Entries are append-only. Corrections are new
   entries that reference the old one. No tool exposes an edit or delete of a committed
   line.
5. **Signals, never verdicts about the person.** No personality inference. No "you tend
   to" unless a computed metric says so and is cited by name and value.
6. **Pressure comes from mechanisms, never from tone.** Gates that refuse, debt that is
   visible at session start, forced choices at review. No guilt, no streaks, no praise
   for output volume.
7. **State lives in the user's own directory, never inside the plugin install.**
   `~/.cairn` by default, or a per-project `docs/cairn/`. Markdown plus JSONL,
   git-friendly, readable without Cairn.
8. **No network calls. No API keys.** Model calls go through the host CLI session
   (Claude Code or Codex) as subagents. The tools never open a socket.

## What Cairn is not

Not a task manager, not a journal, not a habit tracker, not a therapist. It has no
notion of productivity. Its only opinion is that a claim with a number and a date can
be checked later, and that a person who checks learns something a person who does not
cannot.

## The model

### Entry kinds

| Kind | Required (quick tier) | Full tier adds | Resolves as |
|---|---|---|---|
| `prediction` | claim, confidence 0–100, `resolve_by`, resolvable criterion | reasoning, adversary pass | `true` / `false`, scored by Brier |
| `choice` | chosen, over (the rejected option), confidence, `review_by`, success criterion | if-then, reasoning, adversary pass | criterion met `yes` / `partial` / `no` |
| `commitment` | text, `due_by` | if-then, reasoning, adversary pass | `kept` / `missed`, or released with a reason |
| `note` | text | — (notes are always quick) | not scored; can be promoted by a new entry that links to it |

Every entry carries: `id`, `created_at`, `kind`, `tier`, `domains` (one or more tags),
`confidence` (optional only for notes), the dates its kind requires, and `links`
(`related` ids, and `supersedes` when it corrects an earlier entry).

Confidence on a choice or commitment is the probability the criterion will be met (or
the commitment kept) by the date. That makes every kind Brier-scorable with the same
formula, and the per-kind outcome labels are what the user sees.

### Tiers

**Quick** captures in five seconds: a note, or any kind with only its required fields.
**Full** adds frozen reasoning, the if-then, and an adversary pass. Tier is validated
against the fields present: an entry is not full because it says so but because it
carries what full requires. The adversary pass is recorded on the entry (that it ran,
when, and its four outputs), so process score is computed from the record, not rated.

### Status is derived, not stored

An entry line never changes. Status is computed from later events:

- `open` — no later event closes it.
- `resolved` — a `resolution` event references it.
- `released` — a `release` event references it (reason required).
- `superseded` — a later entry names it in `supersedes` (recommit or adjust at review).
- `overdue` — `open` and past its `resolve_by` / `review_by` / `due_by`. Computed at
  read time by `debt.mjs` and `ledger.mjs list`; never written.

### Resolution records

A `resolution` event carries: the outcome label, `outcome_score` (Brier for predictions
and, by the formula above, for choices and commitments; the criterion label is kept
alongside), `process_score` (fraction of three booleans: adversary engaged, criterion
pre-registered, reasoning frozen; computed from the entry), `stake_honored`
(`yes` / `no` / `n/a`, for entries with an if-then), and free-text reflection.
Reflection is append-only: further `reflection` events reference the entry.

### The ledger file

One JSONL file, one event per line: `entry`, `resolution`, `release`, `reflection`,
`review`. Append is the only write. A `review` event records the period it covered,
the forced choice made for each open item, and the user's stated priorities for the
next period. Those priorities are what drift is measured against.

## Mechanisms

### Gates (`tools/gates.mjs`)

- A full-tier entry is refused while any full-tier entry is overdue. Quick-tier
  entries of any kind are always allowed, so capture is never blocked by debt.
- A release requires a stated reason.
- A review cannot close while an open item in its scope has not been recommitted,
  adjusted, or released.

Gates are functions that return `{ allowed, reasons, blocking }`. Skills call them
before writing; the CLI enforces them too, so the model cannot route around them.

### Scores (`tools/score.mjs`)

Brier by domain and overall; a calibration curve of bucketed confidence against hit
rate; informativeness (mean distance of confidence from 50); release rate; overdue
count; process-score averages; drift between stated priorities and where entries
actually cluster by domain and week. Every statistic states its `n` and refuses to
report below a minimum, saying so, rather than printing a number a sample cannot
support.

### Debt and digest

`debt.mjs` is what the SessionStart hook prints and what gates read. `digest.mjs` is
the review packet: resolved since last review, overdue, the current numbers, drift. It
is the only thing the reviewer role reads, which is how the reviewer stays
evidence-bound by construction rather than by instruction.

### Roles

| Role | Runs | Reads | Produces | Never |
|---|---|---|---|---|
| `cairn-adversary` | full-tier commit | draft entry, domain calibration summary, up to five related resolved entries | strongest case for the other option; what must be true for this to fail; the base-rate question; one pointed question about the user's record in this domain | recommends |
| `cairn-reviewer` | review | `digest.mjs` output only | what the numbers say, cited by id; where confidence drifted from hit rate; the forced-choice list per open item | recommends what to decide |
| `cairn-witness` | on request | one commitment or resolution, one named person | a short message the user sends themselves | sends anything |

Roles are subagents with no tools. They receive their inputs in the prompt and return
text. They cannot read the ledger, the session, or each other.

### The bluntness dial

One setting, `bluntness`, 0–3, stored with the user's other settings and versioned with
undo:

| Level | Name | Roles run | Phrasing |
|---|---|---|---|
| 0 | instrument | none | scores and digests only |
| 1 | Socratic | all | questions only |
| 2 | direct | all | states the finding plainly, then the question |
| 3 | hard | all | leads with the gap between stated confidence and record, no softening |

The dial changes phrasing and how much a role volunteers. It never unlocks
recommendations or personality claims. Every role reads the level from the same field
and takes its phrasing rules from one shared reference file, so the levels mean the
same thing everywhere.

### Settings

Settings are immutable revisions with an atomic `current` pointer. Undo writes a new
revision equal to the previous one rather than deleting anything, the same pattern as
vonnegut's preference store. Fields: `bluntness`, `domains`, `review_cadence_days`,
`witnesses`, `capture_hook`.

### Hooks

`SessionStart` prints decision debt in two lines and is silent when nothing is due.
The optional `Stop` hook, off by default, scans the session for decision language and
writes candidate notes to a pending file for the user to confirm or discard. It never
commits an entry. Both hooks swallow every error and exit clean; a hook that breaks a
session gets uninstalled, and an uninstalled hook protects nothing.

## Where state lives

Resolution order: `CAIRN_HOME` if set; else the nearest `docs/cairn/` walking up from
the working directory; else `~/.cairn`. Inside:

```
ledger.jsonl        the record, append-only
settings/           revisions/ and current.json
pending.jsonl       candidate notes from the optional Stop hook
exports/            optional markdown and CSV dumps from export.mjs
```

Nothing under the plugin install directory is ever written to.
