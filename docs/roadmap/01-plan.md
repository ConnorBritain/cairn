# 01 · plan

**Goal.** A session with no memory can pick up the next deliverable from files alone,
and cannot ship a version without recording what shipped.

## Deliverables

- `docs/ROADMAP.md` — every item with goal, deterministic half, model half, storage,
  acceptance, status, and the cross-cutting decisions.
- `docs/roadmap/NN-<item>.md` — one spec per item, this file included.
- `docs/roadmap/STATUS.md` — the checklist and `Last version:`.
- `CONTRIBUTING.md` — conventions plus the **Resuming work** section.
- `DESIGN.md` — the eight house rules verbatim, the model, the mechanisms.
- `tools/check.mjs` — sequential verifier; runs every check script and test, stops at
  the first failure, prints the count. Mirrors vonnegut's `tools/check.mjs`.
- `tools/check-status.mjs` — the version/STATUS guard (below).
- `package.json` at `0.0.0`, `README.md` stub, `CHANGELOG.md`, `AGENTS.md`,
  `CLAUDE.md`, `LICENSE`, `.gitignore`.

## The version/STATUS guard

Two checks, both in `tools/check-status.mjs`, both stdlib only:

1. **Pointer equality.** `docs/roadmap/STATUS.md` has a line `Last version: X.Y.Z`.
   It must equal `package.json` `version`. This works in any checkout, git or not, and
   is the primary check: a version bump that forgets STATUS fails immediately.
2. **Same-diff rule.** In a git checkout, `git diff --name-only <range>` (default
   `HEAD~1..HEAD`; `--staged` compares the index against `HEAD`) is inspected. If
   `package.json` is in the diff and its `version` differs between the two sides, then
   `docs/roadmap/STATUS.md` must be in the diff too. A repo with fewer than two commits
   passes this check vacuously.

Exit 0 on pass, 1 on failure with the reason, 2 on usage error.

## Acceptance

- `node tools/check.mjs` exits 0 on the fresh repo.
- `node tools/check-status.mjs` exits 1 when `Last version:` and `package.json`
  disagree (verified on a scratch copy, not committed).
- STATUS lists exactly the ROADMAP items, same ids, same order.
- Committed as one commit with STATUS item 01 checked.

## Status

done
