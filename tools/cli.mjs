#!/usr/bin/env node
// cairn — one entry point for every tool. Each tool also runs standalone.
import { fileURLToPath } from "node:url";

const TOOLS = {
  ledger: () => import("./ledger.mjs"),
  gates: () => import("./gates.mjs"),
  score: () => import("./score.mjs"),
  debt: () => import("./debt.mjs"),
  digest: () => import("./digest.mjs"),
  settings: () => import("./settings.mjs"),
  export: () => import("./export.mjs"),
};
// Ledger verbs are reachable without the "ledger" prefix.
const LEDGER_VERBS = ["add", "resolve", "release", "reflect", "list", "show", "related", "review"];

const USAGE = `Usage: cairn <command> [args]
Commands:
  ledger <add|resolve|release|reflect|list|show|related> …   the record
  ${LEDGER_VERBS.join(" | ")}   shortcuts for the ledger verbs
  gates <check add|release|review | scope> …                  the rules, without acting
  score [--domain d] [--kind k] [--since …] [--summary] …      the numbers
  debt [--json]                                               overdue, due this week, blocked, last review
  digest [--json]                                             the review packet
  settings <show | set k=v… | undo | history>                 the dial and the rest, versioned
  export <ledger|scores> --format md|csv [--out path|-]       dumps
  help
Run "cairn <command> help" for that command's usage.`;

export async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help") { process.stdout.write(`${USAGE}\n`); return command ? 0 : 2; }
  if (LEDGER_VERBS.includes(command)) return (await TOOLS.ledger()).main([command, ...rest]);
  const load = TOOLS[command];
  if (!load) { process.stderr.write(`cairn: unknown command ${command}\n${USAGE}\n`); return 2; }
  return (await load()).main(rest);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
