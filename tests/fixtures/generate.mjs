#!/usr/bin/env node
// Generates the four synthetic ledgers and their .expected.json sidecars from a fixed
// seed. The expected values are computed here with plain loops, independently of
// score-core, so a bug in score-core cannot also be in its expectation.
// Run: node tests/fixtures/generate.mjs   (rewrites tests/fixtures/*.jsonl)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const NOW = "2026-09-22T12:00:00Z";
const REVIEW_TS = "2026-08-01T09:00:00Z";
const VALUE = { true: 1, false: 0, yes: 1, partial: 0.5, no: 0, kept: 1, missed: 0 };
const round = (n) => Math.round(n * 10000) / 10000;

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function suffix(rng) { const a = "0123456789abcdefghijklmnopqrstuvwxyz"; let o = ""; for (let i = 0; i < 4; i += 1) o += a[Math.floor(rng() * 36)]; return o; }
function dayIso(base, offset) { return new Date(Date.parse(base) + offset * 86_400_000).toISOString(); }
const date = (iso) => iso.slice(0, 10);

class Builder {
  constructor(seed) { this.rng = lcg(seed); this.events = []; }
  id(letter, iso) { return `${letter}-${date(iso).replaceAll("-", "")}-${suffix(this.rng)}`; }
  entry({ kind, ts, confidence, domains, dateKey, due, full = false, text }) {
    const e = {
      event: "entry", id: this.id({ prediction: "p", choice: "c", commitment: "m", note: "n" }[kind], ts), ts, kind, tier: full ? "full" : "quick",
      domains, text: text || `${kind} ${this.events.length}`, confidence, criterion: kind === "note" ? null : "criterion",
      dates: { [dateKey]: due }, reasoning: full ? "reasoning" : null, if_then: full ? "if-then" : null,
      chosen: kind === "choice" ? "A" : null, over: kind === "choice" ? "B" : null,
      adversary: full ? { ran: true, at: ts, other_side: "o", failure_conditions: "f", base_rate_question: "b", record_question: "r" } : { ran: false },
      links: { related: [], supersedes: null },
    };
    this.events.push(e);
    return e;
  }
  resolve(e, outcome, ts, stake) {
    const flags = { adversary: e.adversary.ran, criterion: !!e.criterion, reasoning: !!e.reasoning };
    const r = {
      event: "resolution", id: this.id("r", ts), ts, entry: e.id, outcome,
      outcome_score: e.confidence === null ? null : round((e.confidence / 100 - VALUE[outcome]) ** 2),
      criterion_met: e.kind === "choice" ? outcome : null,
      process_score: round((Number(flags.adversary) + Number(flags.criterion) + Number(flags.reasoning)) / 3), process: flags,
      stake_honored: stake ?? (e.if_then ? "yes" : "n/a"), reflection: null,
    };
    this.events.push(r);
    return r;
  }
  release(e, ts) { const r = { event: "release", id: this.id("l", ts), ts, entry: e.id, reason: "released in fixture" }; this.events.push(r); return r; }
  review(ts, priorities) { const v = { event: "review", id: this.id("v", ts), ts, period: { from: dayIso(ts, -7), to: ts }, choices: [], priorities, resolved: [], notes: null }; this.events.push(v); return v; }
}

// Predictions at given confidences, hits chosen deterministically so per-bucket hit
// rate is exact. `hitsOf(c, k)` gives the number of hits among k entries at confidence c.
function predictions(b, { confidences, perConfidence, hitsOf, domains, start }) {
  let i = 0;
  for (const c of confidences) {
    const hits = hitsOf(c, perConfidence);
    for (let j = 0; j < perConfidence; j += 1, i += 1) {
      const ts = dayIso(start, i);
      const due = date(dayIso(ts, 20));
      const e = b.entry({ kind: "prediction", ts, confidence: c, domains: [domains[i % domains.length]], dateKey: "resolve_by", due, full: i % 3 === 0 });
      b.resolve(e, j < hits ? "true" : "false", dayIso(ts, 21));
    }
  }
}

function wellCalibrated() {
  const b = new Builder(1);
  b.review(REVIEW_TS, [{ domain: "work", weight: 50 }, { domain: "health", weight: 50 }]);
  predictions(b, { confidences: [55, 65, 75, 85, 95], perConfidence: 12, hitsOf: (c, k) => Math.round(c * k / 100), domains: ["work", "health"], start: "2026-06-01T10:00:00Z" });
  // A thin domain (below min n) and some open debt.
  for (let i = 0; i < 3; i += 1) {
    const e = b.entry({ kind: "prediction", ts: dayIso("2026-08-05T10:00:00Z", i), confidence: 70, domains: ["misc"], dateKey: "resolve_by", due: date(dayIso("2026-08-05T10:00:00Z", i + 5)) });
    b.resolve(e, i === 0 ? "false" : "true", dayIso("2026-08-05T10:00:00Z", i + 6));
  }
  b.entry({ kind: "commitment", ts: "2026-09-01T10:00:00Z", confidence: 100, domains: ["work"], dateKey: "due_by", due: "2026-09-10" });                 // overdue quick
  b.entry({ kind: "choice", ts: "2026-09-02T10:00:00Z", confidence: 80, domains: ["health"], dateKey: "review_by", due: "2026-09-15", full: true });    // overdue full
  b.entry({ kind: "prediction", ts: "2026-09-10T10:00:00Z", confidence: 60, domains: ["work"], dateKey: "resolve_by", due: "2026-10-10" });            // open
  b.entry({ kind: "note", ts: "2026-09-11T10:00:00Z", confidence: null, domains: ["general"], dateKey: "resolve_by", due: undefined });                 // undated note
  return b.events;
}

function overconfident() {
  const b = new Builder(2);
  b.review(REVIEW_TS, [{ domain: "work", weight: 70 }, { domain: "side", weight: 30 }]);
  predictions(b, { confidences: [80, 85, 90, 95], perConfidence: 15, hitsOf: () => 8, domains: ["work", "side", "work"], start: "2026-06-01T10:00:00Z" });
  return b.events;
}

function hedging() {
  const b = new Builder(3);
  b.review(REVIEW_TS, [{ domain: "work", weight: 100 }]);
  predictions(b, { confidences: [50, 52, 54, 56, 58], perConfidence: 12, hitsOf: (c, k) => Math.round(c * k / 100), domains: ["work"], start: "2026-06-01T10:00:00Z" });
  return b.events;
}

function highRelease() {
  const b = new Builder(4);
  b.review(REVIEW_TS, [{ domain: "work", weight: 60 }, { domain: "home", weight: 40 }]);
  for (let i = 0; i < 40; i += 1) {
    const ts = dayIso("2026-06-01T10:00:00Z", i * 2);
    const full = i % 2 === 0;
    const e = b.entry({ kind: "commitment", ts, confidence: full ? 70 + (i % 3) * 10 : 100, domains: [i % 5 === 0 ? "home" : "work"], dateKey: "due_by", due: date(dayIso(ts, 14)), full });
    if (i < 18) b.release(e, dayIso(ts, 10));
    else b.resolve(e, i % 4 === 0 ? "missed" : "kept", dayIso(ts, 15), full ? (i % 8 === 0 ? "no" : "yes") : undefined);
  }
  return b.events;
}

// Independent expectation pass: plain loops, no score-core.
function expect(events, now) {
  const entries = events.filter((e) => e.event === "entry");
  const res = new Map(events.filter((e) => e.event === "resolution").map((r) => [r.entry, r]));
  const rel = new Set(events.filter((e) => e.event === "release").map((r) => r.entry));
  const dateKey = { prediction: "resolve_by", choice: "review_by", commitment: "due_by", note: "resolve_by" };
  const status = (e) => {
    if (res.has(e.id)) return "resolved";
    if (rel.has(e.id)) return "released";
    const d = e.dates[dateKey[e.kind]];
    return d && Date.parse(now) > Date.parse(`${d}T23:59:59.999Z`) ? "overdue" : "open";
  };
  const scored = entries.filter((e) => status(e) === "resolved" && e.kind !== "note" && e.confidence !== null);
  const briers = scored.map((e) => res.get(e.id).outcome_score);
  const avg = (xs) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const buckets = {};
  for (const e of scored) {
    let p = e.confidence, o = VALUE[res.get(e.id).outcome];
    if (p < 50) { p = 100 - p; o = 1 - o; }
    const key = p >= 90 ? "90–100" : `${Math.floor(p / 10) * 10}–${Math.floor(p / 10) * 10 + 9}`;
    (buckets[key] ||= []).push([p, o]);
  }
  const calibration = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, { n: v.length, mean_confidence: avg(v.map((x) => x[0])), hit_rate: avg(v.map((x) => x[1])) }]));
  const domains = [...new Set(entries.flatMap((e) => e.domains))];
  const by_domain = Object.fromEntries(domains.map((d) => { const xs = scored.filter((e) => e.domains.includes(d)).map((e) => res.get(e.id).outcome_score); return [d, { n: xs.length, brier: avg(xs) }]; }));
  const closable = entries.filter((e) => e.kind !== "note" || e.dates.resolve_by);
  const closed = closable.filter((e) => status(e) === "resolved" || status(e) === "released");
  const review = events.filter((e) => e.event === "review").pop();
  const since = entries.filter((e) => Date.parse(e.ts) > Date.parse(review.ts));
  const tot = review.priorities.reduce((a, p) => a + p.weight, 0);
  const stated = Object.fromEntries(review.priorities.map((p) => [p.domain, p.weight / tot]));
  const actual = {};
  for (const e of since) for (const d of e.domains) actual[d] = (actual[d] || 0) + 1 / e.domains.length / since.length;
  const all = new Set([...Object.keys(stated), ...Object.keys(actual)]);
  const tv = round(0.5 * [...all].reduce((a, d) => a + Math.abs((stated[d] || 0) - (actual[d] || 0)), 0));
  return {
    now,
    n: { entries: entries.length, scored: scored.length, resolved: entries.filter((e) => status(e) === "resolved").length, released: entries.filter((e) => status(e) === "released").length, overdue: entries.filter((e) => status(e) === "overdue").length },
    brier_overall: avg(briers),
    by_domain,
    calibration,
    informativeness: avg(scored.map((e) => Math.abs(e.confidence - 50) / 50)),
    release_rate: closed.length ? round(closed.filter((e) => status(e) === "released").length / closed.length) : null,
    process_mean: avg([...res.values()].map((r) => r.process_score)),
    drift_total_variation: since.length ? tv : null,
    drift_n: since.length,
  };
}

export const FIXTURES = { "well-calibrated": wellCalibrated, overconfident, hedging, "high-release": highRelease };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [name, make] of Object.entries(FIXTURES)) {
    const events = make();
    writeFileSync(join(HERE, `${name}.jsonl`), `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
    writeFileSync(join(HERE, `${name}.expected.json`), `${JSON.stringify(expect(events, NOW), null, 2)}\n`);
    console.log(`${name}: ${events.length} events`);
  }
}
