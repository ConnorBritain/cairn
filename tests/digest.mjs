#!/usr/bin/env node
// Item 06: the digest cites only what exists, covers everything on a first review, and
// says nothing in its own words.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { check, finish, group, ROOT, run, tempHome } from "./harness.mjs";
import { NOW } from "./fixtures/generate.mjs";
import { digest, LABELS, renderDigest } from "../tools/lib/digest-core.mjs";
import { canCloseReview } from "../tools/lib/gates-core.mjs";
import { readEvents } from "../tools/lib/store.mjs";

const load = (name) => {
  const home = tempHome();
  mkdirSync(home, { recursive: true });
  copyFileSync(join(ROOT, "tests", "fixtures", `${name}.jsonl`), join(home, "ledger.jsonl"));
  return { home, events: readEvents(home) };
};
const ID = /\b[pcmnrlfv]-\d{8}-[0-9a-z]{4}\b/g;

group("contents");
check("every id in the markdown exists in the JSON and in the ledger", "the reviewer cites ids; an id that is not in the record is a fabrication the digest handed it", () => {
  const { events } = load("well-calibrated");
  const d = digest(events, NOW);
  const md = renderDigest(d);
  const known = new Set(events.map((e) => e.id));
  const inJson = new Set(JSON.stringify(d).match(ID) || []);
  const cited = [...new Set(md.match(ID) || [])];
  assert.ok(cited.length > 0);
  for (const id of cited) { assert.ok(known.has(id), `${id} not in ledger`); assert.ok(inJson.has(id), `${id} not in json`); }
});
check("period follows the last review; resolved/released are those closed after it", "a digest that re-reports last week's resolutions makes the reviewer repeat itself", () => {
  const { events } = load("high-release");
  const d = digest(events, NOW);
  const review = events.find((e) => e.event === "review");
  assert.equal(d.period.from, review.ts);
  assert.equal(d.period.first_review, false);
  assert.ok(d.resolved.every((r) => Date.parse(r.resolved_at) > Date.parse(review.ts)));
  assert.ok(d.released.every((r) => Date.parse(r.released_at) > Date.parse(review.ts)));
  const closedBefore = events.filter((e) => (e.event === "resolution" || e.event === "release") && Date.parse(e.ts) <= Date.parse(review.ts)).length;
  assert.ok(closedBefore > 0, "fixture has closures before the review");
  assert.equal(d.resolved.length + d.released.length, events.filter((e) => (e.event === "resolution" || e.event === "release") && Date.parse(e.ts) > Date.parse(review.ts)).length);
  assert.deepEqual(d.priorities_stated, review.priorities);
});
check("no review yet → first review covering everything since the first entry", "the first review must not silently drop the whole history", () => {
  const { events } = load("well-calibrated");
  const noReview = events.filter((e) => e.event !== "review");
  const d = digest(noReview, NOW);
  assert.equal(d.period.first_review, true);
  assert.equal(d.period.from, noReview[0].ts);
  assert.equal(d.resolved.length, noReview.filter((e) => e.event === "resolution").length);
  assert.deepEqual(d.priorities_stated, []);
  assert.equal(d.drift.reason, "no review recorded");
  assert.match(renderDigest(d), /\(first review\)/);
});
check("open_in_scope equals the review gate's blocking set", "the digest promises the reviewer a forced-choice list; the gate must demand exactly that list", () => {
  const { events } = load("well-calibrated");
  const d = digest(events, NOW);
  const gate = canCloseReview({ choices: [] }, events, NOW);
  assert.deepEqual(d.open_in_scope.map((r) => r.id), gate.blocking);
  assert.ok(d.open_in_scope.length >= d.overdue.length);
});
check("scores and drift are the score-core objects, not recomputed", "one formula, one place; the digest must not carry a second arithmetic", () => {
  const { events } = load("overconfident");
  const d = digest(events, NOW);
  assert.equal(d.scores.calibration.buckets.length, 5);
  assert.equal(d.drift, d.scores.drift);
});
check("empty ledger digests cleanly", "a new user's first /cairn-review must not crash on nothing", () => {
  const d = digest([], NOW);
  assert.equal(d.period.first_review, true);
  assert.deepEqual(d.open_in_scope, []);
  assert.match(renderDigest(d), /- none/);
});

group("vocabulary");
check("markdown uses only the label vocabulary plus record content", "prose in the digest becomes prose the reviewer repeats as if it were evidence", () => {
  const { events } = load("well-calibrated");
  const d = digest(events, NOW);
  const md = renderDigest(d);
  const allowed = new Set(Object.values(LABELS).flatMap((l) => l.toLowerCase().split(/[^a-z-]+/)).filter(Boolean));
  const record = new Set();
  for (const e of events) for (const v of [e.text, e.criterion, e.reason, e.outcome, e.stake_honored, e.kind, e.tier, e.status, e.if_then, ...(e.domains || [])]) {
    if (typeof v === "string") for (const w of v.toLowerCase().split(/[^a-z-]+/)) if (w) record.add(w);
  }
  for (const w of ["open", "overdue", "resolved", "released", "superseded", "true", "false", "yes", "no", "partial", "kept", "missed", "n/a"]) record.add(w);
  const stripped = md.replace(ID, " ").replace(/\d{4}-W\d{2}|\d{4}-\d{2}-\d{2}T[0-9:.]+Z|\d{4}-\d{2}-\d{2}|[+-]?\d[\d.%]*|\s[—–-]\s|%/g, " ");
  const words = [...new Set(stripped.toLowerCase().split(/[^a-z-]+/).filter(Boolean))];
  const stray = words.filter((w) => !allowed.has(w) && !record.has(w) && w !== "n");
  assert.deepEqual(stray, []);
});

group("CLI");
check("cairn digest prints markdown, --json prints the object, usage errors exit 2", "the review skill pastes this verbatim into the reviewer prompt", () => {
  const { home } = load("hedging");
  const md = run(["digest"], { home, now: NOW });
  assert.equal(md.status, 0, md.stderr);
  assert.match(md.stdout, /^# Cairn digest/);
  assert.match(md.stdout, /## Open items requiring a forced choice/);
  const j = run(["digest", "--json"], { home, now: NOW });
  assert.equal(j.json.scores.informativeness.value < 0.15, true);
  assert.equal(run(["digest", "extra"], { home }).status, 2);
  assert.equal(run(["digest", "--min-n", "x"], { home }).status, 2);
});

finish();
