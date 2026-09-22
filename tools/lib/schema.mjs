// The ledger schema: event shapes, per-kind required fields, tier validation, ids.
// Anything a skill needs to know about "what fields does a choice need" comes from
// here; skills/cairn/references/kinds.md mirrors these tables and a test keeps them equal.
import { randomBytes } from "node:crypto";
import { invalid } from "./errors.mjs";
import { compactDate, isValidDate, isValidIso } from "./time.mjs";

export const SCHEMA = "cairn-ledger/1";
export const KINDS = ["prediction", "choice", "commitment", "note"];
export const TIERS = ["quick", "full"];
export const EVENTS = ["entry", "resolution", "release", "reflection", "review"];
export const KIND_LETTER = { prediction: "p", choice: "c", commitment: "m", note: "n" };
export const EVENT_LETTER = { resolution: "r", release: "l", reflection: "f", review: "v" };
export const DATE_KEY = { prediction: "resolve_by", choice: "review_by", commitment: "due_by", note: "resolve_by" };

/** Quick tier: what a kind cannot be captured without. */
export const REQUIRED = {
  prediction: ["text", "confidence", "criterion", "dates.resolve_by"],
  choice: ["chosen", "over", "confidence", "criterion", "dates.review_by"],
  commitment: ["text", "dates.due_by"],
  note: ["text"],
};

/** Full tier: what makes an entry full. Notes are always quick. */
export const FULL_REQUIRED = {
  prediction: ["reasoning", "adversary.ran"],
  choice: ["if_then", "reasoning", "adversary.ran"],
  commitment: ["criterion", "if_then", "reasoning", "adversary.ran"],
  note: [],
};

export const OUTCOMES = {
  prediction: ["true", "false"],
  choice: ["yes", "partial", "no"],
  commitment: ["kept", "missed"],
  note: ["true", "false"],
};
export const OUTCOME_VALUE = { true: 1, false: 0, yes: 1, partial: 0.5, no: 0, kept: 1, missed: 0 };
export const STAKE = ["yes", "no", "n/a"];
export const ADVERSARY_FIELDS = ["other_side", "failure_conditions", "base_rate_question", "record_question"];
export const FORCED_CHOICES = ["recommit", "adjust", "release"];

export const ID_RE = /^[pcmnrlfv]-\d{8}-[0-9a-z]{4}$/;
export const DOMAIN_RE = /^[a-z0-9-]{1,32}$/;

export function newId(letter, ts, random = randomSuffix) {
  return `${letter}-${compactDate(ts)}-${random()}`;
}
function randomSuffix() {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(4);
  let out = "";
  for (const b of bytes) out += alphabet[b % 36];
  return out;
}

const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const present = (obj, path) => {
  const v = get(obj, path);
  if (path.endsWith(".ran")) return v === true;
  return typeof v === "number" ? true : nonEmpty(v);
};

/**
 * Build a complete entry from user input. Returns { entry, notices }.
 * Throws CairnError("invalid") with a list of field messages when the input cannot
 * become a valid entry. Tier is derived/validated, never trusted.
 */
export function buildEntry(input, { ts, id } = {}) {
  const errors = [];
  const notices = [];
  const kind = input.kind;
  if (!KINDS.includes(kind)) throw invalid(`kind: must be one of ${KINDS.join(", ")}`, { errors: ["kind"] });
  if (input.id && !id) errors.push("id: entries are immutable; add a new entry with --supersedes <id>");

  const entry = {
    event: "entry",
    id: id || newId(KIND_LETTER[kind], ts),
    ts,
    kind,
    tier: undefined,
    domains: normalizeDomains(input.domains, kind, errors),
    text: typeof input.text === "string" ? input.text.trim() : "",
    confidence: normalizeConfidence(input.confidence, errors),
    criterion: str(input.criterion),
    dates: normalizeDates(input.dates, kind, errors),
    reasoning: str(input.reasoning),
    if_then: str(input.if_then),
    chosen: str(input.chosen),
    over: str(input.over),
    adversary: normalizeAdversary(input.adversary, errors),
    links: normalizeLinks(input.links, errors),
  };

  if (kind === "choice" && !entry.text && entry.chosen && entry.over) entry.text = `${entry.chosen} over ${entry.over}`;
  if (kind === "commitment" && entry.confidence === null && input.tier !== "full") {
    entry.confidence = 100;
    notices.push("confidence defaulted to 100 for a quick commitment");
  }

  for (const path of REQUIRED[kind]) if (!present(entry, path)) errors.push(`${path}: required for a ${kind}`);

  const missingFull = FULL_REQUIRED[kind].filter((p) => !present(entry, p));
  const requested = input.tier;
  if (requested && !TIERS.includes(requested)) errors.push(`tier: must be quick or full`);
  if (kind === "note") {
    if (requested === "full") errors.push("tier: notes are always quick");
    if (entry.adversary.ran) errors.push("adversary: notes do not take an adversary pass");
    entry.tier = "quick";
  } else if (requested === "full") {
    if (missingFull.length) errors.push(`tier: full requires ${missingFull.join(", ")}`);
    if (kind === "commitment" && input.confidence === undefined) errors.push("confidence: required for a full commitment");
    entry.tier = "full";
  } else if (entry.adversary.ran) {
    if (missingFull.length) errors.push(`adversary: pass recorded but full tier also requires ${missingFull.join(", ")}`);
    else notices.push("adversary pass recorded: entry promoted to full tier");
    entry.tier = "full";
  } else {
    entry.tier = "quick";
  }

  if (errors.length) throw invalid(`invalid ${kind}: ${errors.join("; ")}`, { errors });
  return { entry, notices };
}

function str(v) { return nonEmpty(v) ? v.trim() : null; }

function normalizeDomains(value, kind, errors) {
  let list = Array.isArray(value) ? value : nonEmpty(value) ? [value] : [];
  list = [...new Set(list.map((d) => String(d).trim().toLowerCase()).filter(Boolean))];
  if (!list.length) {
    if (kind === "note") return ["general"];
    errors.push("domains: at least one domain tag is required");
    return [];
  }
  for (const d of list) if (!DOMAIN_RE.test(d)) errors.push(`domains: "${d}" must match ${DOMAIN_RE}`);
  return list;
}

function normalizeConfidence(value, errors) {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/%$/, ""));
  if (!Number.isInteger(n) || n < 0 || n > 100) { errors.push("confidence: integer 0–100"); return null; }
  return n;
}

function normalizeDates(value, kind, errors) {
  const dates = {};
  const source = value && typeof value === "object" ? value : {};
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined || v === null || v === "") continue;
    if (!["resolve_by", "review_by", "due_by"].includes(k)) { errors.push(`dates.${k}: unknown date key`); continue; }
    if (!isValidDate(v)) { errors.push(`dates.${k}: YYYY-MM-DD required, got ${v}`); continue; }
    dates[k] = v;
  }
  const key = DATE_KEY[kind];
  for (const k of Object.keys(dates)) if (k !== key) errors.push(`dates.${k}: a ${kind} uses ${key}`);
  return dates;
}

function normalizeAdversary(value, errors) {
  if (!value || typeof value !== "object") return { ran: false };
  if (value.ran !== true) return { ran: false };
  const out = { ran: true, at: value.at };
  if (!isValidIso(value.at)) errors.push("adversary.at: ISO timestamp required when ran is true");
  for (const f of ADVERSARY_FIELDS) {
    if (!nonEmpty(value[f])) errors.push(`adversary.${f}: required when ran is true`);
    out[f] = str(value[f]);
  }
  return out;
}

function normalizeLinks(value, errors) {
  const source = value && typeof value === "object" ? value : {};
  const related = [...new Set((Array.isArray(source.related) ? source.related : []).map(String))];
  for (const id of related) if (!ID_RE.test(id)) errors.push(`links.related: "${id}" is not an entry id`);
  const supersedes = nonEmpty(source.supersedes) ? source.supersedes.trim() : null;
  if (supersedes && !ID_RE.test(supersedes)) errors.push(`links.supersedes: "${supersedes}" is not an entry id`);
  return { related, supersedes };
}

/** Structural validation of any event line already in (or about to enter) the ledger. */
export function validateEvent(event) {
  const errors = [];
  if (!event || typeof event !== "object") return ["event: must be an object"];
  if (!EVENTS.includes(event.event)) errors.push(`event: must be one of ${EVENTS.join(", ")}`);
  if (!ID_RE.test(event.id || "")) errors.push("id: malformed");
  if (!isValidIso(event.ts)) errors.push("ts: ISO timestamp required");
  switch (event.event) {
    case "entry": {
      if (!KINDS.includes(event.kind)) errors.push("kind: unknown");
      else {
        if (!TIERS.includes(event.tier)) errors.push("tier: unknown");
        for (const p of REQUIRED[event.kind]) if (!present(event, p)) errors.push(`${p}: required`);
        if (event.tier === "full") for (const p of FULL_REQUIRED[event.kind]) if (!present(event, p)) errors.push(`${p}: required for full tier`);
        if (!Array.isArray(event.domains) || !event.domains.length) errors.push("domains: required");
      }
      break;
    }
    case "resolution": {
      if (!ID_RE.test(event.entry || "")) errors.push("entry: malformed id");
      if (!(event.outcome in OUTCOME_VALUE)) errors.push("outcome: unknown label");
      if (event.outcome_score !== null && typeof event.outcome_score !== "number") errors.push("outcome_score: number or null");
      if (typeof event.process_score !== "number") errors.push("process_score: number");
      if (!STAKE.includes(event.stake_honored)) errors.push("stake_honored: yes, no or n/a");
      break;
    }
    case "release": {
      if (!ID_RE.test(event.entry || "")) errors.push("entry: malformed id");
      if (!nonEmpty(event.reason)) errors.push("reason: required");
      break;
    }
    case "reflection": {
      if (!ID_RE.test(event.entry || "")) errors.push("entry: malformed id");
      if (!nonEmpty(event.text)) errors.push("text: required");
      break;
    }
    case "review": {
      if (!event.period || !isValidIso(event.period.from) || !isValidIso(event.period.to)) errors.push("period: from/to ISO required");
      if (!Array.isArray(event.choices)) errors.push("choices: array required");
      else for (const c of event.choices) {
        if (!ID_RE.test(c?.entry || "")) errors.push("choices[].entry: malformed id");
        if (!FORCED_CHOICES.includes(c?.action)) errors.push(`choices[].action: one of ${FORCED_CHOICES.join(", ")}`);
        if (!ID_RE.test(c?.result || "")) errors.push("choices[].result: malformed id");
      }
      if (!Array.isArray(event.priorities) || !event.priorities.length) errors.push("priorities: at least one { domain, weight }");
      else for (const p of event.priorities) {
        if (!DOMAIN_RE.test(p?.domain || "")) errors.push("priorities[].domain: invalid");
        if (!Number.isInteger(p?.weight) || p.weight < 0) errors.push("priorities[].weight: non-negative integer");
      }
      break;
    }
    default: break;
  }
  return errors;
}

/** Process flags and score, computed from the entry alone. */
export function processOf(entry) {
  const flags = { adversary: entry.adversary?.ran === true, criterion: nonEmpty(entry.criterion), reasoning: nonEmpty(entry.reasoning) };
  const score = (Number(flags.adversary) + Number(flags.criterion) + Number(flags.reasoning)) / 3;
  return { flags, score: round(score) };
}

/** Brier for one entry/outcome pair; null when the entry has no confidence. */
export function brier(confidence, outcome) {
  if (confidence === null || confidence === undefined) return null;
  const o = OUTCOME_VALUE[outcome];
  return round((confidence / 100 - o) ** 2);
}

export function round(n, places = 4) { return Math.round(n * 10 ** places) / 10 ** places; }
