# Cairn roadmap

The single source of truth for what Cairn is going to be and in what order. Each item
below has a goal, a deterministic half (scripts), a model half (roles and skills), where
its state lives, acceptance criteria, and a status. The per-item spec in
[`docs/roadmap/`](roadmap/) carries the detail; the checklist in
[`docs/roadmap/STATUS.md`](roadmap/STATUS.md) carries progress.

The house rules in [`DESIGN.md`](../DESIGN.md) bind every item. When a spec and the
house rules disagree, the house rules win and the spec is wrong.

## How to work this roadmap

- Items are taken **in sequence order**. Any session reads this file and STATUS first,
  takes the first unchecked deliverable, and updates STATUS in the same commit. See
  [CONTRIBUTING → Resuming work](../CONTRIBUTING.md#resuming-work).
- One deliverable per commit minimum. Tests before every commit. `node tools/check.mjs`
  must pass.
- A `package.json` version bump without a STATUS change fails `tools/check-status.mjs`.
- Status values: `planned`, `in progress`, `done`. Status here mirrors STATUS.md; when
  they disagree, STATUS.md is right and this file needs the same commit.

## Cross-cutting decisions

Decided once here so no item re-decides them.

**Layout.** One plugin at the repo root (Claude Code reads `.claude-plugin/`, Codex
reads `.codex-plugin/`). Deterministic tools in `tools/*.mjs` with pure logic in
`tools/lib/`, tests in `tests/`, roles in `agents/`, skills in `skills/`, hooks in
`hooks/`. Dependency-free Node 18+. No GitHub Actions; `node tools/check.mjs` is the
verifier. The CLI is `tools/cli.mjs`, exposed as `cairn` through `package.json` `bin`.

**State directory.** `CAIRN_HOME` if set; else the nearest `docs/cairn/` found walking
up from the working directory; else `~/.cairn`. Never the plugin install.

**Files.** `ledger.jsonl` (events: `entry`, `resolution`, `release`, `reflection`,
`review`), `settings/` (revisions plus `current.json`), `pending.jsonl` (Stop-hook
candidates), `exports/` (optional dumps).

**Ids.** `<k>-<YYYYMMDD>-<4 base36>` where `k` is `p` prediction, `c` choice, `m`
commitment, `n` note; events use `r` resolution, `l` release, `f` reflection, `v`
review. Random suffix so two machines appending to one git-synced ledger do not collide.

**Status is derived.** Entry lines never change. `open`, `resolved`, `released`,
`superseded` come from later events; `overdue` from dates at read time.

**Frozen fields.** Everything on an entry line. Recommit and adjust are new entries
with `supersedes`; the superseded entry is excluded from scoring and counted in a
"revised" metric so revising is visible, not free.

**Confidence semantics.** Probability (0–100) that the claim is true, the criterion
will be met, or the commitment will be kept, by the date. One Brier formula for all
scored kinds. Confidences below 50 on predictions are folded (claim negated) for the
calibration curve only; the stored value is what the user said.

**Tier is validated, not declared.** Full requires reasoning, criterion, if-then
(where the kind has one) and a recorded adversary pass. Process score is the fraction
of those three booleans present on the entry at resolution.

**Gate scope.** The overdue gate blocks full-tier entries while any full-tier entry is
overdue. Quick-tier entries of any kind pass. This reads the brief's "quick notes
always allowed" as "quick tier always allowed"; if the intent was notes only, item 03
changes one predicate.

**Minimum n.** Any statistic with fewer than five observations is reported as
`insufficient` with its `n`, never as a number. The reviewer may not cite an
insufficient statistic.

**Bluntness.** One field `settings.bluntness` in 0–3. One reference file,
`skills/cairn/references/bluntness.md`, holds the phrasing rules. Every role's prompt
includes that file by reference and nothing else about tone.

## Items

### 01 · plan — durable plan and resume protocol

- **Goal.** A session with no memory can pick up the next deliverable from files
  alone, and cannot ship a version without recording what shipped.
- **Deterministic half.** `tools/check.mjs` (sequential verifier, vonnegut style),
  `tools/check-status.mjs` (STATUS carries `Last version:`; must equal `package.json`;
  in git, a diff that changes the version must also touch STATUS).
- **Model half.** None.
- **Storage.** Repo docs only.
- **Acceptance.** `node tools/check.mjs` exits 0 on the fresh repo. `check-status.mjs`
  fails on a version mismatch. ROADMAP, eleven specs, STATUS, CONTRIBUTING with
  "Resuming work", DESIGN with the house rules verbatim, all committed together with
  STATUS item 01 checked.
- **Status.** done
- **Spec.** [01-plan.md](roadmap/01-plan.md)

### 02 · schema-ledger — the record and the only writer

- **Goal.** A validated, append-only ledger that refuses edits to committed lines and
  can show any entry with its derived status.
- **Deterministic half.** `tools/lib/schema.mjs` (kinds, required fields per tier,
  validation, id generation), `tools/lib/store.mjs` (resolve state dir, atomic append,
  read all events, no rewrite function exported), `tools/ledger.mjs` with `add`,
  `resolve`, `release`, `reflect`, `list`, `show`, `related`, all with `--json`.
  `tests/ledger.mjs`.
- **Model half.** None.
- **Storage.** `ledger.jsonl`.
- **Acceptance.** Round-trip every kind at both tiers. Invalid entries refused with
  field-level messages. Resolution computes `outcome_score` and `process_score`.
  Attempting to change a frozen field yields a refusal that names `supersedes` as the
  path. `list` derives `overdue`. Two appends from two processes do not corrupt the file.
- **Status.** done
- **Spec.** [02-schema-ledger.md](roadmap/02-schema-ledger.md)

### 03 · gates — the rules, machine-readable

- **Goal.** Pressure by mechanism: the three gates as pure functions the CLI and every
  skill call before writing.
- **Deterministic half.** `tools/gates.mjs`: `canAdd(entry, events, now)`,
  `canRelease(entry, reason)`, `canCloseReview(review, events, now)`; CLI
  `gates check <action> [--json]` returning `{ allowed, reasons, blocking }`.
  `ledger.mjs add|release` and the review skill call these. `tests/gates.mjs`.
- **Model half.** None.
- **Storage.** None.
- **Acceptance.** Full-tier add refused while any full-tier entry is overdue, quick
  allowed. Release without reason refused. Review with an unaddressed open item
  refused, with the item ids. All three surfaces (function, CLI, ledger.mjs) agree.
- **Status.** done
- **Spec.** [03-gates.md](roadmap/03-gates.md)

### 04 · score — the numbers

- **Goal.** Every countable thing about the record, by domain and overall, with `n`
  and refusals below minimum n.
- **Deterministic half.** `tools/score.mjs` and `tools/lib/score-core.mjs`: Brier
  (overall, by domain, by kind), calibration curve (buckets 50–59 … 90–100 after
  folding), informativeness, release rate, revised count, overdue count, process-score
  averages, drift (stated priorities from the last `review` event vs entry share by
  domain, and by week since that review). Synthetic ledgers in `tests/fixtures/`
  (well-calibrated, overconfident, hedging, high-release) with expected numbers.
  `tests/score.mjs`.
- **Model half.** None. Plain-language explanations live in the `/cairn-score` skill
  (item 09), not in the tool.
- **Storage.** Reads `ledger.jsonl`. Writes nothing.
- **Acceptance.** Fixture numbers match hand-computed values to three decimals. The
  overconfident fixture shows hit rate below confidence in the top buckets; the hedging
  fixture shows low informativeness; the high-release fixture shows release rate above
  the others. Every statistic under min n reports `insufficient`.
- **Status.** done
- **Spec.** [04-score.md](roadmap/04-score.md)

### 05 · debt — what is due

- **Goal.** One fast, machine-readable answer to "what is overdue, what is due this
  week, what is blocked, when did I last review".
- **Deterministic half.** `tools/debt.mjs`: overdue entries, due within seven days,
  blocked (full-tier capture blocked by the overdue gate), days since last review,
  `--json` and a two-line text form for the hook. `tests/debt.mjs`.
- **Model half.** None.
- **Storage.** Reads `ledger.jsonl`, `settings/` for cadence.
- **Acceptance.** Runs under 100 ms on a 10k-line ledger. Empty ledger and missing
  state directory both yield an empty debt object, exit 0, no output in text form.
- **Status.** done
- **Spec.** [05-debt.md](roadmap/05-debt.md)

### 06 · digest — the review packet

- **Goal.** The one artifact the reviewer role reads, so it can only say what the
  record supports.
- **Deterministic half.** `tools/digest.mjs`: everything resolved since the last
  review (with outcome and process scores), everything overdue, the current score
  summary, drift, and the open items that require a forced choice. Markdown and
  `--json`. `tests/digest.mjs` on the fixtures.
- **Model half.** None here; consumed by item 08.
- **Storage.** Reads only.
- **Acceptance.** Digest contains every id it cites and no prose beyond labels. A
  ledger with no review yet produces a "first review" digest covering everything.
- **Status.** done
- **Spec.** [06-digest.md](roadmap/06-digest.md)

### 07 · capture — `/cairn`, the adversary, the bluntness reference

- **Goal.** Natural-language capture that is fast at quick tier and adversarial at
  full tier, with tone governed by one file.
- **Deterministic half.** `ledger.mjs add` and `gates.mjs` from earlier items;
  `score.mjs --domain <d> --summary` for the adversary's calibration input;
  `ledger.mjs related <draft>` for up to five related resolved entries.
- **Model half.** `skills/cairn/SKILL.md` (recognize kind, pick tier, ask only for
  missing required fields, run adversary at full tier and dial ≥ 1, commit),
  `agents/cairn-adversary.md` (four outputs, never recommends),
  `skills/cairn/references/bluntness.md` (levels 0–3 phrasing rules).
- **Storage.** Appends to `ledger.jsonl`; the adversary pass is recorded on the entry.
- **Acceptance.** Quick tier: one exchange, no adversary. Full tier: adversary output
  shown, then commit; the entry carries `adversary.ran = true`. Dial 0 skips the
  adversary and marks the entry quick even if reasoning is present (no adversary pass,
  therefore not full). Adversary prompt contains no instruction about tone other than
  the reference file.
- **Status.** done
- **Spec.** [07-capture.md](roadmap/07-capture.md)

### 08 · resolve-review — `/cairn-resolve`, `/cairn-review`, the reviewer

- **Goal.** Closing the loop: resolutions that honor gates, and the weekly ritual that
  ends in forced choices and stated priorities.
- **Deterministic half.** `ledger.mjs resolve|release|reflect`, `gates.mjs`,
  `digest.mjs`, and a `ledger.mjs review` subcommand that appends the `review` event
  only when `canCloseReview` allows.
- **Model half.** `skills/cairn-resolve/SKILL.md`, `skills/cairn-review/SKILL.md`
  (digest → reviewer → forced choices → priorities → review record),
  `agents/cairn-reviewer.md` (numbers cited by id, drift of confidence from hit rate,
  the forced-choice list; never recommends what to decide).
- **Storage.** Appends `resolution`, `release`, `reflection`, `review`, and
  superseding `entry` events.
- **Acceptance.** A review cannot be recorded with an open in-scope item lacking a
  choice. Recommit and adjust produce new entries with `supersedes`. The review event
  carries priorities that `score.mjs` drift then reads. Reviewer prompt receives the
  digest and nothing else.
- **Status.** done
- **Spec.** [08-resolve-review.md](roadmap/08-resolve-review.md)

### 09 · instrument — settings, SessionStart hook, `/cairn-score`, `/cairn-tune`, export

- **Goal.** The dial and the rest of the instrument surface.
- **Deterministic half.** `tools/settings.mjs` (immutable revisions, `current.json`,
  `set`, `show`, `undo`, `history`), `hooks/hooks.json` and
  `hooks/session-start.mjs` (two lines from `debt.mjs`, silent when nothing due),
  `tools/export.mjs` (markdown and CSV of ledger and scores). `tests/settings.mjs`,
  `tests/export.mjs`, `tests/hooks.mjs` (no state, empty ledger, due, overdue,
  malformed ledger, missing node module).
- **Model half.** `skills/cairn-score/SKILL.md` (numbers by domain with plain
  explanations of Brier and calibration for non-technical users, from a reference
  file, no model-computed numbers), `skills/cairn-tune/SKILL.md` (bluntness, domains,
  cadence, witness contacts; shows revision and undo after each change).
- **Storage.** `settings/`, `exports/`.
- **Acceptance.** Hook emits nothing when debt is empty and exactly two lines
  otherwise; never exits non-zero. Undo restores the previous revision as a new one.
  Export round-trips: the CSV row count equals the entry count.
- **Status.** planned
- **Spec.** [09-instrument.md](roadmap/09-instrument.md)

### 10 · optional — Stop-hook capture and the witness

- **Goal.** The two opt-in surfaces, off by default, that must never write an entry on
  their own.
- **Deterministic half.** `hooks/stop-capture.mjs` (enabled only when
  `settings.capture_hook` is true; reads the transcript path from hook input; matches
  decision language; appends candidates to `pending.jsonl`; respects
  `stop_hook_active`), `tools/pending.mjs` (`list`, `confirm <n>` which hands the
  candidate to the capture flow, `discard <n>`). `tests/pending.mjs`.
- **Model half.** `/cairn` gains a pending review step at session start when
  candidates exist. `agents/cairn-witness.md` formats one commitment or resolution for
  a named person; the user sends it.
- **Storage.** `pending.jsonl`.
- **Acceptance.** With the setting off the hook exits without reading the transcript.
  With it on, a transcript containing "I'm going with X" yields one pending candidate
  and zero ledger entries. Witness output contains only what the entry contains.
- **Status.** planned
- **Spec.** [10-optional.md](roadmap/10-optional.md)

### 11 · release — README, packaging check, manifests, 0.1.0

- **Goal.** Installable from a clone in either host, with a five-minute walkthrough
  that ends in a scored prediction.
- **Deterministic half.** `tools/check-packaging.mjs` (manifest versions agree with
  `package.json` and the marketplace entry, every agent and skill file referenced
  exists, every markdown link resolves, no `.github/workflows`), `install-cairn-codex.mjs`
  (mirrors vonnegut's Codex installer), `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`.
- **Model half.** None.
- **Storage.** None.
- **Acceptance.** README walkthrough runs as written against a temporary
  `CAIRN_HOME` and produces a Brier score. `check.mjs` runs every test and the
  packaging check. Version 0.1.0 in `package.json`, both manifests, the marketplace
  entry, CHANGELOG, and STATUS `Last version:`, in one commit.
- **Status.** planned
- **Spec.** [11-release.md](roadmap/11-release.md)

## After 0.1.0

Not planned, recorded so they are not re-invented: a `/cairn-import` for existing
spreadsheets of predictions; per-domain minimum-n overrides; a witness channel that is
not the user's clipboard. None of these change the house rules.
