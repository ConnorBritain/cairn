# Cairn

A decision and prediction ledger for coding agents. You pre-register predictions,
choices and commitments with a confidence and a date. A script scores the record when
it resolves. A fresh-context adversary argues the other side before you commit. A
Socratic coach reads the numbers back at review and never tells you what to decide.

Plain Markdown and JSONL in your own directory. Runs as a Claude Code or Codex plugin
plus a dependency-free Node CLI. No network, no API keys: model roles run as
subagents of the host session you are already in.

## What it does

- **Capture** (`/cairn`): a sentence becomes an entry. Quick tier is one exchange.
  Full tier adds frozen reasoning, an if-then, and an adversary pass in clean context.
- **Score** (`/cairn-score`, `cairn score`): Brier by domain, a calibration curve,
  informativeness, release rate, process score, and drift from your stated
  priorities. Every number carries its `n`; below five it says `insufficient`.
- **Resolve** (`/cairn-resolve`): outcome against the pre-registered criterion. A
  release needs a reason.
- **Review** (`/cairn-review`): the weekly ritual. Digest, reviewer, a forced choice
  (recommit, adjust, release) for every open item, then your priorities for the next
  period, which is what drift measures.
- **Debt at session start**: two lines, silent when nothing is due. Full-tier
  capture is refused while a full-tier entry is overdue; quick capture never is.
- **Tune** (`/cairn-tune`): one bluntness dial, 0 instrument to 3 hard, versioned
  with undo. It changes phrasing, never what a role may claim.

The rules that bind all of this are in [`DESIGN.md`](DESIGN.md). The short version:
scripts count, models judge; entries are immutable; roles cite ids; signals, never
verdicts about the person; pressure by mechanism, never tone; your files, your
directory; no network.

## Install

Node.js 18 or later. Model roles need an authenticated Claude Code or Codex session.

### Claude Code

```text
/plugin marketplace add ConnorBritain/cairn
/plugin install cairn@cairn
```

Restart the session. The SessionStart hook prints decision debt when something is
due. Skills reach the tools by relative path; nothing else needs to be on `PATH`.

### Codex

```bash
git clone https://github.com/ConnorBritain/cairn.git
cd cairn
node install-cairn-codex.mjs
node install-cairn-codex.mjs --check
```

This installs the checkout as a plugin and the three roles as custom agents. Keep the
checkout at that path. Codex does not run the SessionStart hook; run `cairn debt`
(or `node tools/cli.mjs debt`) when you start, or add that line to your own hooks.

### The CLI on its own

```bash
git clone https://github.com/ConnorBritain/cairn.git
cd cairn && npm link        # puts `cairn` on PATH; or use node tools/cli.mjs
```

Everything below works with `cairn` replaced by `node tools/cli.mjs`.

### Where your state lives

`CAIRN_HOME` if set; else the nearest `docs/cairn/` walking up from the working
directory (create it to keep a ledger per project); else `~/.cairn`. Inside:
`ledger.jsonl` (append-only), `settings/`, `pending.jsonl`, `exports/`. All
git-friendly. Nothing is ever written under the plugin install.

## Five-minute walkthrough

Pick a date about a week out and put it in place of `<date>`. Each command is one
line; `<id>` is the id the first command prints.

```bash
cairn add --kind prediction --text "The vendor delivers the API by the end of next week" --confidence 70 --criterion "Their endpoint answers a real request from our staging environment" --domain work --resolve-by <date>
cairn debt
cairn ledger show <id>
cairn resolve <id> --outcome true
cairn score --domain work
cairn export ledger --format csv
```

What happened:

1. `add` refused nothing, because a prediction needs only a claim, a confidence, a
   criterion someone else could check, a domain and a date. That is the quick tier.
   The entry line is now immutable; corrections are new entries with `--supersedes`.
2. `debt` printed one line saying the entry is due this week, and one saying no
   review has happened yet. In a session it is the hook that prints this.
3. `show` printed the frozen terms and the derived status.
4. `resolve` computed a Brier score of 0.09 (you said 70%, it happened: (0.7 − 1)²)
   and a process score of 0.33 (criterion yes, reasoning no, adversary no).
5. `score` printed `insufficient (n=1)` for Brier, calibration and the rest. That is
   the point: the numbers earn trust with `n`, and the tool will not print a
   statistic from one entry. The single entry's own Brier is on its resolution
   (`cairn ledger show <id>`); a domain gets a Brier at five resolved entries.
6. `export` wrote a CSV under `exports/` in your state directory.

Now try the same entry at full tier inside a session: say "I think the vendor will
deliver by next Friday, 70%, because …" and let `/cairn` run the adversary. Then set
`/cairn-tune bluntness 2` and capture another.

## Reading the numbers

- **Brier.** Your confidence as 0–1, minus what happened (1, 0, or 0.5 for partial),
  squared, averaged. 0 is perfect; 0.25 is always saying 50%; 1 is certain and wrong.
- **Calibration.** Entries grouped by stated confidence (50–59 … 90–100, after
  folding sub-50 claims), with the hit rate in each group. The gap is hit rate minus
  mean confidence. Negative means overconfident in that group.
- **Informativeness.** How far your confidences sit from 50%, 0–1. Hedging scores
  low here and near 0.25 on Brier.
- **Release rate.** Closed entries you let go of instead of resolving.
- **Process.** Of adversary, criterion, reasoning, how many were on the entry.
- **Drift.** Your last review's stated priorities against where entries actually
  went since, by domain and by week.

`cairn score` prints all of it; `/cairn-score` explains each in plain words.

## The roles

| Role | Runs | Reads | Never |
|---|---|---|---|
| `cairn-adversary` | full-tier capture | the draft, your domain summary, up to five related resolved entries | recommends |
| `cairn-reviewer` | `/cairn-review` | the digest, nothing else | recommends what to decide |
| `cairn-witness` | on request | one entry and a name | sends anything |

Roles have no tools. Their tone comes from one file,
[`skills/cairn/references/bluntness.md`](skills/cairn/references/bluntness.md).

## Known limits

- A role's judgment is a model's judgment. The adversary can be wrong; the reviewer
  can miss a pattern. What it cannot do is cite something that is not in the ledger,
  because it is not given anything else.
- Calibration needs data. Five entries per bucket before a hit rate is printed;
  expect `insufficient` for the first weeks.
- Confidence on choices and commitments is your probability that the criterion will
  be met. That makes one Brier formula cover every kind, and it means a commitment
  captured at quick tier defaults to 100% and scores accordingly.
- The Stop-hook capture is a regex over your own turns. It is off by default and it
  only ever writes candidates you confirm or discard.
- Two machines appending to one git-synced ledger will not collide on ids, but git
  will still ask you to merge the file; both sides are append-only, so take both.

## Development

```bash
node tools/check.mjs          # status guard, packaging check, every test
```

Live checks are opt-in and separate: `node tools/check-installation.mjs` installs into
temporary config directories with no model calls; `node tools/live-smoke.mjs --yes`
runs the capture skill in headless sessions and asserts on the ledger and the tool
stream; `claude plugin eval .` runs the `evals/` suite. See CONTRIBUTING → Live
verification.

No dependencies, no GitHub Actions. See [`CONTRIBUTING.md`](CONTRIBUTING.md), the
roadmap in [`docs/ROADMAP.md`](docs/ROADMAP.md) and progress in
[`docs/roadmap/STATUS.md`](docs/roadmap/STATUS.md). Conventions follow
[vonnegut](https://github.com/ConnorBritain/vonnegut) and
[roadmap](https://github.com/ConnorBritain/roadmap).

## License

[MIT](LICENSE).
