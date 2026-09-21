#!/usr/bin/env node
// The version/STATUS guard. A version cannot ship without the roadmap recording what shipped.
//
//   1. docs/roadmap/STATUS.md carries "Last version: X.Y.Z"; it must equal package.json.
//      Works in any checkout, git or not.
//   2. In a git checkout, if the inspected diff changes package.json's version, it must
//      also touch docs/roadmap/STATUS.md. Default range HEAD~1..HEAD; --staged compares
//      the index against HEAD (pre-commit use); --range <a..b> for anything else.
//      Fewer than two commits, or no git, passes this check vacuously.
//
// Exit 0 pass, 1 fail (reason on stderr), 2 usage.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATUS = "docs/roadmap/STATUS.md";
const PACKAGE = "package.json";

const args = process.argv.slice(2);
let range = "HEAD~1..HEAD";
let staged = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--staged") staged = true;
  else if (args[i] === "--range" && args[i + 1]) { range = args[i + 1]; i += 1; }
  else { console.error("Usage: node tools/check-status.mjs [--staged | --range <a..b>]"); process.exit(2); }
}

function fail(message) { console.error(`check-status: ${message}`); process.exit(1); }

// 1. Pointer equality.
const pkg = JSON.parse(readFileSync(join(root, PACKAGE), "utf8"));
const status = readFileSync(join(root, STATUS), "utf8");
const pointer = /^Last version:\s*(\S+)\s*$/m.exec(status);
if (!pointer) fail(`${STATUS} has no "Last version: X.Y.Z" line`);
if (pointer[1] !== pkg.version) fail(`${STATUS} says ${pointer[1]} but ${PACKAGE} says ${pkg.version}; update STATUS in the same commit as the bump`);

// 2. Same-diff rule.
const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
if (existsSync(join(root, ".git")) && git("rev-parse", "--is-inside-work-tree").status === 0) {
  const commits = Number.parseInt(git("rev-list", "--count", "HEAD").stdout, 10) || 0;
  const diffArgs = staged ? ["diff", "--cached", "--name-only"] : ["diff", "--name-only", range];
  const applicable = staged ? commits >= 1 : commits >= 2;
  if (applicable) {
    const changed = git(...diffArgs);
    if (changed.status === 0) {
      const files = changed.stdout.split("\n").filter(Boolean);
      if (files.includes(PACKAGE)) {
        const [from, to] = staged ? ["HEAD", ":"] : range.split("..");
        const versionAt = (rev) => {
          const r = git("show", `${rev === ":" ? ":" : rev + ":"}${PACKAGE}`);
          if (r.status !== 0) return null;
          try { return JSON.parse(r.stdout).version; } catch { return null; }
        };
        const before = versionAt(from), after = versionAt(to);
        if (before !== null && after !== null && before !== after && !files.includes(STATUS)) {
          fail(`${PACKAGE} version changed ${before} -> ${after} without a change to ${STATUS}`);
        }
      }
    }
  }
}

console.log(`check-status: ${PACKAGE} ${pkg.version} matches ${STATUS}`);
