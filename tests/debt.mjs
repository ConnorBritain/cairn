#!/usr/bin/env node
// Item 05: debt classification, the two-line form, and speed.
import assert from "node:assert/strict";
import { check, finish, group, run, tempHome } from "./harness.mjs";
import { debt, debtLines } from "../tools/lib/debt-core.mjs";

const NOW = "2026-09-22T12:00:00Z";
const links = { related: [], supersedes: null };
const adversary = { ran: true, at: NOW, other_side: "a", failure_conditions: "b", base_rate_question: "c", record_question: "d" };
const pred = (id, date, extra = {}) => ({ event: "entry", id, ts: "2026-09-01T00:00:00Z", kind: "prediction", tier: "quick", domains: ["a"], text: `t ${id}`, confidence: 60, criterion: "c", dates: { resolve_by: date }, links, ...extra });
const review = (ts) => ({ event: "review", id: "v-20260901-aaaa", ts, period: { from: ts, to: ts }, choices: [], priorities: [{ domain: "a", weight: 1 }] });

group("classification");
check("empty ledger yields empty debt and no lines", "the hook must stay silent in a repo with nothing due", () => {
  const d = debt([], NOW);
  assert.deepEqual(d.overdue, []);
  assert.deepEqual(d.due_this_week, []);
  assert.equal(d.blocked.full_tier_capture, false);
  assert.equal(d.last_review, null);
  assert.equal(d.review_due, false);
  assert.deepEqual(debtLines(d), []);
});
check("overdue, due-this-week and far-future at the day boundaries", "off by one day here blocks capture wrongly or hides a due item", () => {
  const events = [
    pred("p-20260901-0001", "2026-09-21"),   // overdue by 1 day
    pred("p-20260901-0002", "2026-09-10"),   // overdue by 12 days
    pred("p-20260901-0003", "2026-09-22"),   // due today
    pred("p-20260901-0004", "2026-09-29"),   // due in 7 days: in window
    pred("p-20260901-0005", "2026-09-30"),   // 8 days: out
    { ...pred("n-20260901-0006", undefined), kind: "note", dates: {}, confidence: null, criterion: null },
  ];
  const d = debt(events, NOW);
  assert.deepEqual(d.overdue.map((r) => [r.id, r.days_over]), [["p-20260901-0002", 12], ["p-20260901-0001", 1]]);
  assert.deepEqual(d.due_this_week.map((r) => [r.id, r.days_left]), [["p-20260901-0003", 0], ["p-20260901-0004", 7]]);
  assert.equal(d.counts.open, 6);
  assert.equal(d.counts.overdue, 2);
});
check("blocked mirrors the overdue gate", "debt and the gate must never disagree about whether capture is blocked", () => {
  const quickOverdue = [pred("p-20260901-0001", "2026-09-01")];
  assert.equal(debt(quickOverdue, NOW).blocked.full_tier_capture, false);
  const fullOverdue = [pred("p-20260901-0002", "2026-09-01", { tier: "full", reasoning: "r", adversary })];
  const d = debt(fullOverdue, NOW);
  assert.equal(d.blocked.full_tier_capture, true);
  assert.deepEqual(d.blocked.by, ["p-20260901-0002"]);
});
check("review due: never reviewed with entries; 6 days no; 7 days yes; cadence configurable", "the ritual is the only place forced choices happen; the reminder must fire on the cadence exactly", () => {
  assert.equal(debt([pred("p-20260901-0001", "2026-12-01")], NOW).review_due, true);
  assert.equal(debt([review("2026-09-16T12:00:00Z")], NOW).review_due, false);
  assert.equal(debt([review("2026-09-15T12:00:00Z")], NOW).review_due, true);
  assert.equal(debt([review("2026-09-15T12:00:00Z")], NOW).last_review.days_since, 7);
  assert.equal(debt([review("2026-09-15T12:00:00Z")], NOW, { review_cadence_days: 14 }).review_due, false);
});

group("text form");
check("two lines when both have content, one when only one does", "the hook's contract is at most two lines; a third line is noise in every session", () => {
  const both = debt([pred("p-20260901-0001", "2026-09-01"), review("2026-09-01T00:00:00Z")], NOW);
  const lines = debtLines(both);
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "cairn: 1 overdue (p-20260901-0001 due 2026-09-01)");
  assert.equal(lines[1], "cairn: last review 21 days ago · review due");
  const onlyReview = debtLines(debt([review("2026-09-01T00:00:00Z")], NOW));
  assert.deepEqual(onlyReview, ["cairn: last review 21 days ago · review due"]);
  const onlyDebt = debtLines(debt([pred("p-20260901-0001", "2026-09-01"), review("2026-09-21T00:00:00Z")], NOW));
  assert.deepEqual(onlyDebt, ["cairn: 1 overdue (p-20260901-0001 due 2026-09-01)", "cairn: last review 1 day ago"]);
  const many = debtLines(debt([pred("p-20260901-0001", "2026-09-01"), pred("p-20260901-0002", "2026-09-02", { tier: "full", reasoning: "r", adversary }), pred("p-20260901-0003", "2026-09-25")], NOW));
  assert.equal(many[0], "cairn: 2 overdue (p-20260901-0001 due 2026-09-01 +1 more) · 1 due this week · full-tier capture blocked");
  assert.equal(many[1], "cairn: no review yet · review due");
});

group("speed");
check("debt() on a 10k-entry ledger runs under 100 ms", "the hook runs at every session start; a slow hook gets uninstalled", () => {
  const events = [];
  for (let i = 0; i < 10_000; i += 1) events.push(pred(`p-20260901-${i.toString(36).padStart(4, "0")}`, i % 2 ? "2026-09-01" : "2026-12-01"));
  debt(events, NOW);
  const start = process.hrtime.bigint();
  debt(events, NOW);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 100, `${ms.toFixed(1)} ms`);
});

group("CLI");
check("cairn debt: silent on empty, two lines when due, --json, usage", "skills and the hook call this; the text and json forms must agree", () => {
  const home = tempHome();
  const empty = run(["debt"], { home, now: NOW });
  assert.equal(empty.status, 0);
  assert.equal(empty.stdout, "");
  assert.equal(run(["debt", "--json"], { home, now: NOW }).json.review_due, false);
  run(["add", "--kind", "commitment", "--text", "x", "--domain", "a", "--due-by", "2026-09-20"], { home, now: "2026-09-01T00:00:00Z" });
  const due = run(["debt"], { home, now: NOW });
  assert.equal(due.stdout.split("\n").filter(Boolean).length, 2);
  assert.match(due.stdout, /1 overdue/);
  assert.match(due.stdout, /no review yet · review due/);
  const j = run(["debt", "--json"], { home, now: NOW });
  assert.equal(j.json.counts.overdue, 1);
  assert.equal(run(["debt", "extra"], { home }).status, 2);
  assert.equal(run(["debt", "help"], { home }).status, 0);
});

finish();
