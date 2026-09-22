#!/usr/bin/env node
// cairn debt — overdue, due this week, blocked, last review. Silent when nothing is due.
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { CairnError, usage } from "./lib/errors.mjs";
import { debt, debtLines } from "./lib/debt-core.mjs";
import { loadSettings } from "./lib/settings-store.mjs";
import { readEvents, resolveStateDir } from "./lib/store.mjs";
import { nowIso } from "./lib/time.mjs";

export const USAGE = `Usage: cairn debt [--json] [--now ISO]
Prints at most two lines; prints nothing when nothing is due. CAIRN_HOME sets the state directory.`;

export function main(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s));
  const err = io.stderr ?? ((s) => process.stderr.write(s));
  const env = io.env ?? process.env;
  try {
    if (argv[0] === "help") { out(`${USAGE}\n`); return 0; }
    const { flags, positionals } = parseArgs(argv, { booleans: ["json"] });
    if (positionals.length) throw usage(`unexpected argument ${positionals[0]}\n${USAGE}`);
    const now = nowIso(flags.now, env);
    const dir = resolveStateDir({ env, cwd: io.cwd });
    const events = readEvents(dir);
    const d = debt(events, now, io.settings ?? loadSettings(dir));
    if (flags.json) out(`${JSON.stringify(d, null, 2)}\n`);
    else { const lines = debtLines(d); if (lines.length) out(`${lines.join("\n")}\n`); }
    return 0;
  } catch (e) {
    err(`cairn: ${e.message}\n`);
    return e instanceof CairnError ? e.exitCode : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
