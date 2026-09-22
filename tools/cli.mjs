#!/usr/bin/env node
// cairn — one entry point for every tool. Each tool also runs standalone.
import { fileURLToPath } from "node:url";

const TOOLS = {
  ledger: () => import("./ledger.mjs"),
};
// Ledger verbs are reachable without the "ledger" prefix.
const LEDGER_VERBS = ["add", "resolve", "release", "reflect", "list", "show", "related"];

const USAGE = `Usage: cairn <command> [args]
Commands:
  ledger <add|resolve|release|reflect|list|show|related> …   the record
  ${LEDGER_VERBS.join(" | ")}   shortcuts for the ledger verbs
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
