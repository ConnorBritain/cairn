#!/usr/bin/env node
// cairn pending — candidates the optional Stop hook wrote. list, confirm <n>, discard <n>.
// confirm prints the candidate for the capture skill to prefill; it never writes an entry.
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { CairnError, invalid, usage } from "./lib/errors.mjs";
import { appendPending, loadPending } from "./lib/pending-store.mjs";
import { resolveStateDir } from "./lib/store.mjs";
import { nowIso } from "./lib/time.mjs";

export const USAGE = `Usage:
  cairn pending list [--json]
  cairn pending confirm <n> [--json]     mark taken; prints the candidate to capture with /cairn
  cairn pending discard <n> [--json]
Candidates come from the Stop hook when settings.capture_hook is true. Nothing here writes a ledger entry.`;

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
    const state = loadPending(dir);
    const pick = () => {
      const n = Number(positionals[0]);
      if (!Number.isInteger(n) || n < 1) throw usage(`${command} <n> requires a candidate number`);
      const c = state.candidates.find((x) => x.n === n);
      if (!c) throw invalid(`no candidate ${n}`);
      if (c.state !== "open") throw invalid(`candidate ${n} was already ${c.state}`);
      return c;
    };
    switch (command) {
      case "list":
        print(state.open.length ? state.open.map((c) => `${String(c.n).padStart(3)}  ${c.kind_guess.padEnd(10)} ${c.text}`).join("\n") : "no pending candidates", state.open);
        return 0;
      case "confirm": {
        const c = pick();
        appendPending(dir, [{ event: "confirmed", n: c.n, ts: now }]);
        print(`${c.n}  ${c.kind_guess}  ${c.text}\ncapture it with /cairn (the candidate is not an entry until you do)`, { ...c, state: "confirmed" });
        return 0;
      }
      case "discard": {
        const c = pick();
        appendPending(dir, [{ event: "discarded", n: c.n, ts: now }]);
        print(`${c.n} discarded`, { ...c, state: "discarded" });
        return 0;
      }
      case undefined:
      case "help":
        out(`${USAGE}\n`);
        return command ? 0 : 2;
      default:
        throw usage(`unknown pending command: ${command}\n${USAGE}`);
    }
  } catch (e) {
    err(`cairn: ${e.message}\n`);
    return e instanceof CairnError ? e.exitCode : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
