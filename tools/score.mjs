#!/usr/bin/env node
// cairn score — the numbers, by domain and overall. Reads the ledger, writes nothing.
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { CairnError, usage } from "./lib/errors.mjs";
import { score, summary } from "./lib/score-core.mjs";
import { KINDS } from "./lib/schema.mjs";
import { readEvents, resolveStateDir } from "./lib/store.mjs";
import { nowIso } from "./lib/time.mjs";

export const USAGE = `Usage:
  cairn score [--domain d] [--kind k] [--since ISO|YYYY-MM-DD] [--min-n N] [--json]
  cairn score --domain d --summary [--json]     the block the adversary receives
Common: --now <ISO> (or CAIRN_NOW); CAIRN_HOME sets the state directory.`;

const fmt = (s, pct = false) => (s.insufficient ? `insufficient (n=${s.n})` : `${pct ? `${Math.round(s.value * 100)}%` : s.value.toFixed(3)} (n=${s.n})`);

export function main(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s));
  const err = io.stderr ?? ((s) => process.stderr.write(s));
  const env = io.env ?? process.env;
  try {
    if (argv[0] === "help") { out(`${USAGE}\n`); return 0; }
    const { flags, positionals } = parseArgs(argv, { booleans: ["json", "summary"] });
    if (positionals.length) throw usage(`unexpected argument ${positionals[0]}\n${USAGE}`);
    if (flags.kind && !KINDS.includes(flags.kind)) throw usage(`--kind must be one of ${KINDS.join(", ")}`);
    const minN = flags.minN === undefined ? undefined : Number(flags.minN);
    if (minN !== undefined && (!Number.isInteger(minN) || minN < 1)) throw usage("--min-n must be a positive integer");
    const now = nowIso(flags.now, env);
    const events = readEvents(resolveStateDir({ env, cwd: io.cwd }));
    if (flags.summary) {
      if (!flags.domain) throw usage("--summary requires --domain");
      const s = summary(events, now, String(flags.domain), { minN });
      out(flags.json ? `${JSON.stringify(s, null, 2)}\n` : renderSummary(s));
      return 0;
    }
    const s = score(events, now, { minN, domain: flags.domain, kind: flags.kind, since: flags.since });
    out(flags.json ? `${JSON.stringify(s, null, 2)}\n` : render(s));
    return 0;
  } catch (e) {
    err(`cairn: ${e.message}\n`);
    return e instanceof CairnError ? e.exitCode : 1;
  }
}

function renderBuckets(buckets) {
  return buckets.map((b) => `  ${b.range.padEnd(7)} n=${String(b.n).padStart(3)}  ${b.insufficient ? "insufficient" : `said ${b.mean_confidence.toFixed(1)}%  hit ${Math.round(b.hit_rate * 100)}%  gap ${b.gap >= 0 ? "+" : ""}${b.gap.toFixed(2)}`}`).join("\n");
}

function render(s) {
  const lines = [];
  const scope = [s.filters.domain && `domain ${s.filters.domain}`, s.filters.kind && `kind ${s.filters.kind}`, s.filters.since && `since ${s.filters.since}`].filter(Boolean).join(", ");
  lines.push(`cairn score${scope ? ` (${scope})` : ""} at ${s.now}  min n ${s.min_n}`);
  lines.push(`entries ${s.n.entries} · open ${s.n.open} · overdue ${s.n.overdue} · resolved ${s.n.resolved} · scored ${s.n.scored} · released ${s.n.released} · revised ${s.n.revised}`);
  lines.push("", `Brier overall  ${fmt(s.brier.overall)}`);
  for (const [d, v] of Object.entries(s.brier.by_domain)) lines.push(`  ${d.padEnd(14)} ${fmt(v)}`);
  for (const [k, v] of Object.entries(s.brier.by_kind)) if (v.n) lines.push(`  by ${k.padEnd(11)} ${fmt(v)}`);
  lines.push("", "Calibration", renderBuckets(s.calibration.buckets), `  expected error ${fmt(s.calibration.expected_error)}`);
  lines.push("", `Informativeness  ${fmt(s.informativeness)}`, `Release rate     ${fmt(s.release_rate, true)}`, `Revised          ${s.revised_count}`, `Overdue          ${s.overdue_count}`);
  lines.push("", `Process mean     ${fmt(s.process.mean)}`, `  adversary      ${fmt(s.process.by_flag.adversary, true)}`, `  criterion      ${fmt(s.process.by_flag.criterion, true)}`, `  reasoning      ${fmt(s.process.by_flag.reasoning, true)}`, `Stake honored    ${fmt(s.stake.honored_rate, true)}`);
  lines.push("", "Drift");
  if (s.drift.reason) lines.push(`  insufficient: ${s.drift.reason}`);
  else {
    lines.push(`  since ${s.drift.review} (${s.drift.since}) · n=${s.drift.n}${s.drift.insufficient ? " (insufficient)" : ""} · total variation ${s.drift.total_variation.toFixed(2)}`);
    for (const [d, v] of Object.entries(s.drift.by_domain)) lines.push(`  ${d.padEnd(14)} stated ${Math.round(v.stated * 100)}%  actual ${Math.round(v.actual * 100)}%  delta ${v.delta >= 0 ? "+" : ""}${Math.round(v.delta * 100)}%`);
    for (const w of s.drift.by_week) lines.push(`  ${w.week}  n=${w.n}  ${Object.entries(w.shares).map(([d, v]) => `${d} ${Math.round(v * 100)}%`).join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderSummary(s) {
  return [
    `domain ${s.domain}: resolved ${s.n.resolved} · scored ${s.n.scored} · overdue ${s.n.overdue}`,
    `Brier ${fmt(s.brier)} · informativeness ${fmt(s.informativeness)} · overdue ${s.overdue_count}`,
    renderBuckets(s.calibration),
  ].join("\n") + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
