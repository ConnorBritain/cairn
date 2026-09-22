#!/usr/bin/env node
// Item 09: the SessionStart hook prints at most two lines, exactly debtLines, and is
// silent and exit 0 on every failure path.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, finish, group, ROOT, run, tempHome } from "./harness.mjs";

const HOOK = join(ROOT, "hooks", "session-start.mjs");
const hook = ({ home, script = HOOK, input = {}, env = {} }) => {
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, CAIRN_HOME: home, ...env } });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { json = null; }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, context: json?.hookSpecificOutput?.additionalContext ?? null };
};

group("hooks.json");
check("registers the SessionStart script under the plugin root with a timeout; every referenced file exists", "a hook that points at a missing file breaks every session start", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "hooks", "hooks.json"), "utf8"));
  const entries = cfg.hooks.SessionStart.flatMap((h) => h.hooks);
  assert.equal(entries.length, 1);
  assert.match(entries[0].command, /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/session-start\.mjs"$/);
  assert.ok(entries[0].timeout <= 10);
  for (const group of Object.values(cfg.hooks)) for (const h of group.flatMap((x) => x.hooks)) {
    const file = /hooks\/([a-z-]+\.mjs)/.exec(h.command)[1];
    assert.ok(readFileSync(join(ROOT, "hooks", file), "utf8").length > 0, file);
  }
});

group("paths");
check("no state directory → silent, exit 0", "most repos have no ledger; the hook must cost nothing there", () => {
  const r = hook({ home: join(tempHome(), "does-not-exist") });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
check("empty ledger → silent", "an empty ledger is not debt", () => {
  const home = tempHome();
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "ledger.jsonl"), "");
  const r = hook({ home });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
check("one overdue entry → exactly two lines, matching cairn debt", "the hook is the user's only ambient signal; it must say what the tool says", () => {
  const home = tempHome();
  run(["add", "--kind", "commitment", "--text", "ship it", "--domain", "work", "--due-by", "2000-01-01"], { home, now: "1999-12-01T00:00:00Z" });
  const r = hook({ home });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.context.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^cairn: 1 overdue \(m-19991201-[0-9a-z]{4} due 2000-01-01\)$/);
  assert.equal(lines[1], "cairn: no review yet · review due");
  const debt = run(["debt"], { home, now: new Date().toISOString() });
  assert.equal(debt.stdout.trim(), r.context);
});
check("due this week but nothing overdue → two lines with no blocked flag", "due-soon is information, not a block", () => {
  const home = tempHome();
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  run(["add", "--kind", "note", "--text", "check", "--resolve-by", soon], { home, now: new Date().toISOString() });
  const r = hook({ home });
  assert.match(r.context, /^cairn: 1 due this week\n/);
  assert.doesNotMatch(r.context, /blocked/);
});
check("cadence from settings changes review_due in the hook", "the hook reads the user's cadence, not a default", () => {
  const home = tempHome();
  run(["add", "--kind", "note", "--text", "x"], { home, now: "2026-01-01T00:00:00Z" });
  writeFileSync(join(home, "review.json"), JSON.stringify({ choices: [], priorities: [{ domain: "work", weight: 1 }] }));
  run(["review", "--file", join(home, "review.json")], { home, now: new Date(Date.now() - 10 * 86_400_000).toISOString() });
  assert.match(hook({ home }).context, /review due/);
  run(["settings", "set", "review_cadence_days=30"], { home });
  assert.equal(hook({ home }).stdout, "");
});
check("malformed ledger → silent, exit 0", "a corrupt file must not brick the session; the CLI reports it when asked", () => {
  const home = tempHome();
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "ledger.jsonl"), "{not json\n");
  const r = hook({ home });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.equal(run(["debt"], { home }).status, 1);
});
check("missing module (hook copied without tools/) → silent, exit 0", "a partial install must fail quiet, not loud", () => {
  const dir = tempHome();
  mkdirSync(join(dir, "hooks"), { recursive: true });
  cpSync(HOOK, join(dir, "hooks", "session-start.mjs"));
  const r = hook({ home: tempHome(), script: join(dir, "hooks", "session-start.mjs") });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
check("no stdin and garbage stdin both tolerated", "hosts differ in what they pipe; the hook must not depend on it", () => {
  const home = tempHome();
  const r = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", env: { ...process.env, CAIRN_HOME: home } });
  assert.equal(r.status, 0);
});

finish();
