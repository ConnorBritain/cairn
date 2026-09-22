#!/usr/bin/env node
// cairn digest — the review packet. Markdown by default, --json for tooling. Reads only.
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { CairnError, usage } from "./lib/errors.mjs";
import { digest, renderDigest } from "./lib/digest-core.mjs";
import { readEvents, resolveStateDir } from "./lib/store.mjs";
import { nowIso } from "./lib/time.mjs";

export const USAGE = `Usage: cairn digest [--json] [--min-n N] [--now ISO]
The only input the reviewer role receives. CAIRN_HOME sets the state directory.`;

export function main(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s));
  const err = io.stderr ?? ((s) => process.stderr.write(s));
  const env = io.env ?? process.env;
  try {
    if (argv[0] === "help") { out(`${USAGE}\n`); return 0; }
    const { flags, positionals } = parseArgs(argv, { booleans: ["json"] });
    if (positionals.length) throw usage(`unexpected argument ${positionals[0]}\n${USAGE}`);
    const minN = flags.minN === undefined ? undefined : Number(flags.minN);
    if (minN !== undefined && (!Number.isInteger(minN) || minN < 1)) throw usage("--min-n must be a positive integer");
    const now = nowIso(flags.now, env);
    const events = readEvents(resolveStateDir({ env, cwd: io.cwd }));
    const d = digest(events, now, io.settings, { minN });
    out(flags.json ? `${JSON.stringify(d, null, 2)}\n` : `${renderDigest(d)}\n`);
    return 0;
  } catch (e) {
    err(`cairn: ${e.message}\n`);
    return e instanceof CairnError ? e.exitCode : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
