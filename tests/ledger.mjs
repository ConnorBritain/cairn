#!/usr/bin/env node
// Item 02: schema, store, status, ledger CLI.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, CLI, finish, group, ROOT, run, tempHome } from "./harness.mjs";
import { parseArgs } from "../tools/lib/args.mjs";
import { buildEntry, FULL_REQUIRED, REQUIRED, validateEvent } from "../tools/lib/schema.mjs";
import { readEvents, resolveStateDir } from "../tools/lib/store.mjs";
import { indexEvents, statusOf } from "../tools/lib/status.mjs";

const TS = "2026-09-22T12:00:00Z";
const adversary = { ran: true, at: TS, other_side: "a", failure_conditions: "b", base_rate_question: "c", record_question: "d" };

group("args");
check("flags, multi, booleans, positionals", "every CLI parses through this; a swallowed positional silently changes which entry is acted on", () => {
  const { flags, positionals } = parseArgs(["show", "p-1", "--json", "--domain", "a", "--domain=b", "--resolve-by", "2026-01-01"], { multi: ["domain"] });
  assert.deepEqual(positionals, ["show", "p-1"]);
  assert.equal(flags.json, true);
  assert.deepEqual(flags.domain, ["a", "b"]);
  assert.equal(flags.resolveBy, "2026-01-01");
});

group("schema");
check("quick prediction builds with defaults", "the five-second capture must not demand more than the brief lists", () => {
  const { entry } = buildEntry({ kind: "prediction", text: "x", confidence: "70", criterion: "c", domains: "Work", dates: { resolve_by: "2026-10-01" } }, { ts: TS });
  assert.equal(entry.tier, "quick");
  assert.deepEqual(entry.domains, ["work"]);
  assert.equal(entry.confidence, 70);
  assert.match(entry.id, /^p-20260922-[0-9a-z]{4}$/);
  assert.equal(entry.adversary.ran, false);
});
for (const kind of Object.keys(REQUIRED)) {
  check(`missing required fields refused for ${kind}`, "an entry without its criterion or date can never be scored; refusing early is the whole point of pre-registration", () => {
    let err;
    try { buildEntry({ kind }, { ts: TS }); } catch (e) { err = e; }
    assert.ok(err, "expected a refusal");
    for (const path of REQUIRED[kind]) if (path !== "text" || kind !== "choice") assert.ok(err.details.errors.some((m) => m.startsWith(path)), `${path} named`);
  });
}
check("full tier without adversary refused; adversary promotes quick to full", "tier is validated from fields, not declared, so process score cannot be gamed by a label", () => {
  const base = { kind: "prediction", text: "x", confidence: 70, criterion: "c", domains: ["a"], dates: { resolve_by: "2026-10-01" }, reasoning: "r" };
  assert.throws(() => buildEntry({ ...base, tier: "full" }, { ts: TS }), /full requires adversary\.ran/);
  const { entry, notices } = buildEntry({ ...base, tier: "quick", adversary }, { ts: TS });
  assert.equal(entry.tier, "full");
  assert.match(notices.join(), /promoted to full/);
  assert.throws(() => buildEntry({ ...base, reasoning: undefined, adversary }, { ts: TS }), /full tier also requires reasoning/);
});
check("full commitment requires criterion, if-then, reasoning, adversary, confidence", "the brief defines full tier; a commitment without a criterion cannot have its criterion pre-registered", () => {
  assert.deepEqual(FULL_REQUIRED.commitment, ["criterion", "if_then", "reasoning", "adversary.ran"]);
  assert.throws(() => buildEntry({ kind: "commitment", tier: "full", text: "x", domains: ["a"], dates: { due_by: "2026-10-01" }, criterion: "c", if_then: "i", reasoning: "r", adversary }, { ts: TS }), /confidence: required for a full commitment/);
});
check("notes are always quick and default to general", "a note is the quick tier's floor; it must never be blocked or demand fields", () => {
  const { entry } = buildEntry({ kind: "note", text: "hmm" }, { ts: TS });
  assert.equal(entry.tier, "quick");
  assert.deepEqual(entry.domains, ["general"]);
  assert.throws(() => buildEntry({ kind: "note", text: "hmm", tier: "full" }, { ts: TS }), /notes are always quick/);
});
check("wrong date key, bad date, bad confidence, bad domain refused", "a wrong date key would make an entry never come due, which is a silent way to escape the record", () => {
  assert.throws(() => buildEntry({ kind: "prediction", text: "x", confidence: 70, criterion: "c", domains: ["a"], dates: { due_by: "2026-10-01" } }, { ts: TS }), /dates\.due_by: a prediction uses resolve_by/);
  assert.throws(() => buildEntry({ kind: "note", text: "x", dates: { resolve_by: "2026-02-30" } }, { ts: TS }), /YYYY-MM-DD/);
  assert.throws(() => buildEntry({ kind: "note", text: "x", confidence: 101 }, { ts: TS }), /confidence: integer/);
  assert.throws(() => buildEntry({ kind: "note", text: "x", domains: ["Bad Domain!"] }, { ts: TS }), /must match/);
});
check("passing an id is refused with the supersedes path", "immutability: the schema itself names the only correction mechanism", () => {
  assert.throws(() => buildEntry({ kind: "note", text: "x", id: "n-20260101-aaaa" }, { ts: TS }), /immutable; add a new entry with --supersedes/);
});
check("validateEvent catches malformed lines of every event type", "readEvents relies on this to refuse a corrupt ledger instead of scoring garbage", () => {
  assert.ok(validateEvent({ event: "nope" }).length);
  assert.ok(validateEvent({ event: "release", id: "l-20260101-aaaa", ts: TS, entry: "p-20260101-aaaa", reason: " " }).some((m) => m.startsWith("reason")));
  assert.ok(validateEvent({ event: "resolution", id: "r-20260101-aaaa", ts: TS, entry: "p-20260101-aaaa", outcome: "maybe", outcome_score: 0, process_score: 0, stake_honored: "n/a" }).some((m) => m.startsWith("outcome")));
  assert.equal(validateEvent({ event: "review", id: "v-20260101-aaaa", ts: TS, period: { from: TS, to: TS }, choices: [], priorities: [{ domain: "a", weight: 1 }] }).length, 0);
});

group("store");
check("state dir: CAIRN_HOME, then docs/cairn walk-up, then ~/.cairn", "state must be the user's; resolving into the plugin directory would violate house rule 7", () => {
  const home = tempHome();
  assert.equal(resolveStateDir({ env: { CAIRN_HOME: home }, cwd: ROOT, home: "/nope" }), home);
  assert.throws(() => resolveStateDir({ env: { CAIRN_HOME: "relative" } }), /absolute/);
  const project = tempHome();
  mkdirSync(join(project, "docs", "cairn", "deep"), { recursive: true });
  assert.equal(resolveStateDir({ env: {}, cwd: join(project, "docs", "cairn", "deep"), home: "/nope" }), join(project, "docs", "cairn"));
  assert.equal(resolveStateDir({ env: {}, cwd: join(project, "docs"), home: "/nope" }), join(project, "docs", "cairn"));
  const bare = tempHome();
  assert.equal(resolveStateDir({ env: {}, cwd: bare, home: "/fake-home" }), join("/fake-home", ".cairn"));
});
check("store.mjs contains no truncating or rewriting write", "append-only is a property of the code, not a promise; this test is the promise", () => {
  const source = readFileSync(join(ROOT, "tools", "lib", "store.mjs"), "utf8");
  const code = source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  assert.equal((code.match(/writeFileSync\(|truncateSync\(|rmSync\(|renameSync\(|flag:\s*["']w/g) || []).length, 0, "found a rewriting call in store.mjs");
  assert.match(code, /flag:\s*["']a["']/);
});
check("malformed line fails the read with its line number", "a corrupt ledger must be noticed, not silently skipped into wrong scores", () => {
  const home = tempHome();
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "ledger.jsonl"), `${JSON.stringify({ event: "entry", id: "n-20260101-aaaa", ts: TS, kind: "note", tier: "quick", domains: ["a"], text: "ok", dates: {}, links: { related: [], supersedes: null } })}\n{not json\n`);
  assert.throws(() => readEvents(home), /line 2: not JSON/);
  writeFileSync(join(home, "ledger.jsonl"), `{"event":"entry","id":"bad"}\n`);
  assert.throws(() => readEvents(home), /line 1: .*id: malformed/);
});

group("ledger CLI");
const home = tempHome();
let ids = {};
check("quick capture of every kind round-trips through the CLI", "the CLI is what skills call; a field lost between argv and disk is a silent data loss", () => {
  const p = run(["add", "--kind", "prediction", "--text", "Ship by Q4", "--confidence", "70", "--criterion", "deployed", "--domain", "work", "--resolve-by", "2026-09-30", "--json"], { home });
  assert.equal(p.status, 0, p.stderr);
  ids.p = p.json.id;
  const c = run(["ledger", "add", "--kind", "choice", "--chosen", "Postgres", "--over", "SQLite", "--confidence", "80", "--criterion", "p95 under 50ms", "--domain", "work", "--review-by", "2026-10-15", "--json"], { home });
  assert.equal(c.status, 0, c.stderr);
  ids.c = c.json.id;
  assert.equal(c.json.text, "Postgres over SQLite");
  const m = run(["add", "--kind", "commitment", "--text", "Write the retro", "--domain", "team", "--due-by", "2026-09-25", "--json"], { home });
  assert.equal(m.status, 0, m.stderr);
  assert.equal(m.json.confidence, 100);
  ids.m = m.json.id;
  const n = run(["add", "--kind", "note", "--text", "maybe drop the cache layer"], { home });
  assert.equal(n.status, 0, n.stderr);
  ids.n = n.stdout.split(/\s+/)[0];
  assert.equal(readEvents(home).length, 4);
});
check("full capture records the adversary pass", "process score at resolution is computed from this; if it is not stored, every full entry scores as quick", () => {
  const file = join(home, "adv.json");
  writeFileSync(file, JSON.stringify(adversary));
  const r = run(["add", "--kind", "choice", "--tier", "full", "--chosen", "A", "--over", "B", "--confidence", "60", "--criterion", "c", "--domain", "work", "--review-by", "2026-10-01", "--if-then", "revert", "--reasoning", "because", "--adversary-file", file, "--related", ids.c, "--json"], { home });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.tier, "full");
  assert.equal(r.json.adversary.ran, true);
  ids.full = r.json.id;
});
check("--id on add is refused and names supersedes", "the CLI must not offer any edit path", () => {
  const r = run(["add", "--kind", "note", "--text", "x", "--id", ids.n], { home });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /immutable; add a new entry with --supersedes/);
});
check("resolve computes Brier and process score; stake required only with an if-then", "these two numbers are the product; a wrong formula here is wrong everywhere downstream", () => {
  const r = run(["resolve", ids.p, "--outcome", "true", "--json"], { home });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.outcome_score, 0.09);
  assert.equal(r.json.process_score, 0.3333);
  assert.equal(r.json.stake_honored, "n/a");
  const bad = run(["resolve", ids.full, "--outcome", "partial"], { home });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /stake-honored yes\|no required/);
  const f = run(["resolve", ids.full, "--outcome", "partial", "--stake-honored", "yes", "--reflection", "hmm", "--json"], { home });
  assert.equal(f.status, 0, f.stderr);
  assert.equal(f.json.outcome_score, 0.01);
  assert.equal(f.json.process_score, 1);
  assert.equal(f.json.criterion_met, "partial");
  const wrong = run(["resolve", ids.c, "--outcome", "true"], { home });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /must be one of yes, partial, no/);
  const twice = run(["resolve", ids.p, "--outcome", "false"], { home });
  assert.match(twice.stderr, /it is resolved/);
});
check("release requires a reason; reflect appends", "release without a reason is the cheapest escape from the record; the schema and the CLI both refuse it", () => {
  const no = run(["release", ids.m], { home });
  assert.equal(no.status, 3);
  assert.match(no.stderr, /reason/);
  const blank = run(["release", ids.m, "--reason", "  "], { home });
  assert.equal(blank.status, 3);
  const yes = run(["release", ids.m, "--reason", "priorities changed", "--json"], { home });
  assert.equal(yes.status, 0, yes.stderr);
  const refl = run(["reflect", ids.p, "--text", "learned something", "--json"], { home });
  assert.equal(refl.status, 0, refl.stderr);
  const shown = run(["show", ids.p, "--json"], { home });
  assert.equal(shown.json.reflections.length, 1);
});
check("list derives status including overdue at the day boundary", "overdue drives the gate and the hook; an off-by-one day would block or free capture wrongly", () => {
  const before = run(["list", "--json"], { home, now: "2026-10-15T23:59:59Z" });
  const c = before.json.find((r) => r.id === ids.c);
  assert.equal(c.status, "open");
  const after = run(["list", "--json"], { home, now: "2026-10-16T00:00:00Z" });
  assert.equal(after.json.find((r) => r.id === ids.c).status, "overdue");
  assert.equal(after.json.find((r) => r.id === ids.p).status, "resolved");
  assert.equal(after.json.find((r) => r.id === ids.m).status, "released");
  const filtered = run(["list", "--status", "overdue", "--json"], { home, now: "2026-10-16T00:00:00Z" });
  assert.deepEqual(filtered.json.map((r) => r.id), [ids.c]);
  const text = run(["list"], { home, now: "2026-10-16T00:00:00Z" });
  assert.match(text.stdout, new RegExp(`overdue\\s+${ids.c}`));
});
check("supersedes marks the old entry superseded and leaves its line untouched", "recommit/adjust must be visible corrections, and the old reasoning must survive byte for byte", () => {
  const beforeBytes = readFileSync(join(home, "ledger.jsonl"), "utf8");
  const r = run(["add", "--kind", "choice", "--chosen", "Postgres", "--over", "SQLite", "--confidence", "65", "--criterion", "p95 under 50ms", "--domain", "work", "--review-by", "2026-11-15", "--supersedes", ids.c, "--json"], { home });
  assert.equal(r.status, 0, r.stderr);
  const afterBytes = readFileSync(join(home, "ledger.jsonl"), "utf8");
  assert.ok(afterBytes.startsWith(beforeBytes));
  const old = run(["show", ids.c, "--json"], { home });
  assert.equal(old.json.status, "superseded");
  assert.equal(old.json.superseded_by, r.json.id);
  const again = run(["add", "--kind", "note", "--text", "x", "--supersedes", ids.c], { home });
  assert.match(again.stderr, /it is superseded/);
});
check("related ranks resolved entries by shared domain and words", "the adversary's record question is only as good as this ranking; it must be deterministic and never include open entries", () => {
  const r = run(["related", "--domain", "work", "--text", "ship the deploy", "--json"], { home });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.json.length >= 1);
  assert.ok(r.json.every((row) => row.status === "resolved"));
  assert.equal(r.json[0].id, ids.p);
  const none = run(["related", "--domain", "nothing", "--json"], { home });
  assert.deepEqual(none.json, []);
});
check("status precedence: superseded beats resolved beats released beats overdue", "two events on one entry must resolve the same way everywhere; the order is the contract", () => {
  const entry = { event: "entry", id: "p-20260101-aaaa", ts: TS, kind: "prediction", tier: "quick", domains: ["a"], text: "x", confidence: 50, criterion: "c", dates: { resolve_by: "2026-01-02" }, links: { related: [], supersedes: null } };
  const res = { event: "resolution", id: "r-20260103-aaaa", ts: TS, entry: entry.id, outcome: "true", outcome_score: 0.25, process_score: 0, stake_honored: "n/a" };
  const rel = { event: "release", id: "l-20260103-aaaa", ts: TS, entry: entry.id, reason: "r" };
  const sup = { ...entry, id: "p-20260104-bbbb", links: { related: [], supersedes: entry.id } };
  const late = "2026-02-01T00:00:00Z";
  assert.equal(statusOf(entry, indexEvents([entry]), late), "overdue");
  assert.equal(statusOf(entry, indexEvents([entry]), "2026-01-02T23:59:59Z"), "open");
  assert.equal(statusOf(entry, indexEvents([entry, rel]), late), "released");
  assert.equal(statusOf(entry, indexEvents([entry, rel, res]), late), "resolved");
  assert.equal(statusOf(entry, indexEvents([entry, rel, res, sup]), late), "superseded");
});
check("usage and unknown commands exit 2; help exits 0", "skills branch on exit codes; 2 must mean the call was wrong, not the ledger", () => {
  assert.equal(run(["ledger", "bogus"], { home }).status, 2);
  assert.equal(run(["ledger"], { home }).status, 2);
  assert.equal(run(["ledger", "help"], { home }).status, 0);
  assert.equal(run([], { home }).status, 2);
  assert.equal(run(["help"], { home }).status, 0);
  assert.equal(run(["show"], { home }).status, 2);
});

await (async () => {
  const concurrent = tempHome();
  const procs = [];
  for (let i = 0; i < 6; i += 1) {
    procs.push(new Promise((resolve) => {
      const p = spawn(process.execPath, [CLI, "add", "--kind", "note", "--text", `n${i}`], { env: { ...process.env, CAIRN_HOME: concurrent, CAIRN_NOW: TS } });
      let stderr = "";
      p.stderr.on("data", (d) => { stderr += d; });
      p.on("close", (code) => resolve({ code, stderr }));
    }));
  }
  const results = await Promise.all(procs);
  check("six concurrent appends all land and the file stays parseable", "two sessions appending at once must not interleave bytes or drop a line", () => {
    for (const r of results) assert.equal(r.code, 0, r.stderr);
    const events = readEvents(concurrent);
    assert.equal(events.length, 6);
    assert.ok(!existsSync(join(concurrent, ".ledger.lock")));
  });
})();

finish();
