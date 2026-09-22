#!/usr/bin/env node
// Item 09: exports round-trip the record and flatten the scores without inventing anything.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, finish, group, ROOT, run, tempHome } from "./harness.mjs";
import { NOW } from "./fixtures/generate.mjs";
import { LEDGER_COLUMNS, ledgerRows, scoreRows } from "../tools/export.mjs";
import { score } from "../tools/lib/score-core.mjs";
import { readEvents } from "../tools/lib/store.mjs";

const load = (name) => {
  const home = tempHome();
  mkdirSync(home, { recursive: true });
  copyFileSync(join(ROOT, "tests", "fixtures", `${name}.jsonl`), join(home, "ledger.jsonl"));
  return { home, events: readEvents(home) };
};
const csvLines = (text) => text.split("\n").filter(Boolean);

group("ledger export");
check("CSV row count equals entry count; header equals the column list; markdown contains every id", "an export that drops a row is a copy of the record that lies", () => {
  const { home, events } = load("well-calibrated");
  const entries = events.filter((e) => e.event === "entry");
  const csv = run(["export", "ledger", "--format", "csv", "--out", "-"], { home, now: NOW });
  assert.equal(csv.status, 0, csv.stderr);
  const lines = csvLines(csv.stdout);
  assert.equal(lines[0], LEDGER_COLUMNS.join(","));
  assert.equal(lines.length - 1, entries.length);
  const md = run(["export", "ledger", "--format", "md", "--out", "-"], { home, now: NOW });
  for (const e of entries) assert.ok(md.stdout.includes(e.id), e.id);
  const rows = ledgerRows(events, NOW);
  assert.equal(rows.filter((r) => r.status === "resolved").length, events.filter((e) => e.event === "resolution").length);
});
check("CSV escapes commas, quotes and newlines; markdown escapes pipes", "a text with a comma must not shift every column after it", () => {
  const home = tempHome();
  run(["add", "--kind", "note", "--text", 'a, "quoted" | piped'], { home, now: NOW });
  const csv = run(["export", "ledger", "--format", "csv", "--out", "-"], { home, now: NOW });
  assert.ok(csv.stdout.includes('"a, ""quoted"" | piped"'));
  assert.equal(csvLines(csv.stdout).length, 2);
  const md = run(["export", "ledger", "--out", "-"], { home, now: NOW });
  assert.ok(md.stdout.includes("a, \"quoted\" \\| piped"));
});
check("default output lands under <state>/exports with the date", "the user owns the file; it must live in their directory, not the plugin", () => {
  const { home } = load("hedging");
  const r = run(["export", "ledger", "--format", "csv"], { home, now: NOW });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), join(home, "exports", "ledger-2026-09-22.csv"));
  assert.ok(existsSync(r.stdout.trim()));
  assert.equal(csvLines(readFileSync(r.stdout.trim(), "utf8")).length, 61);
});

group("scores export");
check("one row per statistic, insufficient stays a word, values match score-core", "a flattened score that rounds or fills in a number is a second arithmetic", () => {
  const { home, events } = load("well-calibrated");
  const s = score(events, NOW);
  const rows = scoreRows(s);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(byKey["brier.overall"].value, s.brier.overall.value);
  assert.equal(byKey["brier.overall"].n, s.brier.overall.n);
  assert.equal(byKey["brier.by_domain.misc"].value, "insufficient");
  assert.equal(byKey["calibration.50–59.hit_rate"].value, s.calibration.buckets[0].hit_rate);
  assert.equal(byKey["drift.total_variation"].value, s.drift.total_variation);
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
  const csv = run(["export", "scores", "--format", "csv", "--out", "-"], { home, now: NOW });
  assert.equal(csvLines(csv.stdout).length, rows.length + 1);
  assert.equal(csvLines(csv.stdout)[0], "key,value,n");
  const md = run(["export", "scores", "--out", "-"], { home, now: NOW });
  assert.match(md.stdout, /^# Cairn scores/);
});
check("usage errors exit 2", "a bad --format must not silently write markdown", () => {
  const home = tempHome();
  assert.equal(run(["export"], { home }).status, 2);
  assert.equal(run(["export", "bogus"], { home }).status, 2);
  assert.equal(run(["export", "ledger", "--format", "xlsx"], { home }).status, 2);
  assert.equal(run(["export", "ledger", "extra"], { home }).status, 2);
  assert.equal(run(["export", "help"], { home }).status, 0);
});

finish();
