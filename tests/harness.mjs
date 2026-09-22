// Zero-dependency test harness. Every check names why it matters: a ledger that
// mis-scores or silently rewrites looks identical to one that works.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CLI = join(ROOT, "tools", "cli.mjs");

let passed = 0;
let failed = 0;
const failures = [];
const temps = [];

export function group(title) { process.stdout.write(`\n${title}\n`); }

export function check(name, why, fn) {
  try {
    const result = fn();
    if (result === false) throw new Error("returned false");
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } catch (e) {
    failed += 1;
    failures.push(`${name} — ${why} — ${e.message}`);
    process.stdout.write(`  FAIL ${name}\n       why: ${why}\n       ${e.message}\n`);
  }
}

export function tempHome(prefix = "cairn-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

/** Run the CLI in a temp home. Returns { status, stdout, stderr, json }. */
export function run(args, { home, now = "2026-09-22T12:00:00Z", env = {} } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, CAIRN_HOME: home, CAIRN_NOW: now, ...env },
  });
  let json = null;
  if (args.includes("--json")) { try { json = JSON.parse(r.stdout); } catch { json = null; } }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

export function finish() {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failed) { for (const f of failures) process.stdout.write(`  - ${f}\n`); process.exit(1); }
}
