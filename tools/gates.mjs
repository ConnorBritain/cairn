#!/usr/bin/env node
// cairn gates — check a proposed action against the rules without performing it.
// Exit 0 allowed, 3 refused, 1 error, 2 usage. --json prints the verdict object.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { CairnError, usage } from "./lib/errors.mjs";
import { canAdd, canCloseReview, canRelease, reviewScope } from "./lib/gates-core.mjs";
import { indexEvents } from "./lib/status.mjs";
import { readEvents, resolveStateDir } from "./lib/store.mjs";
import { nowIso } from "./lib/time.mjs";

export const USAGE = `Usage:
  cairn gates check add [--tier quick|full] [--json]
  cairn gates check release <id> [--reason …] [--json]
  cairn gates check review [--file review.json] [--json]
  cairn gates scope [--json]           open items the next review must decide on
Common: --now <ISO> (or CAIRN_NOW); CAIRN_HOME sets the state directory.`;

export function main(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s));
  const err = io.stderr ?? ((s) => process.stderr.write(s));
  const env = io.env ?? process.env;
  try {
    const [command, action, ...rest] = argv;
    const { flags, positionals } = parseArgs(rest, { booleans: ["json"] });
    const now = nowIso(flags.now, env);
    const dir = resolveStateDir({ env, cwd: io.cwd });
    const events = readEvents(dir);

    if (command === "scope") {
      const { flags: f } = parseArgs([action, ...rest].filter(Boolean), { booleans: ["json"] });
      const rows = reviewScope(events, nowIso(f.now, env), io.settings);
      out(f.json ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.map((r) => `${r.status.padEnd(8)} ${r.id}  ${r.date}  ${r.text}`).join("\n")}\n`);
      return 0;
    }
    if (command !== "check") {
      if (!command || command === "help") { out(`${USAGE}\n`); return command ? 0 : 2; }
      throw usage(`unknown gates command: ${command}\n${USAGE}`);
    }

    let verdict;
    switch (action) {
      case "add":
        verdict = canAdd({ tier: flags.tier || "quick" }, events, now);
        break;
      case "release": {
        const id = positionals[0];
        if (!id) throw usage("check release <id> required");
        const entry = indexEvents(events).entries.get(id);
        verdict = canRelease(entry, flags.reason ? String(flags.reason) : "", events, now);
        break;
      }
      case "review": {
        const review = flags.file ? JSON.parse(readFileSync(String(flags.file), "utf8")) : { choices: [] };
        verdict = canCloseReview(review, events, now, io.settings);
        break;
      }
      default:
        throw usage(`check ${action ?? ""}: expected add, release or review\n${USAGE}`);
    }
    if (flags.json) out(`${JSON.stringify(verdict, null, 2)}\n`);
    else out(verdict.allowed ? "allowed\n" : `${verdict.reasons.join("\n")}\n`);
    return verdict.allowed ? 0 : 3;
  } catch (e) {
    err(`cairn: ${e.message}\n`);
    return e instanceof CairnError ? e.exitCode : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
