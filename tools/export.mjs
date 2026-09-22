#!/usr/bin/env node
// cairn export — markdown and CSV dumps of the ledger and the scores. Writes under
// <state>/exports/ by default, or --out - for stdout. Never touches the ledger.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { CairnError, usage } from "./lib/errors.mjs";
import { score } from "./lib/score-core.mjs";
import { annotateAll, indexEvents } from "./lib/status.mjs";
import { readEvents, resolveStateDir } from "./lib/store.mjs";
import { dateOf, nowIso } from "./lib/time.mjs";

export const USAGE = `Usage:
  cairn export ledger --format md|csv [--out path | --out -]
  cairn export scores --format md|csv [--out path | --out -]
Default --out: <state>/exports/<what>-<YYYY-MM-DD>.<ext>`;

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("|") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const mdCell = (v) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v)).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");

export const LEDGER_COLUMNS = ["id", "created_at", "kind", "tier", "status", "domains", "confidence", "date", "text", "criterion", "chosen", "over", "if_then", "supersedes", "superseded_by", "resolved_at", "outcome", "outcome_score", "process_score", "stake_honored", "released_at", "release_reason"];

export function ledgerRows(events, nowIso) {
  return annotateAll(indexEvents(events), nowIso).map((r) => ({
    id: r.id, created_at: r.ts, kind: r.kind, tier: r.tier, status: r.status, domains: r.domains, confidence: r.confidence, date: r.date,
    text: r.text, criterion: r.criterion, chosen: r.chosen, over: r.over, if_then: r.if_then, supersedes: r.links.supersedes, superseded_by: r.superseded_by,
    resolved_at: r.resolution?.ts ?? null, outcome: r.resolution?.outcome ?? null, outcome_score: r.resolution?.outcome_score ?? null,
    process_score: r.resolution?.process_score ?? null, stake_honored: r.resolution?.stake_honored ?? null,
    released_at: r.release?.ts ?? null, release_reason: r.release?.reason ?? null,
  }));
}

/** Flatten the score object into { key, value, n } rows. */
export function scoreRows(s) {
  const rows = [];
  const push = (key, stat) => rows.push(stat && typeof stat === "object" && "n" in stat
    ? { key, value: stat.insufficient ? "insufficient" : stat.value, n: stat.n }
    : { key, value: stat, n: "" });
  for (const [k, v] of Object.entries(s.n)) push(`n.${k}`, v);
  push("brier.overall", s.brier.overall);
  for (const [d, v] of Object.entries(s.brier.by_domain)) push(`brier.by_domain.${d}`, v);
  for (const [k, v] of Object.entries(s.brier.by_kind)) push(`brier.by_kind.${k}`, v);
  for (const b of s.calibration.buckets) {
    push(`calibration.${b.range}.mean_confidence`, { value: b.mean_confidence, n: b.n, insufficient: b.n === 0 });
    push(`calibration.${b.range}.hit_rate`, { value: b.hit_rate, n: b.n, insufficient: Boolean(b.insufficient) });
    push(`calibration.${b.range}.gap`, { value: b.gap, n: b.n, insufficient: Boolean(b.insufficient) });
  }
  push("calibration.expected_error", s.calibration.expected_error);
  push("informativeness", s.informativeness);
  push("release_rate", s.release_rate);
  push("revised_count", s.revised_count);
  push("overdue_count", s.overdue_count);
  push("process.mean", s.process.mean);
  for (const [k, v] of Object.entries(s.process.by_flag)) push(`process.by_flag.${k}`, v);
  push("stake.honored_rate", s.stake.honored_rate);
  if (s.drift.reason) push("drift", { value: `insufficient: ${s.drift.reason}`, n: 0, insufficient: false });
  else {
    push("drift.total_variation", { value: s.drift.total_variation, n: s.drift.n, insufficient: false });
    for (const [d, v] of Object.entries(s.drift.by_domain)) { push(`drift.${d}.stated`, v.stated); push(`drift.${d}.actual`, v.actual); push(`drift.${d}.delta`, v.delta); }
  }
  return rows;
}

const toCsv = (columns, rows) => [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
const toMd = (columns, rows, title) => [`# ${title}`, "", `| ${columns.join(" | ")} |`, `|${columns.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${columns.map((c) => mdCell(r[c])).join(" | ")} |`), ""].join("\n");

export function main(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s));
  const err = io.stderr ?? ((s) => process.stderr.write(s));
  const env = io.env ?? process.env;
  try {
    const [what, ...rest] = argv;
    if (!what || what === "help") { out(`${USAGE}\n`); return what ? 0 : 2; }
    if (!["ledger", "scores"].includes(what)) throw usage(`export ${what}: expected ledger or scores\n${USAGE}`);
    const { flags, positionals } = parseArgs(rest, { booleans: [] });
    if (positionals.length) throw usage(`unexpected argument ${positionals[0]}\n${USAGE}`);
    const format = flags.format || "md";
    if (!["md", "csv"].includes(format)) throw usage("--format must be md or csv");
    const now = nowIso(flags.now, env);
    const dir = resolveStateDir({ env, cwd: io.cwd });
    const events = readEvents(dir);
    let text;
    if (what === "ledger") {
      const rows = ledgerRows(events, now);
      text = format === "csv" ? toCsv(LEDGER_COLUMNS, rows) : toMd(LEDGER_COLUMNS, rows, `Cairn ledger · ${rows.length} entries · ${now}`);
    } else {
      const rows = scoreRows(score(events, now));
      text = format === "csv" ? toCsv(["key", "value", "n"], rows) : toMd(["key", "value", "n"], rows, `Cairn scores · ${now}`);
    }
    const target = flags.out ? String(flags.out) : join(dir, "exports", `${what}-${dateOf(now)}.${format}`);
    if (target === "-") { out(text); return 0; }
    mkdirSync(join(target, ".."), { recursive: true, mode: 0o700 });
    writeFileSync(target, text, { mode: 0o600 });
    out(`${target}\n`);
    return 0;
  } catch (e) {
    err(`cairn: ${e.message}\n`);
    return e instanceof CairnError ? e.exitCode : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
