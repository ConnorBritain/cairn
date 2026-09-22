#!/usr/bin/env node
// Local engineering verification; never dispatches models or configures CI.
// Runs each check in order and stops at the first failure. Later roadmap items append
// their test suites here (tests/*.mjs) and tools/check-packaging.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length) {
  console.error("Usage: node tools/check.mjs");
  process.exit(2);
}

const checks = [["tools/check-status.mjs"]];
if (existsSync(join(root, "tools", "check-packaging.mjs"))) checks.push(["tools/check-packaging.mjs"]);
if (existsSync(join(root, "tests"))) {
  for (const file of readdirSync(join(root, "tests")).filter(f => f.endsWith(".mjs") && f !== "harness.mjs").sort()) {
    checks.push([`tests/${file}`]);
  }
}

for (const command of checks) {
  console.log(`\n> node ${command.join(" ")}`);
  const result = spawnSync(process.execPath, command, { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? `Check failed (${result.signal ?? result.status})`);
    process.exit(result.status || 1);
  }
}
console.log(`\nAll ${checks.length} local commands passed. No model generation or GitHub Actions used.`);
