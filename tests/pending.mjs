#!/usr/bin/env node
// Item 10: the Stop hook is opt-in, never writes an entry, scans only new lines, and
// the pending queue is append-only. The witness prompt is fact-bound.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, finish, group, ROOT, run, tempHome } from "./harness.mjs";
import { guessKind, scanTranscript, sentences, userText } from "../tools/lib/pending-core.mjs";
import { readPending } from "../tools/lib/pending-store.mjs";

const HOOK = join(ROOT, "hooks", "stop-capture.mjs");
const hook = ({ home, input }) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, CAIRN_HOME: home } });
const line = (role, text) => JSON.stringify({ type: role, message: { role, content: [{ type: "text", text }] } });
const transcriptFile = (dir, lines) => { const f = join(dir, "transcript.jsonl"); writeFileSync(f, `${lines.join("\n")}\n`); return f; };
const ledgerBytes = (home) => (existsSync(join(home, "ledger.jsonl")) ? readFileSync(join(home, "ledger.jsonl"), "utf8") : null);

group("matchers");
check("each cue family maps to its kind; plain sentences match nothing", "a matcher that fires on ordinary prose fills the queue with noise, which gets ignored, which is the same as not having it", () => {
  assert.equal(guessKind("I'm going with Postgres over SQLite for this."), "choice");
  assert.equal(guessKind("We decided on the monorepo layout."), "choice");
  assert.equal(guessKind("I think the migration will be done next week."), "prediction");
  assert.equal(guessKind("There's a 70% chance the vendor slips."), "prediction");
  assert.equal(guessKind("I'll have the retro written by Friday."), "commitment");
  assert.equal(guessKind("I will ship the fix by tomorrow."), "commitment");
  assert.equal(guessKind("Can you read the file and tell me what it does?"), null);
  assert.equal(guessKind("The tests pass now."), null);
});
check("sentences split on terminators and newlines; short fragments dropped", "a candidate should be one sentence the user can recognize, not a paragraph", () => {
  assert.deepEqual(sentences("First one. Second one!\nThird line here"), ["First one.", "Second one!", "Third line here"]);
  assert.deepEqual(sentences("ok. yes."), []);
});
check("userText reads string and array content, ignores assistant turns and junk", "assistant turns must never become the user's decisions", () => {
  assert.equal(userText(line("user", "hello there")), "hello there");
  assert.equal(userText(JSON.stringify({ type: "user", message: { role: "user", content: "plain" } })), "plain");
  assert.equal(userText(line("assistant", "I'm going with X over Y")), null);
  assert.equal(userText("not json"), null);
});
check("scanTranscript dedupes within a run and against known text, and advances the cursor", "the same sentence must not queue twice across sessions", () => {
  const lines = [line("user", "I'll have the doc done by Monday. I'll have the doc done by Monday."), line("assistant", "ok"), line("user", "I think it will pass.")];
  const first = scanTranscript(lines);
  assert.equal(first.candidates.length, 2);
  assert.equal(first.cursor, 3);
  const again = scanTranscript(lines, { from: first.cursor });
  assert.equal(again.candidates.length, 0);
  const known = scanTranscript(lines, { known: new Set(["i think it will pass"]) });
  assert.equal(known.candidates.length, 1);
});

group("hook");
check("setting off → exits before the transcript is opened; no pending file", "opt-in means the transcript is never read unless the user turned it on", () => {
  const home = tempHome();
  const r = hook({ home, input: { transcript_path: join(home, "nope.jsonl"), cwd: home } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.ok(!existsSync(join(home, "pending.jsonl")));
  const on = hook({ home, input: { transcript_path: join(home, "nope.jsonl"), cwd: home } });
  assert.equal(on.status, 0);
});
check("stop_hook_active → immediate exit even when enabled", "a Stop hook that runs on its own stop loops forever", () => {
  const home = tempHome();
  run(["settings", "set", "capture_hook=true"], { home });
  const t = transcriptFile(home, [line("user", "I'll have it done by Friday.")]);
  const r = hook({ home, input: { transcript_path: t, stop_hook_active: true, cwd: home } });
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(home, "pending.jsonl")));
});
check("enabled: one candidate per cue, correct kind, ledger untouched, cursor advances, second run adds nothing", "the whole point: candidates go to the pending file and never to the ledger", () => {
  const home = tempHome();
  run(["add", "--kind", "note", "--text", "seed"], { home });
  run(["settings", "set", "capture_hook=true"], { home });
  const before = ledgerBytes(home);
  const t = transcriptFile(home, [
    line("user", "I'm going with Rust over Go for the parser."),
    line("assistant", "Noted. I'll have this done by tomorrow."),
    line("user", "I think the release will slip. Also, I'll have the retro written by Friday."),
  ]);
  const r = hook({ home, input: { transcript_path: t, cwd: home } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
  assert.equal(ledgerBytes(home), before);
  const list = run(["pending", "list", "--json"], { home });
  assert.deepEqual(list.json.map((c) => [c.n, c.kind_guess]), [[1, "choice"], [2, "prediction"], [3, "commitment"]]);
  assert.equal(list.json[2].text, "Also, I'll have the retro written by Friday.");
  hook({ home, input: { transcript_path: t, cwd: home } });
  assert.equal(run(["pending", "list", "--json"], { home }).json.length, 3);
  writeFileSync(t, `${readFileSync(t, "utf8")}${line("user", "We'll use SQLite for the cache.")}\n`);
  hook({ home, input: { transcript_path: t, cwd: home } });
  const after = run(["pending", "list", "--json"], { home }).json;
  assert.equal(after.length, 4);
  assert.equal(after[3].kind_guess, "choice");
  assert.equal(ledgerBytes(home), before);
});
check("missing transcript, garbage stdin → silent exit 0", "hosts differ; the hook must not fail loud", () => {
  const home = tempHome();
  run(["settings", "set", "capture_hook=true"], { home });
  assert.equal(hook({ home, input: { transcript_path: join(home, "missing.jsonl") } }).status, 0);
  const r = spawnSync(process.execPath, [HOOK], { input: "garbage", encoding: "utf8", env: { ...process.env, CAIRN_HOME: home } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

group("pending CLI");
check("confirm and discard are append-only and remove the candidate from list; double decisions refused", "a decision on a candidate is a record too; nothing is rewritten", () => {
  const home = tempHome();
  run(["settings", "set", "capture_hook=true"], { home });
  const t = transcriptFile(home, [line("user", "I'll have the spec done by Monday. I bet the demo will work.")]);
  hook({ home, input: { transcript_path: t, cwd: home } });
  const before = readFileSync(join(home, "pending.jsonl"), "utf8");
  const c = run(["pending", "confirm", "1", "--json"], { home });
  assert.equal(c.status, 0, c.stderr);
  assert.equal(c.json.state, "confirmed");
  assert.equal(c.json.kind_guess, "commitment");
  assert.match(run(["pending", "confirm", "2"], { home }).stdout, /capture it with \/cairn/);
  assert.ok(readFileSync(join(home, "pending.jsonl"), "utf8").startsWith(before));
  assert.deepEqual(run(["pending", "list", "--json"], { home }).json, []);
  assert.equal(run(["pending", "confirm", "1"], { home }).status, 1);
  assert.equal(run(["pending", "discard", "9"], { home }).status, 1);
  assert.equal(run(["pending", "discard"], { home }).status, 2);
  assert.equal(run(["pending"], { home }).status, 2);
  assert.equal(readPending(home).filter((e) => e.event === "confirmed").length, 2);
  assert.ok(!existsSync(join(home, "ledger.jsonl")));
});

group("witness");
check("witness prompt is fact-bound, capped at 80 words, sends nothing", "a witness that adds framing turns the user's record into the model's message", () => {
  const text = readFileSync(join(ROOT, "agents", "cairn-witness.md"), "utf8");
  assert.match(text, /^tools: \[\]$/m);
  assert.match(text, /at most 80 words/);
  assert.match(text, /Nothing that is not on the entry/);
  assert.match(text, /No recommendation/);
  const skill = readFileSync(join(ROOT, "skills", "cairn-witness", "SKILL.md"), "utf8");
  assert.match(skill, /Cairn does not send messages/);
});
check("hooks.json registers the Stop hook with stop_hook_active respected in the script", "the loop guard is the one thing a Stop hook must never lack", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "hooks", "hooks.json"), "utf8"));
  const stop = cfg.hooks.Stop.flatMap((h) => h.hooks);
  assert.equal(stop.length, 1);
  assert.match(stop[0].command, /stop-capture\.mjs/);
  assert.match(readFileSync(HOOK, "utf8"), /stop_hook_active/);
});

finish();
