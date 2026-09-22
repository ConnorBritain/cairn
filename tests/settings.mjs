#!/usr/bin/env node
// Item 09: settings are immutable revisions with an atomic pointer, undo is a new
// revision, and every tool that reads the cadence reads it from the store.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, finish, group, run, tempHome } from "./harness.mjs";
import { applySettings, digestOf, initSettings, parseAssignment, undoSettings, validateSettings } from "../tools/lib/settings-core.mjs";
import { loadSettings, readSettings, setSettings, settingsHistory, undoLast } from "../tools/lib/settings-store.mjs";
import { DEFAULT_SETTINGS } from "../tools/lib/defaults.mjs";

const TS = "2026-09-22T12:00:00Z";

group("core");
check("defaults validate; each field is range-checked", "a bluntness of 4 or a cadence of 0 would make roles and gates behave undefined", () => {
  const s = initSettings(TS);
  assert.deepEqual(validateSettings(s), []);
  assert.ok(validateSettings({ ...s, bluntness: 4 }).some((m) => m.startsWith("bluntness")));
  assert.ok(validateSettings({ ...s, review_cadence_days: 0 }).some((m) => m.startsWith("review_cadence_days")));
  assert.ok(validateSettings({ ...s, domains: ["Bad!"] }).some((m) => m.startsWith("domains")));
  assert.ok(validateSettings({ ...s, witnesses: [{}] }).some((m) => m.startsWith("witnesses")));
  assert.ok(validateSettings({ ...s, capture_hook: "yes" }).some((m) => m.startsWith("capture_hook")));
});
check("parseAssignment types each key and refuses unknown keys", "the CLI takes strings; a stringly bluntness would fail validation or, worse, pass as text", () => {
  assert.deepEqual(parseAssignment("bluntness=2"), { key: "bluntness", value: 2 });
  assert.deepEqual(parseAssignment("domains=Work, health"), { key: "domains", value: ["work", "health"] });
  assert.deepEqual(parseAssignment("capture_hook=on"), { key: "capture_hook", value: true });
  assert.deepEqual(parseAssignment("witnesses=Sam:weekly call,Priya"), { key: "witnesses", value: [{ name: "Sam", note: "weekly call" }, { name: "Priya" }] });
  assert.deepEqual(parseAssignment('witnesses=[{"name":"X"}]'), { key: "witnesses", value: [{ name: "X" }] });
  assert.throws(() => parseAssignment("nope=1"), /unknown setting/);
  assert.throws(() => parseAssignment("bluntness=two"), /integer/);
  assert.deepEqual(parseAssignment("overdue_gate=strict"), { key: "overdue_gate", value: "strict" });
  assert.throws(() => parseAssignment("overdue_gate=loose"), /full or strict/);
  assert.ok(validateSettings({ ...initSettings(TS), overdue_gate: "loose" }).some((m) => m.startsWith("overdue_gate")));
  assert.equal(initSettings(TS).overdue_gate, "full");
});
check("apply increments revision, links parent digest, refuses no-ops; undo restores values as a new revision", "undo must add history, never delete it", () => {
  const r1 = initSettings(TS);
  const { settings: r2, changed } = applySettings(r1, [{ key: "bluntness", value: 3 }], TS);
  assert.equal(r2.revision, 2);
  assert.equal(r2.parent_digest, digestOf(r1));
  assert.deepEqual(changed, [{ key: "bluntness", from: 1, to: 3 }]);
  assert.throws(() => applySettings(r2, [{ key: "bluntness", value: 3 }], TS), /no change/);
  assert.throws(() => applySettings(r2, [{ key: "bluntness", value: 9 }], TS), /invalid settings/);
  const r3 = undoSettings(r2, r1, TS);
  assert.equal(r3.revision, 3);
  assert.equal(r3.bluntness, 1);
  assert.equal(r3.parent_digest, digestOf(r2));
  assert.throws(() => undoSettings(r2, r2, TS), /digest does not match/);
});

group("store");
check("set, read, undo, history in a temp home; revisions are immutable files", "the dial is read by every role; a torn write would change the coach's behavior silently", () => {
  const home = tempHome();
  assert.equal(readSettings(home), null);
  assert.deepEqual(loadSettings(home), { ...DEFAULT_SETTINGS });
  const a = setSettings(home, [{ key: "bluntness", value: 2 }], TS);
  assert.equal(a.settings.revision, 2);
  assert.equal(readSettings(home).bluntness, 2);
  const files = readdirSync(join(home, "settings", "revisions"));
  assert.equal(files.length, 2);
  assert.ok(files.every((f) => /^\d{6}-[a-f0-9]{64}\.json$/.test(f)));
  setSettings(home, [{ key: "domains", value: ["work"] }, { key: "review_cadence_days", value: 14 }], TS, "two at once");
  const u = undoLast(home, TS);
  assert.equal(u.restored, 2);
  assert.equal(u.settings.revision, 4);
  assert.equal(u.settings.review_cadence_days, 7);
  assert.equal(u.settings.bluntness, 2);
  const h = settingsHistory(home);
  assert.deepEqual(h.map((r) => r.revision), [1, 2, 3, 4]);
  assert.equal(h[2].note, "two at once");
  assert.deepEqual(h[1].changed, [{ key: "bluntness", from: 1, to: 2 }]);
  assert.equal(readdirSync(join(home, "settings", "revisions")).length, 4);
});
check("lock contention and a tampered revision are refused", "a second writer or an edited file must be noticed, not silently accepted", () => {
  const home = tempHome();
  setSettings(home, [{ key: "bluntness", value: 0 }], TS);
  writeFileSync(join(home, "settings", ".writer.lock"), "");
  assert.throws(() => setSettings(home, [{ key: "bluntness", value: 1 }], TS), /another or interrupted writer/);
  assert.throws(() => undoLast(home, TS), /another or interrupted writer/);
  const { file } = JSON.parse(readFileSync(join(home, "settings", "current.json"), "utf8"));
  const path = join(home, "settings", "revisions", file);
  const tampered = JSON.parse(readFileSync(path, "utf8"));
  tampered.bluntness = 3;
  writeFileSync(path, JSON.stringify(tampered, null, 2));
  assert.throws(() => readSettings(home), /digest mismatch/);
});
check("undo with nothing saved or at revision 1 is refused", "there is no history to invent", () => {
  const home = tempHome();
  assert.throws(() => undoLast(home, TS), /nothing to undo/);
});

group("CLI and consumers");
check("cairn settings show/set/undo/history; exit codes", "the tune skill prints these verbatim", () => {
  const home = tempHome();
  const show = run(["settings", "show", "--json"], { home });
  assert.equal(show.status, 0, show.stderr);
  assert.equal(show.json.saved, false);
  assert.equal(show.json.bluntness, 1);
  const set = run(["settings", "set", "bluntness=3", "domains=work,health", "--json"], { home });
  assert.equal(set.status, 0, set.stderr);
  assert.equal(set.json.revision, 2);
  assert.equal(set.json.changed.length, 2);
  const text = run(["settings", "set", "review_cadence_days=14"], { home });
  assert.match(text.stdout, /review_cadence_days: 7 → 14/);
  assert.match(text.stdout, /undo with: cairn settings undo/);
  assert.equal(run(["settings", "set", "bluntness=7"], { home }).status, 1);
  assert.equal(run(["settings", "set"], { home }).status, 2);
  assert.equal(run(["settings", "bogus"], { home }).status, 2);
  const undo = run(["settings", "undo", "--json"], { home });
  assert.equal(undo.json.review_cadence_days, 7);
  const hist = run(["settings", "history", "--json"], { home });
  assert.equal(hist.json.length, 4);
  assert.equal(run(["settings", "show"], { home }).stdout.includes("revision 4"), true);
});
check("debt, gates and review read the cadence from the store", "the dial and cadence are one setting each; a tool with its own default would drift from the user's choice", () => {
  const home = tempHome();
  run(["add", "--kind", "note", "--text", "x"], { home, now: "2026-09-01T00:00:00Z" });
  writeFileSync(join(home, "review.json"), JSON.stringify({ choices: [], priorities: [{ domain: "work", weight: 1 }] }));
  assert.equal(run(["review", "--file", join(home, "review.json")], { home, now: "2026-09-10T00:00:00Z" }).status, 0);
  assert.equal(run(["debt", "--json"], { home, now: "2026-09-20T00:00:00Z" }).json.review_due, true);
  run(["settings", "set", "review_cadence_days=30"], { home });
  assert.equal(run(["debt", "--json"], { home, now: "2026-09-20T00:00:00Z" }).json.review_due, false);
  run(["add", "--kind", "prediction", "--text", "far", "--confidence", "60", "--criterion", "c", "--domain", "work", "--resolve-by", "2026-10-05"], { home, now: "2026-09-20T00:00:00Z" });
  assert.equal(run(["gates", "scope", "--json"], { home, now: "2026-09-20T00:00:00Z" }).json.length, 1);
  run(["settings", "set", "review_cadence_days=7"], { home });
  assert.equal(run(["gates", "scope", "--json"], { home, now: "2026-09-20T00:00:00Z" }).json.length, 0);
  assert.ok(!existsSync(join(home, "settings", ".writer.lock")));
});

finish();
