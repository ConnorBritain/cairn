#!/usr/bin/env node
// Item 04: score-core against the synthetic ledgers and their independent expectations.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, finish, group, ROOT, run, tempHome } from "./harness.mjs";
import { NOW } from "./fixtures/generate.mjs";
import { bucketOf, fold, isoWeek, score, summary } from "../tools/lib/score-core.mjs";
import { readEvents } from "../tools/lib/store.mjs";

const FIX = join(ROOT, "tests", "fixtures");
const load = (name) => {
  const home = tempHome();
  mkdirSync(home, { recursive: true });
  copyFileSync(join(FIX, `${name}.jsonl`), join(home, "ledger.jsonl"));
  return { home, events: readEvents(home), expected: JSON.parse(readFileSync(join(FIX, `${name}.expected.json`), "utf8")) };
};
const close = (a, b, tol = 0.0005) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

group("primitives");
check("folding negates a sub-50 claim and its outcome", "a 30% prediction that resolves false is a hit at 70%; without folding the curve reads backwards", () => {
  assert.deepEqual(fold(30, 0), { p: 70, o: 1 });
  assert.deepEqual(fold(30, 1), { p: 70, o: 0 });
  assert.deepEqual(fold(70, 1), { p: 70, o: 1 });
  assert.deepEqual(fold(40, 0.5), { p: 60, o: 0.5 });
  assert.deepEqual(bucketOf(70), [70, 79]);
  assert.deepEqual(bucketOf(100), [90, 100]);
  assert.equal(bucketOf(49), null);
});
check("ISO week", "drift by week groups on this; a wrong week boundary hides clustering", () => {
  assert.equal(isoWeek("2026-01-01T00:00:00Z"), "2026-W01");
  assert.equal(isoWeek("2026-09-22T12:00:00Z"), "2026-W39");
  assert.equal(isoWeek("2027-01-03T00:00:00Z"), "2026-W53");
});

group("fixtures agree with independent expectations");
for (const name of ["well-calibrated", "overconfident", "hedging", "high-release"]) {
  check(name, "score-core and the plain-loop expectation must produce the same numbers to three decimals, or one of them is wrong", () => {
    const { events, expected } = load(name);
    const s = score(events, NOW);
    assert.equal(s.n.entries, expected.n.entries);
    assert.equal(s.n.scored, expected.n.scored);
    assert.equal(s.n.resolved, expected.n.resolved);
    assert.equal(s.n.released, expected.n.released);
    assert.equal(s.overdue_count, expected.n.overdue);
    close(s.brier.overall.value, expected.brier_overall);
    for (const [d, v] of Object.entries(expected.by_domain)) {
      assert.equal(s.brier.by_domain[d].n, v.n, d);
      if (v.n >= 5) close(s.brier.by_domain[d].value, v.brier); else assert.equal(s.brier.by_domain[d].insufficient, true, d);
    }
    for (const b of s.calibration.buckets) {
      const e = expected.calibration[b.range];
      assert.equal(b.n, e ? e.n : 0, b.range);
      if (e && e.n >= 5) { close(b.mean_confidence, e.mean_confidence); close(b.hit_rate, e.hit_rate); }
    }
    close(s.informativeness.value, expected.informativeness);
    if (expected.release_rate !== null && s.release_rate.n >= 5) close(s.release_rate.value, expected.release_rate);
    close(s.process.mean.value, expected.process_mean);
    if (expected.drift_n) { assert.equal(s.drift.n, expected.drift_n); close(s.drift.total_variation, expected.drift_total_variation); }
  });
}

group("signatures");
check("well-calibrated: every usable bucket within ±0.05, Brier near c(1−c)", "the curve must read flat for a calibrated record, or the reviewer will report drift that is not there", () => {
  const { events } = load("well-calibrated");
  const s = score(events, NOW);
  for (const b of s.calibration.buckets) if (!b.insufficient) assert.ok(Math.abs(b.gap) <= 0.05, `${b.range} gap ${b.gap}`);
  assert.ok(s.brier.overall.value > 0.12 && s.brier.overall.value < 0.20, `Brier ${s.brier.overall.value}`);
  assert.equal(s.brier.by_domain.misc.insufficient, true);
  assert.equal(s.overdue_count, 2);
  assert.equal(s.calibration.expected_error.value <= 0.05, true);
});
check("overconfident: top buckets hit well below stated confidence, Brier worse than calibrated", "this is the record the adversary exists for; the numbers must show it without a model saying so", () => {
  const over = score(load("overconfident").events, NOW);
  const cal = score(load("well-calibrated").events, NOW);
  for (const b of over.calibration.buckets) if (!b.insufficient) assert.ok(b.gap < -0.2, `${b.range} gap ${b.gap}`);
  assert.ok(over.brier.overall.value > cal.brier.overall.value);
  assert.ok(over.calibration.expected_error.value > 0.2);
});
check("hedging: informativeness low, Brier near 0.25", "confidence that never leaves 50 is unfalsifiable; informativeness is the number that names it", () => {
  const s = score(load("hedging").events, NOW);
  assert.ok(s.informativeness.value < 0.15, `informativeness ${s.informativeness.value}`);
  assert.ok(Math.abs(s.brier.overall.value - 0.25) < 0.02, `Brier ${s.brier.overall.value}`);
});
check("high-release: release rate above the others, process flags mixed, stake rate computed", "release is the escape hatch; its rate must be visible and honest", () => {
  const s = score(load("high-release").events, NOW);
  assert.ok(Math.abs(s.release_rate.value - 0.45) < 0.001, `release ${s.release_rate.value}`);
  assert.ok(score(load("well-calibrated").events, NOW).release_rate.value < s.release_rate.value);
  assert.ok(s.process.by_flag.adversary.value > 0.3 && s.process.by_flag.adversary.value < 0.7);
  assert.equal(s.stake.honored_rate.n, 11);
  assert.equal(s.brier.by_kind.commitment.n, 22);
});

group("rules");
check("every statistic below min n is insufficient and carries n; min n is configurable", "a number from three data points is a guess in a number's clothes", () => {
  const { events } = load("well-calibrated");
  const s = score(events, NOW, { domain: "misc" });
  assert.deepEqual(s.brier.overall, { insufficient: true, n: 3 });
  assert.equal(s.informativeness.insufficient, true);
  assert.equal(s.calibration.expected_error.insufficient, true);
  const loose = score(events, NOW, { domain: "misc", minN: 3 });
  assert.equal(loose.brier.overall.n, 3);
  assert.equal(typeof loose.brier.overall.value, "number");
});
check("drift: no review → insufficient with reason; multi-domain entries split", "drift is measured against stated priorities; without them there is nothing to measure and the tool must say so", () => {
  const { events } = load("well-calibrated");
  const noReview = events.filter((e) => e.event !== "review");
  assert.deepEqual(score(noReview, NOW).drift, { insufficient: true, n: 0, reason: "no review recorded" });
  const review = events.find((e) => e.event === "review");
  const entry = { ...events.find((e) => e.event === "entry"), id: "p-20260901-zzzz", ts: "2026-09-01T00:00:00Z", domains: ["work", "health"] };
  const d = score([review, entry], NOW).drift;
  assert.equal(d.n, 1);
  assert.equal(d.by_domain.work.actual, 0.5);
  assert.equal(d.by_domain.health.actual, 0.5);
  assert.equal(d.total_variation, 0);
  assert.equal(d.insufficient, true);
  assert.equal(d.by_week[0].week, "2026-W36");
});
check("superseded and released are excluded from Brier, counted separately", "a revised entry was never tested; scoring it would reward editing the record", () => {
  const { events } = load("well-calibrated");
  const base = score(events, NOW);
  const target = events.find((e) => e.event === "entry" && e.kind === "prediction");
  const sup = { ...target, id: "p-20260920-supr", ts: "2026-09-20T00:00:00Z", links: { related: [], supersedes: target.id } };
  const s = score([...events, sup], NOW);
  assert.equal(s.n.scored, base.n.scored - 1);
  assert.equal(s.revised_count, 1);
});
check("--summary carries only the adversary's fields", "the adversary must not receive statistics it could turn into a verdict about the person", () => {
  const { events } = load("well-calibrated");
  const s = summary(events, NOW, "work");
  assert.deepEqual(Object.keys(s).sort(), ["brier", "calibration", "domain", "informativeness", "n", "overdue_count"]);
  assert.deepEqual(Object.keys(s.n).sort(), ["overdue", "resolved", "scored"]);
});

group("CLI");
check("score and score --summary via the CLI; usage errors exit 2", "skills call this; wrong flags must fail loudly, not print zeros", () => {
  const { home } = load("overconfident");
  const j = run(["score", "--json"], { home, now: NOW });
  assert.equal(j.status, 0, j.stderr);
  assert.ok(j.json.brier.overall.value > 0.3);
  const t = run(["score"], { home, now: NOW });
  assert.match(t.stdout, /Brier overall/);
  assert.match(t.stdout, /Calibration/);
  const s = run(["score", "--domain", "work", "--summary", "--json"], { home, now: NOW });
  assert.equal(s.json.domain, "work");
  assert.equal(run(["score", "--summary"], { home }).status, 2);
  assert.equal(run(["score", "--kind", "bogus"], { home }).status, 2);
  assert.equal(run(["score", "extra"], { home }).status, 2);
  assert.equal(run(["score", "--min-n", "0"], { home }).status, 2);
  const empty = run(["score", "--json"], { home: tempHome(), now: NOW });
  assert.equal(empty.status, 0);
  assert.equal(empty.json.n.entries, 0);
  assert.equal(empty.json.brier.overall.insufficient, true);
});

finish();
