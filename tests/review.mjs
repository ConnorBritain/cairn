#!/usr/bin/env node
// Item 08: the review record honors the gate, corrections supersede without touching
// the old line, drift follows the new priorities, and the reviewer prompt is bounded.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, finish, group, ROOT, run, tempHome } from "./harness.mjs";
import { readEvents } from "../tools/lib/store.mjs";

const NOW = "2026-09-22T12:00:00Z";
const home = tempHome();
const reviewFile = (obj) => { const f = join(home, "review.json"); writeFileSync(f, JSON.stringify(obj)); return f; };
const ids = {};

group("setup");
check("seed: two overdue entries, one resolved, one far future", "the review must see exactly the two overdue items", () => {
  const t0 = "2026-09-01T00:00:00Z";
  ids.a = run(["add", "--kind", "prediction", "--text", "A ships", "--confidence", "70", "--criterion", "shipped", "--domain", "work", "--resolve-by", "2026-09-15", "--json"], { home, now: t0 }).json.id;
  ids.b = run(["add", "--kind", "commitment", "--text", "Write retro", "--domain", "team", "--due-by", "2026-09-18", "--json"], { home, now: t0 }).json.id;
  ids.c = run(["add", "--kind", "prediction", "--text", "C lands", "--confidence", "80", "--criterion", "landed", "--domain", "work", "--resolve-by", "2026-09-10", "--json"], { home, now: t0 }).json.id;
  ids.d = run(["add", "--kind", "prediction", "--text", "D far", "--confidence", "55", "--criterion", "far", "--domain", "work", "--resolve-by", "2026-12-31", "--json"], { home, now: t0 }).json.id;
  assert.equal(run(["resolve", ids.c, "--outcome", "true"], { home, now: "2026-09-11T00:00:00Z" }).status, 0);
  const scope = run(["gates", "scope", "--json"], { home, now: NOW }).json.map((r) => r.id);
  assert.deepEqual(scope.sort(), [ids.a, ids.b].sort());
});

group("gate");
check("review refused with open in-scope items; nothing written; --file required", "a partial review record would claim the ritual happened", () => {
  const before = readEvents(home).length;
  const r = run(["ledger", "review", "--file", reviewFile({ choices: [], priorities: [{ domain: "work", weight: 1 }] }), "--json"], { home, now: NOW });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /without a forced choice/);
  assert.equal(readEvents(home).length, before);
  assert.equal(run(["review"], { home, now: NOW }).status, 2);
});
check("priorities are required and validated", "drift measures against them; a review without priorities leaves the next period unmeasurable", () => {
  const none = run(["review", "--file", reviewFile({ choices: [] }), "--json"], { home, now: NOW });
  assert.equal(none.status, 1);
  assert.match(none.stderr, /priorities/);
  const bad = run(["review", "--file", reviewFile({ choices: [], priorities: [{ domain: "Bad Domain", weight: 1 }] })], { home, now: NOW });
  assert.match(bad.stderr, /priorities\[\]\.domain/);
  const zero = run(["review", "--file", reviewFile({ choices: [], priorities: [{ domain: "work", weight: 0 }] })], { home, now: NOW });
  assert.match(zero.stderr, /above zero/);
});

group("forced choices");
check("recommit supersedes with the old line byte-identical; release closes; review then records", "corrections are new entries; the record of what was believed must survive the correction", () => {
  const before = readFileSync(join(home, "ledger.jsonl"), "utf8");
  const shown = run(["show", ids.a, "--json"], { home, now: NOW }).json;
  const re = run(["add", "--kind", "prediction", "--text", shown.text, "--confidence", String(shown.confidence), "--criterion", shown.criterion, "--domain", "work", "--resolve-by", "2026-10-15", "--supersedes", ids.a, "--json"], { home, now: NOW });
  assert.equal(re.status, 0, re.stderr);
  ids.a2 = re.json.id;
  const rel = run(["release", ids.b, "--reason", "retro folded into planning", "--json"], { home, now: NOW });
  assert.equal(rel.status, 0, rel.stderr);
  ids.bRel = rel.json.id;
  assert.ok(readFileSync(join(home, "ledger.jsonl"), "utf8").startsWith(before));
  assert.equal(run(["show", ids.a, "--json"], { home, now: NOW }).json.status, "superseded");

  const wrong = run(["review", "--file", reviewFile({ choices: [{ entry: ids.a, action: "release", result: ids.a2 }, { entry: ids.b, action: "release", result: ids.bRel }], priorities: [{ domain: "work", weight: 70 }, { domain: "health", weight: 30 }] }), "--json"], { home, now: NOW });
  assert.equal(wrong.status, 3);
  assert.match(wrong.stderr, /release .* not found/);

  const ok = run(["review", "--file", reviewFile({ choices: [{ entry: ids.a, action: "recommit", result: ids.a2 }, { entry: ids.b, action: "release", result: ids.bRel }], priorities: [{ domain: "work", weight: 70 }, { domain: "health", weight: 30 }], notes: "first review" }), "--json"], { home, now: NOW });
  assert.equal(ok.status, 0, ok.stderr);
  ids.review = ok.json.id;
  assert.match(ok.json.id, /^v-20260922-/);
  assert.equal(ok.json.choices.length, 2);
  assert.equal(ok.json.resolved.length, 1);
  assert.equal(ok.json.period.from, "2026-09-01T00:00:00.000Z");
  assert.equal(ok.json.next_review_by, "2026-09-29");
  assert.equal(ok.json.notes, "first review");
});
check("after the review, scope is empty and drift reads the new priorities", "the review's priorities are the baseline until the next review", () => {
  assert.deepEqual(run(["gates", "scope", "--json"], { home, now: NOW }).json, []);
  run(["add", "--kind", "note", "--text", "health note", "--domain", "health"], { home, now: "2026-09-23T00:00:00Z" });
  const s = run(["score", "--json"], { home, now: "2026-09-24T00:00:00Z" }).json;
  assert.equal(s.drift.review, ids.review);
  assert.equal(s.drift.by_domain.work.stated, 0.7);
  assert.equal(s.drift.by_domain.health.stated, 0.3);
  assert.equal(s.drift.n, 1);
  const second = run(["review", "--file", reviewFile({ choices: [], priorities: [{ domain: "work", weight: 1 }] }), "--json"], { home, now: "2026-09-30T00:00:00Z" });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.json.period.from, "2026-09-22T12:00:00.000Z");
  assert.deepEqual(second.json.resolved, []);
});
check("digest after a review reports only the new period", "the reviewer must not re-read last week's resolutions as this week's", () => {
  const d = run(["digest", "--json"], { home, now: "2026-10-01T00:00:00Z" }).json;
  assert.equal(d.period.first_review, false);
  assert.deepEqual(d.resolved, []);
  assert.deepEqual(d.priorities_stated, [{ domain: "work", weight: 1 }]);
});

group("reviewer prompt");
check("cites-only rule, no recommendations, bounded, reads the digest only", "the reviewer is evidence-bound by construction only if its prompt says so and its input is only the digest", () => {
  const text = readFileSync(join(ROOT, "agents", "cairn-reviewer.md"), "utf8");
  assert.match(text, /^tools: \[\]$/m);
  assert.match(text, /cites an entry id, or a named statistic/);
  assert.match(text, /insufficient/);
  assert.match(text, /Under 300 words/);
  assert.match(text, /Do not recommend what to decide/);
  const skill = readFileSync(join(ROOT, "skills", "cairn-review", "SKILL.md"), "utf8");
  assert.match(skill.replace(/\s+/g, " "), /the digest markdown, the line `bluntness: <level>`, and the full text of bluntness\.md/);
  assert.match(skill, /Nothing from this conversation/);
});

finish();
