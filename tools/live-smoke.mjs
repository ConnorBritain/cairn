#!/usr/bin/env node
// Opt-in live smoke: runs the capture skill in headless Claude Code (and Codex when
// present) against a fresh CAIRN_HOME per case and asserts on the ledger file and the
// tool-call stream, never on prose. MAKES REAL MODEL CALLS on your account; requires
// --yes. Not part of tools/check.mjs.
//
//   node tools/live-smoke.mjs --yes [--only <case>] [--codex] [--keep]
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES, claudeArgs, codexArgs, hookObserved, parseStream } from "./lib/live-core.mjs";
import { readEvents } from "./lib/store.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (!args.includes("--yes")) {
  console.error("live-smoke makes real model calls on your account (one headless session per case, 3 cases per CLI).\nRe-run with --yes to proceed. Nothing was run.");
  process.exit(2);
}
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const withCodex = args.includes("--codex");
const keep = args.includes("--keep");
const onPath = (bin) => spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 20000 }).status === 0;
const date = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

const ledgerText = (home) => (existsSync(join(home, "ledger.jsonl")) ? readFileSync(join(home, "ledger.jsonl"), "utf8") : "");
function seed(home, c) {
  for (const argv of c.seed) {
    const r = spawnSync(process.execPath, [join(root, "tools", "cli.mjs"), ...argv], { encoding: "utf8", env: { ...process.env, CAIRN_HOME: home, CAIRN_NOW: c.seedNow ?? "" } });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  }
}

function runCase(harness, c) {
  const home = mkdtempSync(join(tmpdir(), `cairn-smoke-${harness}-${c.name}-`));
  try {
    seed(home, c);
    const before = ledgerText(home);
    const prompt = c.prompt(date);
    const argv = harness === "claude" ? claudeArgs({ prompt, root }) : codexArgs({ prompt, root });
    const r = spawnSync(harness, argv, { encoding: "utf8", cwd: root, timeout: 300000, killSignal: "SIGKILL", maxBuffer: 32 * 1024 * 1024, env: { ...process.env, CAIRN_HOME: home } });
    const stream = parseStream(r.stdout);
    if (keep) writeFileSync(join(home, `stream-${harness}.jsonl`), r.stdout);
    if (r.status !== 0 && !stream.result) return { pass: false, detail: `${harness} exited ${r.status}: ${(r.stderr || r.stdout).slice(0, 300)}`, home };
    let events;
    try { events = readEvents(home); } catch (e) { return { pass: false, detail: `ledger unreadable: ${e.message}`, home }; }
    const verdict = harness === "claude" ? c.check({ events, stream, ledgerBefore: before, ledgerAfter: ledgerText(home) })
      : c.check({ events, stream: { ...stream, toolCalls: stream.toolCalls, toolResults: stream.toolResults }, ledgerBefore: before, ledgerAfter: ledgerText(home) });
    const hook = harness === "claude" && c.seed.length ? ` · hook context observed: ${hookObserved({ stream }) ? "yes" : "no"}` : "";
    return { ...verdict, detail: `${verdict.detail}${hook}`, home, stream };
  } finally { if (!keep) rmSync(home, { recursive: true, force: true }); }
}

let failed = 0;
for (const harness of ["claude", ...(withCodex ? ["codex"] : [])]) {
  if (!onPath(harness)) { console.log(`SKIP  ${harness}: not on PATH`); continue; }
  for (const c of CASES) {
    if (only && c.name !== only) continue;
    if (harness === "codex" && c.name !== "capture-quick" && c.name !== "gate-blocks") { console.log(`SKIP  codex ${c.name}: tool stream shape not asserted for Codex`); continue; }
    let out;
    try { out = runCase(harness, c); } catch (e) { out = { pass: false, detail: e.message }; }
    console.log(`${out.pass ? "PASS" : "FAIL"}  ${harness} ${c.name}: ${out.detail}${keep && out.home ? ` (kept ${out.home})` : ""}`);
    if (!out.pass) failed += 1;
  }
}
process.exit(failed ? 1 : 0);
