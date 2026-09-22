#!/usr/bin/env node
// cairn ledger — append, resolve, release, reflect, list, show, related.
// Thin: parse, resolve state dir, call ledger-core, append, print.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { CairnError, usage } from "./lib/errors.mjs";
import { addEntry, listEntries, reflectEntry, relatedEntries, releaseEntry, resolveEntry, reviewEntry, showEntry } from "./lib/ledger-core.mjs";
import { loadSettings } from "./lib/settings-store.mjs";
import { KINDS } from "./lib/schema.mjs";
import { STATUSES } from "./lib/status.mjs";
import { appendEvent, readEvents, resolveStateDir } from "./lib/store.mjs";
import { nowIso } from "./lib/time.mjs";

export const USAGE = `Usage:
  cairn ledger add --kind <prediction|choice|commitment|note> [--tier quick|full]
        --text … [--confidence N] --domain d [--domain d2] [--criterion …]
        [--resolve-by|--review-by|--due-by YYYY-MM-DD] [--chosen … --over …]
        [--if-then …] [--reasoning …] [--adversary-file path.json | --adversary-json '{…}']
        [--related id]… [--supersedes id] [--json]
  cairn ledger resolve <id> --outcome <label> [--stake-honored yes|no|n/a] [--reflection …] [--json]
  cairn ledger release <id> --reason … [--json]
  cairn ledger reflect <id> --text … [--json]
  cairn ledger list [--status ${STATUSES.join("|")}] [--kind k] [--domain d] [--json]
  cairn ledger show <id> [--json]
  cairn ledger related [--domain d]… [--kind k] [--text …] [--limit 5] [--json]
  cairn ledger review --file review.json [--json]
        review.json: { "choices": [{ "entry", "action": "recommit|adjust|release", "result" }],
                       "priorities": [{ "domain", "weight" }], "notes"?, "period"?: { "from", "to" } }
Common: --now <ISO> (or CAIRN_NOW) fixes the clock; CAIRN_HOME sets the state directory.`;

export function main(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s));
  const err = io.stderr ?? ((s) => process.stderr.write(s));
  const env = io.env ?? process.env;
  try {
    const [command, ...rest] = argv;
    const { flags, positionals } = parseArgs(rest, { multi: ["domain", "related"], booleans: ["json"] });
    const now = nowIso(flags.now, env);
    const dir = resolveStateDir({ env, cwd: io.cwd });
    const print = (text, json) => out(flags.json ? `${JSON.stringify(json, null, 2)}\n` : `${text}\n`);

    switch (command) {
      case "add": {
        if (flags.id) throw usage("entries are immutable; add a new entry with --supersedes <id>");
        if (!flags.kind) throw usage(`--kind required (${KINDS.join(", ")})`);
        let adversary;
        if (flags.adversaryFile && flags.adversaryJson) throw usage("use --adversary-file or --adversary-json, not both");
        if (flags.adversaryFile) adversary = JSON.parse(readFileSync(String(flags.adversaryFile), "utf8"));
        if (flags.adversaryJson) adversary = JSON.parse(String(flags.adversaryJson));
        const input = {
          kind: flags.kind, tier: flags.tier, text: flags.text, confidence: flags.confidence,
          domains: flags.domain, criterion: flags.criterion,
          dates: { resolve_by: flags.resolveBy, review_by: flags.reviewBy, due_by: flags.dueBy },
          chosen: flags.chosen, over: flags.over, if_then: flags.ifThen, reasoning: flags.reasoning,
          adversary, links: { related: flags.related || [], supersedes: flags.supersedes },
        };
        const events = readEvents(dir);
        const { event, notices } = addEntry(events, input, { ts: now });
        appendEvent(dir, event);
        const shown = showEntry([...events, event], event.id, now);
        for (const n of notices) err(`note: ${n}\n`);
        print(`${event.id}  ${event.kind} (${event.tier})${shown.date ? `  due ${shown.date}` : ""}`, { ...shown, notices });
        return 0;
      }
      case "resolve": {
        const id = positionals[0];
        if (!id) throw usage("resolve <id> required");
        if (!flags.outcome) throw usage("--outcome required");
        const events = readEvents(dir);
        const event = resolveEntry(events, { id, outcome: String(flags.outcome), stakeHonored: flags.stakeHonored, reflection: flags.reflection, ts: now });
        appendEvent(dir, event);
        print(`${event.id}  ${id} resolved ${event.outcome}  Brier ${event.outcome_score ?? "n/a"}  process ${event.process_score}`, event);
        return 0;
      }
      case "release": {
        const id = positionals[0];
        if (!id) throw usage("release <id> required");
        const events = readEvents(dir);
        const event = releaseEntry(events, { id, reason: flags.reason ? String(flags.reason) : "", ts: now });
        appendEvent(dir, event);
        print(`${event.id}  ${id} released: ${event.reason}`, event);
        return 0;
      }
      case "reflect": {
        const id = positionals[0];
        if (!id) throw usage("reflect <id> required");
        const events = readEvents(dir);
        const event = reflectEntry(events, { id, text: flags.text ? String(flags.text) : "", ts: now });
        appendEvent(dir, event);
        print(`${event.id}  reflection added to ${id}`, event);
        return 0;
      }
      case "list": {
        if (flags.status && !STATUSES.includes(flags.status)) throw usage(`--status must be one of ${STATUSES.join(", ")}`);
        const rows = listEntries(readEvents(dir), { status: flags.status, kind: flags.kind, domain: flags.domain?.[0], now });
        print(rows.map(line).join("\n"), rows);
        return 0;
      }
      case "show": {
        const id = positionals[0];
        if (!id) throw usage("show <id> required");
        const row = showEntry(readEvents(dir), id, now);
        print(describe(row), row);
        return 0;
      }
      case "related": {
        const limit = flags.limit ? Number(flags.limit) : 5;
        if (!Number.isInteger(limit) || limit < 0) throw usage("--limit must be a non-negative integer");
        const rows = relatedEntries(readEvents(dir), { domains: flags.domain, kind: flags.kind, text: flags.text, limit, now });
        print(rows.map(line).join("\n"), rows);
        return 0;
      }
      case "review": {
        if (!flags.file) throw usage("review --file review.json required");
        const review = JSON.parse(readFileSync(String(flags.file), "utf8"));
        const events = readEvents(dir);
        const settings = io.settings ?? loadSettings(dir);
        const event = reviewEntry(events, { review, ts: now, settings });
        appendEvent(dir, event);
        const cadence = settings.review_cadence_days;
        const next = new Date(Date.parse(now) + cadence * 86_400_000).toISOString().slice(0, 10);
        print(`${event.id}  review recorded: ${event.choices.length} forced choice${event.choices.length === 1 ? "" : "s"}, ${event.resolved.length} resolved in period, priorities ${event.priorities.map((p) => `${p.domain} ${p.weight}`).join(", ")} · next review by ${next}`, { ...event, next_review_by: next });
        return 0;
      }
      case undefined:
      case "help":
        out(`${USAGE}\n`);
        return command ? 0 : 2;
      default:
        throw usage(`unknown ledger command: ${command}\n${USAGE}`);
    }
  } catch (e) {
    if (e instanceof CairnError) { err(`cairn: ${e.message}\n`); return e.exitCode; }
    err(`cairn: ${e.message}\n`);
    return 1;
  }
}

export function line(row) {
  const conf = row.confidence === null ? "  —" : `${String(row.confidence).padStart(3)}%`;
  return `${row.status.padEnd(10)} ${row.id}  ${row.kind.padEnd(10)} ${conf}  ${row.date ?? "          "}  ${row.text}`;
}

function describe(row) {
  const parts = [line(row), `  tier ${row.tier} · domains ${row.domains.join(", ")}`];
  if (row.chosen) parts.push(`  chosen: ${row.chosen}\n  over: ${row.over}`);
  if (row.criterion) parts.push(`  criterion: ${row.criterion}`);
  if (row.if_then) parts.push(`  if-then: ${row.if_then}`);
  if (row.reasoning) parts.push(`  reasoning: ${row.reasoning}`);
  if (row.adversary?.ran) parts.push(`  adversary: ran ${row.adversary.at}`);
  if (row.links.supersedes) parts.push(`  supersedes: ${row.links.supersedes}`);
  if (row.links.related.length) parts.push(`  related: ${row.links.related.join(", ")}`);
  if (row.superseded_by) parts.push(`  superseded by: ${row.superseded_by}`);
  if (row.resolution) parts.push(`  resolved ${row.resolution.ts}: ${row.resolution.outcome} · Brier ${row.resolution.outcome_score ?? "n/a"} · process ${row.resolution.process_score} · stake ${row.resolution.stake_honored}`);
  if (row.release) parts.push(`  released ${row.release.ts}: ${row.release.reason}`);
  for (const r of row.reflections) parts.push(`  reflection ${r.ts}: ${r.text}`);
  return parts.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
