#!/usr/bin/env node
// Item 13: the smoke's parser and assertions, proven on recorded streams so the live
// script's logic is tested even where no CLI is installed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check, finish, group, ROOT } from "./harness.mjs";
import { CASES, RECOMMENDS, agentCalls, agentTarget, assertFullAdversary, assertGateBlocks, assertQuick, bashCalls, claudeArgs, codexArgs, finalText, hookObserved, parseStream } from "../tools/lib/live-core.mjs";

const stream = (name) => parseStream(readFileSync(join(ROOT, "tests", "fixtures", `stream-${name}.jsonl`), "utf8"));
const links = { related: [], supersedes: null };
const quickEntry = { event: "entry", id: "p-20260922-ab12", ts: "2026-09-22T00:00:00Z", kind: "prediction", tier: "quick", domains: ["work"], text: "x", confidence: 70, criterion: "c", dates: { resolve_by: "2026-10-01" }, adversary: { ran: false }, links };
const fullEntry = { ...quickEntry, id: "c-20260922-cd34", kind: "choice", tier: "full", confidence: 80, reasoning: "r", if_then: "revert", adversary: { ran: true, at: "2026-09-22T00:00:00Z" } };

group("parser");
check("stream-json: tool calls, results in both content shapes, texts, result", "every assertion reads this; a missed tool_result would make a real adversary run look absent", () => {
  const s = stream("full");
  assert.equal(s.init.session_id, "s2");
  assert.deepEqual(s.toolCalls.map((c) => c.name), ["Bash", "Agent", "Bash"]);
  assert.equal(s.toolResults.get("t1"), "allowed\n");
  assert.match(s.toolResults.get("t2"), /cairn-adversary: done/);
  assert.equal(s.toolResults.get("t3"), '{"id":"c-20260922-cd34"}');
  assert.equal(finalText(s), "c-20260922-cd34 · due 2026-10-01");
  assert.equal(parseStream("garbage\n\n{\"type\":\"nope\"}").lines, 1);
  assert.deepEqual(agentCalls(s).map(agentTarget), ["cairn-adversary"]);
  assert.equal(bashCalls(s)[0].command.includes("gates check add"), true);
});

group("assertions");
check("capture-quick passes on its stream and fails on the wrong entry or a spawned role", "a smoke that passes on anything proves nothing", () => {
  const s = stream("quick");
  assert.equal(assertQuick({ events: [quickEntry], stream: s }).pass, true);
  assert.equal(assertQuick({ events: [], stream: s }).pass, false);
  assert.equal(assertQuick({ events: [{ ...quickEntry, confidence: 60 }], stream: s }).pass, false);
  assert.equal(assertQuick({ events: [quickEntry], stream: stream("full") }).pass, false);
});
check("capture-full-adversary requires the Agent call, adversary.ran, and clean adversary text", "the adversary must actually run in clean context, and must not recommend", () => {
  const s = stream("full");
  assert.equal(assertFullAdversary({ events: [fullEntry], stream: s }).pass, true, assertFullAdversary({ events: [fullEntry], stream: s }).detail);
  assert.equal(assertFullAdversary({ events: [quickEntry], stream: s }).pass, false);
  assert.equal(assertFullAdversary({ events: [fullEntry], stream: stream("quick") }).pass, false);
  const tainted = stream("full");
  tainted.toolResults.set("t2", "You should go with Postgres.\ncairn-adversary: done");
  const r = assertFullAdversary({ events: [fullEntry], stream: tainted });
  assert.equal(r.pass, false);
  assert.match(r.detail, /matched/);
});
check("gate-blocks requires an unchanged ledger and a refused gate call", "the gate is enforced by the ledger, but the smoke must see the skill ask it", () => {
  const s = stream("gate");
  assert.equal(assertGateBlocks({ ledgerBefore: "a", ledgerAfter: "a", stream: s }).pass, true);
  assert.equal(assertGateBlocks({ ledgerBefore: "a", ledgerAfter: "ab", stream: s }).pass, false);
  assert.equal(assertGateBlocks({ ledgerBefore: "a", ledgerAfter: "a", stream: stream("quick") }).pass, false);
});
check("hook context is detected only when a cairn debt line appears", "best-effort report; must not false-positive on ordinary text", () => {
  assert.equal(hookObserved({ stream: stream("full") }), true);
  assert.equal(hookObserved({ stream: stream("quick") }), false);
});

group("cases and args");
check("three cases, each with a prompt that names its fields and a checker", "the case table is the contract the smoke runs", () => {
  assert.deepEqual(CASES.map((c) => c.name), ["capture-quick", "capture-full-adversary", "gate-blocks"]);
  for (const c of CASES) { assert.match(c.prompt("2026-10-01"), /^\/cairn /); assert.equal(typeof c.check, "function"); }
  assert.equal(CASES[2].seed.length, 1);
  assert.ok(RECOMMENDS.length >= 5);
});
check("headless argument lists carry isolation and structured output", "a smoke that touched the user's settings or lacked a tool stream could not assert anything", () => {
  const a = claudeArgs({ prompt: "/cairn x", root: "/r" });
  assert.equal(a[0], "-p");
  assert.ok(a.includes("--plugin-dir") && a.includes("/r"));
  assert.ok(a.includes("stream-json") && a.includes("--no-session-persistence") && a.includes("dontAsk"));
  assert.equal(a[a.indexOf("--setting-sources") + 1], "");
  const c = codexArgs({ prompt: "/cairn x", root: "/r" });
  assert.equal(c[0], "exec");
  assert.ok(c.includes("--json") && c.includes("--ephemeral"));
});

finish();
