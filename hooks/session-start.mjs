#!/usr/bin/env node
// SessionStart hook: print decision debt in at most two lines. Silent when nothing is
// due. Degrades SILENTLY on every failure (no state, corrupt ledger, missing module):
// a hook that breaks a session gets uninstalled, and an uninstalled hook protects nothing.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function emit(context) {
  if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
  process.exit(0);
}

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* no stdin */ }
const cwd = resolve(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.env.CODEX_PROJECT_DIR || process.cwd());

try {
  const store = await import(new URL("../tools/lib/store.mjs", import.meta.url));
  const debtCore = await import(new URL("../tools/lib/debt-core.mjs", import.meta.url));
  const settingsStore = await import(new URL("../tools/lib/settings-store.mjs", import.meta.url));
  const dir = store.resolveStateDir({ env: process.env, cwd });
  const events = store.readEvents(dir);
  const settings = settingsStore.loadSettings(dir);
  const lines = debtCore.debtLines(debtCore.debt(events, new Date().toISOString(), settings));
  emit(lines.join("\n"));
} catch {
  emit("");
}
