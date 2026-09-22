#!/usr/bin/env node
// Item 03: the three gates, as functions, as a CLI, and as wired into the ledger.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, finish, group, run, tempHome } from "./harness.mjs";
import { canAdd, canCloseReview, canRelease, reviewScope } from "../tools/lib/gates-core.mjs";
import { readEvents } from "../tools/lib/store.mjs";

const TS = "2026-09-22T12:00:00Z";
const LATE = "2026-10-20T00:00:00Z";
const adversary = { ran: true, at: TS, other_side: "a", failure_conditions: "b", base_rate_question: "c", record_question: "d" };
const links = { related: [], supersedes: null };
const quick = (id, date) => ({ event: "entry", id, ts: TS, kind: "prediction", tier: "quick", domains: ["a"], text: "q", confidence: 60, criterion: "c", dates: { resolve_by: date }, links });
const full = (id, date) => ({ ...quick(id, date), tier: "full", reasoning: "r", adversary });
const release = (id, entry) => ({ event: "release", id, ts: TS, entry, reason: "r" });
const resolution = (id, entry) => ({ event: "resolution", id, ts: TS, entry, outcome: "true", outcome_score: 0.16, process_score: 1, stake_honored: "n/a" });

group("overdue gate");
check("full add refused while a full entry is overdue; allowed once it is resolved or released", "this is the mechanism that makes debt bind; if it leaks, nothing forces a resolution", () => {
  const events = [full("p-20260901-aaaa", "2026-10-01")];
  const refused = canAdd({ tier: "full" }, events, LATE);
  assert.equal(refused.allowed, false);
  assert.deepEqual(refused.blocking, ["p-20260901-aaaa"]);
  assert.match(refused.reasons[0], /full-tier capture blocked: 1 full-tier entry is overdue \(p-20260901-aaaa\)/);
  assert.equal(canAdd({ tier: "full" }, events, "2026-10-01T23:59:59Z").allowed, true);
  assert.equal(canAdd({ tier: "full" }, [...events, resolution("r-20261002-aaaa", "p-20260901-aaaa")], LATE).allowed, true);
  assert.equal(canAdd({ tier: "full" }, [...events, release("l-20261002-aaaa", "p-20260901-aaaa")], LATE).allowed, true);
});
check("quick-tier overdue does not block; quick and note adds always pass", "capture must never be blocked by debt, or the user stops capturing and the record ends", () => {
  const events = [quick("p-20260901-bbbb", "2026-10-01"), full("p-20260901-cccc", "2026-10-01")];
  assert.equal(canAdd({ tier: "full" }, [events[0]], LATE).allowed, true);
  assert.equal(canAdd({ tier: "quick" }, events, LATE).allowed, true);
  assert.equal(canAdd({ tier: "quick", kind: "note" }, events, LATE).allowed, true);
});

check("strict mode: quick scored capture refused while any scored entry is overdue; notes always pass; default unchanged", "the setting must hold quick capture without ever closing the note, or the record ends when the gate closes", () => {
  const strict = { overdue_gate: "strict" };
  const quickOverdue = [quick("p-20260901-h001", "2026-10-01")];
  const fullOverdue = [full("p-20260901-h002", "2026-10-01")];
  const refused = canAdd({ tier: "quick", kind: "prediction" }, quickOverdue, LATE, strict);
  assert.equal(refused.allowed, false);
  assert.match(refused.reasons[0], /capture blocked \(overdue_gate=strict\): 1 entry is overdue \(p-20260901-h001\)\. Resolve or release one, or capture a note\./);
  assert.deepEqual(refused.blocking, ["p-20260901-h001"]);
  assert.equal(canAdd({ tier: "quick", kind: "commitment" }, fullOverdue, LATE, strict).allowed, false);
  assert.equal(canAdd({ tier: "full", kind: "choice" }, quickOverdue, LATE, strict).allowed, false);
  assert.equal(canAdd({ tier: "quick", kind: "note" }, [...quickOverdue, ...fullOverdue], LATE, strict).allowed, true);
  assert.equal(canAdd({ tier: "quick", kind: "prediction" }, quickOverdue, "2026-10-01T23:59:59Z", strict).allowed, true);
  assert.equal(canAdd({ tier: "quick", kind: "prediction" }, quickOverdue, LATE, { overdue_gate: "full" }).allowed, true);
  assert.equal(canAdd({ tier: "quick", kind: "prediction" }, quickOverdue, LATE).allowed, true);
  assert.equal(canAdd({ tier: "full", kind: "prediction" }, quickOverdue, LATE, strict).allowed, false);
  const noteOverdue = [{ event: "entry", id: "n-20260901-h003", ts: TS, kind: "note", tier: "quick", domains: ["general"], text: "n", dates: { resolve_by: "2026-10-01" }, links }];
  assert.equal(canAdd({ tier: "quick", kind: "prediction" }, noteOverdue, LATE, strict).allowed, true, "an overdue note does not block");
});

group("release gate");
check("release refused without a reason, with whitespace, or on a closed entry", "a free release is the cheapest escape from the record", () => {
  const e = quick("p-20260901-dddd", "2026-10-01");
  assert.equal(canRelease(e, "", [e], TS).allowed, false);
  assert.equal(canRelease(e, "   ", [e], TS).allowed, false);
  assert.equal(canRelease(e, undefined, [e], TS).allowed, false);
  assert.equal(canRelease(e, "moved on", [e], TS).allowed, true);
  const closed = canRelease(e, "moved on", [e, resolution("r-20261002-dddd", e.id)], TS);
  assert.equal(closed.allowed, false);
  assert.match(closed.reasons[0], /it is resolved/);
  assert.equal(canRelease(undefined, "x").allowed, false);
});

group("review gate");
check("scope: overdue, due within cadence, explicitly listed; not notes without dates, not far-future", "the scope decides what the ritual forces; too wide and reviews never close, too narrow and debt hides", () => {
  const events = [
    quick("p-20260901-e001", "2026-09-20"),   // overdue at TS
    quick("p-20260901-e002", "2026-09-28"),   // due within 7 days
    quick("p-20260901-e003", "2026-12-01"),   // far future
    { event: "entry", id: "n-20260901-e004", ts: TS, kind: "note", tier: "quick", domains: ["general"], text: "n", dates: {}, links },
  ];
  const ids = reviewScope(events, TS, {}).map((r) => r.id);
  assert.deepEqual(ids, ["p-20260901-e001", "p-20260901-e002"]);
  const listed = reviewScope(events, TS, {}, { choices: [{ entry: "p-20260901-e003", action: "release", result: "l-20260922-zzzz" }] }).map((r) => r.id);
  assert.ok(listed.includes("p-20260901-e003"));
  const wide = reviewScope(events, TS, { review_cadence_days: 90 }).map((r) => r.id);
  assert.ok(wide.includes("p-20260901-e003"));
});
check("review refused while an in-scope item is open; each forced choice satisfies it", "a review that closes over an open item is a review that changed nothing", () => {
  const a = quick("p-20260901-f001", "2026-09-20");
  const b = quick("p-20260901-f002", "2026-09-21");
  const events = [a, b];
  const refused = canCloseReview({ choices: [] }, events, TS, {});
  assert.equal(refused.allowed, false);
  assert.deepEqual(refused.blocking, [a.id, b.id]);
  const recommit = { ...quick("p-20260922-f003", "2026-10-20"), links: { related: [], supersedes: a.id } };
  const rel = release("l-20260922-f004", b.id);
  const ok = canCloseReview({ choices: [{ entry: a.id, action: "recommit", result: recommit.id }, { entry: b.id, action: "release", result: rel.id }] }, [...events, recommit, rel], TS, {});
  assert.equal(ok.allowed, true, ok.reasons.join());
  const adjust = canCloseReview({ choices: [{ entry: a.id, action: "adjust", result: recommit.id }, { entry: b.id, action: "release", result: rel.id }] }, [...events, recommit, rel], TS, {});
  assert.equal(adjust.allowed, true);
});
check("a choice that does not match the record is refused", "the review event is a claim about the ledger; the gate keeps the claim true", () => {
  const a = quick("p-20260901-g001", "2026-09-20");
  const rel = release("l-20260922-g002", a.id);
  const wrong = canCloseReview({ choices: [{ entry: a.id, action: "recommit", result: rel.id }] }, [a, rel], TS, {});
  assert.equal(wrong.allowed, false);
  assert.match(wrong.reasons[0], /must point at an entry that supersedes it/);
  const missing = canCloseReview({ choices: [{ entry: a.id, action: "release", result: "l-20260922-nope" }] }, [a, rel], TS, {});
  assert.equal(missing.allowed, false);
  assert.match(missing.reasons[0], /release l-20260922-nope not found/);
});

group("CLI and ledger wiring");
const home = tempHome();
check("gates check exit codes and --json agree with the functions", "skills branch on the exit code and show reasons verbatim; both must match the function", () => {
  const add = run(["add", "--kind", "prediction", "--tier", "full", "--text", "x", "--confidence", "70", "--criterion", "c", "--domain", "a", "--resolve-by", "2026-09-30", "--reasoning", "r", "--adversary-file", advFile(home), "--json"], { home });
  assert.equal(add.status, 0, add.stderr);
  const allowed = run(["gates", "check", "add", "--tier", "full", "--json"], { home, now: "2026-09-30T00:00:00Z" });
  assert.equal(allowed.status, 0);
  assert.equal(allowed.json.allowed, true);
  const refused = run(["gates", "check", "add", "--tier", "full", "--json"], { home, now: LATE });
  assert.equal(refused.status, 3);
  assert.deepEqual(refused.json.blocking, [add.json.id]);
  assert.equal(run(["gates", "check", "add", "--tier", "quick"], { home, now: LATE }).status, 0);
  const rel = run(["gates", "check", "release", add.json.id], { home, now: LATE });
  assert.equal(rel.status, 3);
  assert.equal(run(["gates", "check", "release", add.json.id, "--reason", "done"], { home, now: LATE }).status, 0);
  const review = run(["gates", "check", "review", "--json"], { home, now: LATE });
  assert.equal(review.status, 3);
  assert.deepEqual(review.json.blocking, [add.json.id]);
  const scope = run(["gates", "scope", "--json"], { home, now: LATE });
  assert.deepEqual(scope.json.map((r) => r.id), [add.json.id]);
  assert.equal(run(["gates", "check", "bogus"], { home }).status, 2);
  assert.equal(run(["gates"], { home }).status, 2);
});
check("ledger add enforces the overdue gate with exit 3 and writes nothing", "the ledger, not the skill, is where the rule lives; a refused add must leave no trace", () => {
  const before = readEvents(home).length;
  const r = run(["add", "--kind", "prediction", "--tier", "full", "--text", "y", "--confidence", "70", "--criterion", "c", "--domain", "a", "--resolve-by", "2026-12-30", "--reasoning", "r", "--adversary-file", advFile(home)], { home, now: LATE });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /full-tier capture blocked/);
  assert.equal(readEvents(home).length, before);
  const q = run(["add", "--kind", "note", "--text", "still allowed"], { home, now: LATE });
  assert.equal(q.status, 0, q.stderr);
});
check("strict mode through the CLI: settings drive ledger add, gates check add --kind, and debt", "the setting must reach every surface that asks the gate, or the surfaces disagree", () => {
  const strictHome = tempHome();
  run(["add", "--kind", "prediction", "--text", "q", "--confidence", "60", "--criterion", "c", "--domain", "a", "--resolve-by", "2026-09-30"], { home: strictHome });
  assert.equal(run(["add", "--kind", "commitment", "--text", "still fine by default", "--domain", "a", "--due-by", "2026-12-01"], { home: strictHome, now: LATE }).status, 0);
  assert.equal(run(["settings", "set", "overdue_gate=strict"], { home: strictHome }).status, 0);
  const refused = run(["add", "--kind", "commitment", "--text", "blocked now", "--domain", "a", "--due-by", "2026-12-01"], { home: strictHome, now: LATE });
  assert.equal(refused.status, 3);
  assert.match(refused.stderr, /overdue_gate=strict/);
  assert.equal(run(["add", "--kind", "note", "--text", "notes pass"], { home: strictHome, now: LATE }).status, 0);
  assert.equal(run(["gates", "check", "add", "--tier", "quick"], { home: strictHome, now: LATE }).status, 3);
  assert.equal(run(["gates", "check", "add", "--tier", "quick", "--kind", "note"], { home: strictHome, now: LATE }).status, 0);
  const d = run(["debt", "--json"], { home: strictHome, now: LATE }).json;
  assert.equal(d.blocked.quick_capture, true);
  assert.equal(d.blocked.mode, "strict");
  assert.match(run(["debt"], { home: strictHome, now: LATE }).stdout, /capture blocked \(strict\)/);
});

function advFile(dir) { const f = join(dir, "adv.json"); writeFileSync(f, JSON.stringify(adversary)); return f; }

finish();
