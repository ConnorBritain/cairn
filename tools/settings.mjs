#!/usr/bin/env node
// cairn settings — show, set, undo, history. Every change is a new immutable revision.
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { CairnError, usage } from "./lib/errors.mjs";
import { FIELDS, parseAssignment } from "./lib/settings-core.mjs";
import { loadSettings, readSettings, setSettings, settingsHistory, undoLast } from "./lib/settings-store.mjs";
import { resolveStateDir } from "./lib/store.mjs";
import { nowIso } from "./lib/time.mjs";

export const USAGE = `Usage:
  cairn settings show [--json]
  cairn settings set <key>=<value> [<key>=<value>…] [--note …] [--json]
  cairn settings undo [--json]
  cairn settings history [--json]
Keys: ${FIELDS.join(", ")}
  bluntness 0–3 · domains a,b,c · review_cadence_days 1–90 · witnesses "Name:note,Other" or JSON · capture_hook true|false
Every change is a new revision; undo writes another revision equal to the previous one.`;

const show = (s, revision) => [
  `revision ${revision ?? "— (defaults, nothing saved yet)"}`,
  `bluntness            ${s.bluntness}  (0 instrument · 1 Socratic · 2 direct · 3 hard)`,
  `domains              ${s.domains.length ? s.domains.join(", ") : "(none)"}`,
  `review_cadence_days  ${s.review_cadence_days}`,
  `witnesses            ${s.witnesses.length ? s.witnesses.map((w) => w.note ? `${w.name} (${w.note})` : w.name).join(", ") : "(none)"}`,
  `capture_hook         ${s.capture_hook}`,
].join("\n");

export function main(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s));
  const err = io.stderr ?? ((s) => process.stderr.write(s));
  const env = io.env ?? process.env;
  try {
    const [command, ...rest] = argv;
    const { flags, positionals } = parseArgs(rest, { booleans: ["json"] });
    const now = nowIso(flags.now, env);
    const dir = resolveStateDir({ env, cwd: io.cwd });
    const print = (text, json) => out(flags.json ? `${JSON.stringify(json, null, 2)}\n` : `${text}\n`);
    switch (command) {
      case "show": {
        const saved = readSettings(dir);
        const s = loadSettings(dir);
        print(show(s, saved?.revision), { ...s, revision: saved?.revision ?? null, saved: Boolean(saved) });
        return 0;
      }
      case "set": {
        if (!positionals.length) throw usage(`set needs at least one key=value\n${USAGE}`);
        const changes = positionals.map(parseAssignment);
        const { settings, changed } = setSettings(dir, changes, now, flags.note ? String(flags.note) : undefined);
        print(`${changed.map((c) => `${c.key}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join("\n")}\nrevision ${settings.revision} · undo with: cairn settings undo`, { ...settings, changed });
        return 0;
      }
      case "undo": {
        const { settings, changed, restored } = undoLast(dir, now);
        print(`${changed.map((c) => `${c.key}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join("\n") || "(values unchanged)"}\nrevision ${settings.revision} restores revision ${restored}`, { ...settings, changed, restored });
        return 0;
      }
      case "history": {
        const h = settingsHistory(dir);
        print(h.length ? h.map((r) => `${String(r.revision).padStart(4)}  ${r.ts}  ${r.note ?? ""}`).join("\n") : "no settings saved yet", h);
        return 0;
      }
      case undefined:
      case "help":
        out(`${USAGE}\n`);
        return command ? 0 : 2;
      default:
        throw usage(`unknown settings command: ${command}\n${USAGE}`);
    }
  } catch (e) {
    err(`cairn: ${e.message}\n`);
    return e instanceof CairnError ? e.exitCode : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
