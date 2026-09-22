#!/usr/bin/env node
// Stop hook, OFF by default: when settings.capture_hook is true, scan the session
// transcript's user turns since the last scan for decision language and append
// candidates to pending.jsonl for the user to confirm or discard next time.
// Never writes a ledger entry. Emits nothing. Silent exit 0 on every failure.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const done = () => process.exit(0);

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* no stdin */ }
if (input.stop_hook_active) done();   // never loop
const cwd = resolve(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.env.CODEX_PROJECT_DIR || process.cwd());

try {
  const store = await import(new URL("../tools/lib/store.mjs", import.meta.url));
  const settingsStore = await import(new URL("../tools/lib/settings-store.mjs", import.meta.url));
  const dir = store.resolveStateDir({ env: process.env, cwd });
  if (settingsStore.loadSettings(dir).capture_hook !== true) done();   // opt-in only; the transcript is not opened

  const transcript = input.transcript_path;
  if (!transcript || !existsSync(transcript)) done();
  const core = await import(new URL("../tools/lib/pending-core.mjs", import.meta.url));
  const pending = await import(new URL("../tools/lib/pending-store.mjs", import.meta.url));

  const state = pending.loadPending(dir);
  const from = state.cursors.get(transcript) ?? 0;
  const lines = readFileSync(transcript, "utf8").split("\n");
  if (lines.length <= from) done();
  const known = new Set(state.candidates.map((c) => c.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
  const { candidates, cursor } = core.scanTranscript(lines, { from, known });
  const ts = new Date().toISOString();
  const events = candidates.map((c, i) => ({ event: "candidate", n: state.nextN + i, ts, kind_guess: c.kind_guess, text: c.text, source: "stop-hook", transcript, line: c.line }));
  events.push({ event: "cursor", ts, transcript, line: cursor });
  pending.appendPending(dir, events);
} catch { /* silent */ }
done();
