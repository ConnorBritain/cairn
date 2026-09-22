#!/usr/bin/env node
// Opt-in installation check. Installs this checkout into ISOLATED configuration
// directories for Claude Code and Codex, verifies discovery and that the relative tool
// paths survive, and removes everything. Needs the CLIs on PATH; makes no model calls;
// never touches your real ~/.claude or ~/.codex. Not part of tools/check.mjs.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const onPath = (bin) => spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 20000 }).status === 0;
const temp = mkdtempSync(join(tmpdir(), "cairn-install-"));
const run = (file, args, env, cwd = temp) => execFileSync(file, args, {
  env: { ...process.env, ...env }, cwd, encoding: "utf8", stdio: "pipe", timeout: 120000, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024,
});
let checked = 0;
try {
  const home = join(temp, "cairn-home");
  mkdirSync(home);

  if (onPath("claude")) {
    const config = join(temp, "claude");
    mkdirSync(config);
    const env = { CLAUDE_CONFIG_DIR: config, CAIRN_HOME: home };
    console.log("Claude Code: installing into an isolated CLAUDE_CONFIG_DIR…");
    run("claude", ["plugin", "marketplace", "add", root], env);
    run("claude", ["plugin", "install", "cairn@cairn", "--scope", "user"], env);
    const listing = JSON.parse(run("claude", ["plugin", "list", "--json"], env));
    const entry = (Array.isArray(listing) ? listing : listing.installed ?? []).find((e) => (e.id ?? `${e.name}@${e.marketplaceName}`) === "cairn@cairn");
    assert.ok(entry, `cairn@cairn not in plugin list: ${JSON.stringify(listing).slice(0, 300)}`);
    assert.ok(entry.enabled !== false, "plugin enabled");
    assert.ok(!entry.errors?.length, `plugin errors: ${JSON.stringify(entry.errors)}`);
    const installed = entry.installPath ?? entry.path;
    assert.ok(installed && existsSync(installed), `install path ${installed}`);
    for (const f of ["skills/cairn/SKILL.md", "skills/cairn/references/bluntness.md", "agents/cairn-adversary.md", "agents/cairn-reviewer.md", "agents/cairn-witness.md", "hooks/hooks.json", "hooks/session-start.mjs", "tools/cli.mjs"]) {
      assert.ok(existsSync(join(installed, f)), `${f} present in the installed plugin`);
    }
    const debt = run(process.execPath, [join(installed, "tools", "cli.mjs"), "debt"], env);
    assert.equal(debt, "", "installed CLI runs from its install path and is silent on an empty ledger");
    const hook = spawnSync(process.execPath, [join(installed, "hooks", "session-start.mjs")], { input: "{}", encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(hook.status, 0, "installed hook exits 0");
    console.log(`  plugin cairn@cairn enabled at ${installed}; skills, agents, hooks and tools discovered; CLI and hook run from the install`);
    checked += 1;
  } else console.log("Claude Code: `claude` not on PATH, skipped.");

  {
    const codexHome = join(temp, "codex");
    mkdirSync(codexHome);
    const env = { CODEX_HOME: codexHome, CAIRN_HOME: home };
    console.log("Codex: rendering custom agents into an isolated CODEX_HOME…");
    run(process.execPath, [join(root, "install-cairn-codex.mjs"), "--agents-only"], env);
    run(process.execPath, [join(root, "install-cairn-codex.mjs"), "--check", "--agents-only"], env);
    for (const a of ["cairn-adversary", "cairn-reviewer", "cairn-witness"]) assert.ok(existsSync(join(codexHome, "agents", `${a}.toml`)), a);
    console.log("  three custom agents rendered and verified");
    if (onPath("codex")) {
      run(process.execPath, [join(root, "install-cairn-codex.mjs")], env);
      run(process.execPath, [join(root, "install-cairn-codex.mjs"), "--check"], env);
      console.log("  plugin installed and verified through the codex CLI");
      checked += 1;
    } else console.log("  `codex` not on PATH; plugin installation not exercised.");
  }

  if (!checked) { console.error("Neither claude nor codex is on PATH; nothing was exercised end to end."); process.exit(1); }
  console.log("Installation passed: isolated configuration only, no model calls, no changes to personal settings.");
} finally { rmSync(temp, { recursive: true, force: true }); }
