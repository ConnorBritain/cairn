// Ledger operations as pure functions over the event array. Each mutating function
// returns the event to append; the CLI appends it. Nothing here touches disk.
import { CairnError, invalid } from "./errors.mjs";
import { canAdd, canCloseReview, canRelease } from "./gates-core.mjs";
import { DOMAIN_RE, EVENT_LETTER, FORCED_CHOICES, ID_RE, OUTCOMES, STAKE, brier, buildEntry, newId, processOf } from "./schema.mjs";
import { annotate, annotateAll, indexEvents, isOpen, lastReview, statusOf } from "./status.mjs";

// The gates are the rules; the ledger asks them before every write. There is no --force.
const gates = { canAdd, canRelease };

function requireEntry(index, id) {
  const entry = index.entries.get(id);
  if (!entry) throw invalid(`no entry ${id}`);
  return entry;
}

function requireOpen(index, id, nowIso, verb) {
  const entry = requireEntry(index, id);
  const status = statusOf(entry, index, nowIso);
  if (!isOpen(status)) throw invalid(`cannot ${verb} ${id}: it is ${status}`);
  return entry;
}

export function addEntry(events, input, { ts, settings }) {
  const index = indexEvents(events);
  const { entry, notices } = buildEntry(input, { ts });
  for (const id of entry.links.related) requireEntry(index, id);
  if (entry.links.supersedes) requireOpen(index, entry.links.supersedes, ts, "supersede");
  const verdict = gates.canAdd(entry, events, ts, settings);
  if (!verdict.allowed) throw new CairnError("gate", verdict.reasons.join("; "), verdict);
  return { event: entry, notices };
}

export function resolveEntry(events, { id, outcome, stakeHonored, reflection, ts }) {
  const index = indexEvents(events);
  const entry = requireOpen(index, id, ts, "resolve");
  const labels = OUTCOMES[entry.kind];
  if (!labels.includes(outcome)) throw invalid(`outcome for a ${entry.kind} must be one of ${labels.join(", ")}`);
  let stake = stakeHonored;
  if (entry.if_then) {
    if (!["yes", "no"].includes(stake)) throw invalid(`stake-honored yes|no required: this entry has an if-then (${entry.if_then})`);
  } else {
    if (stake && stake !== "n/a") throw invalid("stake-honored must be n/a: this entry has no if-then");
    stake = "n/a";
  }
  if (!STAKE.includes(stake)) throw invalid("stake-honored must be yes, no or n/a");
  const process = processOf(entry);
  return {
    event: "resolution",
    id: newId(EVENT_LETTER.resolution, ts),
    ts,
    entry: id,
    outcome,
    outcome_score: brier(entry.confidence, outcome),
    criterion_met: entry.kind === "choice" ? outcome : null,
    process_score: process.score,
    process: process.flags,
    stake_honored: stake,
    reflection: reflection && reflection.trim() ? reflection.trim() : null,
  };
}

export function releaseEntry(events, { id, reason, ts }) {
  const index = indexEvents(events);
  const entry = requireOpen(index, id, ts, "release");
  const verdict = gates.canRelease(entry, reason, events, ts);
  if (!verdict.allowed) throw new CairnError("gate", verdict.reasons.join("; "), verdict);
  return { event: "release", id: newId(EVENT_LETTER.release, ts), ts, entry: id, reason: reason.trim() };
}

export function reflectEntry(events, { id, text, ts }) {
  const index = indexEvents(events);
  requireEntry(index, id);
  if (!text || !text.trim()) throw invalid("reflection text required");
  return { event: "reflection", id: newId(EVENT_LETTER.reflection, ts), ts, entry: id, text: text.trim() };
}

/**
 * Close a review. The gate decides; the event records the period, the forced choice
 * made for each item, the resolutions inside the period, and the stated priorities
 * that drift is measured against until the next review.
 */
export function reviewEntry(events, { review, ts, settings }) {
  if (!review || typeof review !== "object") throw invalid("review: object required");
  const index = indexEvents(events);
  const previous = lastReview(index);
  const firstEntry = index.order.length ? index.entries.get(index.order[0]) : null;
  const from = review.period?.from || previous?.ts || firstEntry?.ts || ts;
  const to = review.period?.to || ts;
  if (Date.parse(to) < Date.parse(from)) throw invalid("review.period: to is before from");

  const choices = Array.isArray(review.choices) ? review.choices : [];
  for (const c of choices) {
    if (!c || !ID_RE.test(c.entry || "")) throw invalid("review.choices[].entry: entry id required");
    if (!FORCED_CHOICES.includes(c.action)) throw invalid(`review.choices[].action: one of ${FORCED_CHOICES.join(", ")}`);
    if (!ID_RE.test(c.result || "")) throw invalid("review.choices[].result: id of the superseding entry or the release required");
  }
  const priorities = Array.isArray(review.priorities) ? review.priorities : [];
  if (!priorities.length) throw invalid("review.priorities: at least one { domain, weight } required; drift is measured against them");
  for (const p of priorities) {
    if (!p || !DOMAIN_RE.test(p.domain || "")) throw invalid(`review.priorities[].domain: invalid (${p?.domain})`);
    if (!Number.isInteger(p.weight) || p.weight < 0) throw invalid(`review.priorities[].weight: non-negative integer (${p?.domain})`);
  }
  if (!priorities.some((p) => p.weight > 0)) throw invalid("review.priorities: at least one weight must be above zero");

  const verdict = canCloseReview({ period: { from, to }, choices }, events, ts, settings);
  if (!verdict.allowed) throw new CairnError("gate", verdict.reasons.join("; "), verdict);

  const inPeriod = (e) => (previous ? Date.parse(e.ts) > Date.parse(from) : Date.parse(e.ts) >= Date.parse(from)) && Date.parse(e.ts) <= Date.parse(to);
  const resolved = events.filter((e) => e.event === "resolution" && inPeriod(e)).map((e) => e.id);
  return {
    event: "review",
    id: newId(EVENT_LETTER.review, ts),
    ts,
    period: { from, to },
    choices: choices.map((c) => ({ entry: c.entry, action: c.action, result: c.result })),
    priorities: priorities.map((p) => ({ domain: p.domain, weight: p.weight })),
    resolved,
    notes: typeof review.notes === "string" && review.notes.trim() ? review.notes.trim() : null,
  };
}

export function listEntries(events, { status, kind, domain, now }) {
  let rows = annotateAll(indexEvents(events), now);
  if (status) rows = rows.filter((r) => r.status === status);
  if (kind) rows = rows.filter((r) => r.kind === kind);
  if (domain) rows = rows.filter((r) => r.domains.includes(domain));
  return rows;
}

export function showEntry(events, id, now) {
  const index = indexEvents(events);
  return annotate(requireEntry(index, id), index, now);
}

const STOP = new Set(["the", "and", "that", "this", "with", "will", "from", "have", "over", "into", "than", "then", "them", "they", "there", "their", "about", "before", "after", "would", "could", "should"]);
function words(text) {
  return new Set(String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)));
}

/** Resolved entries most like a draft: shared domains, then shared words, then recency. */
export function relatedEntries(events, { domain, domains, kind, text, limit = 5, now }) {
  const wanted = new Set([...(domains || []), ...(domain ? [domain] : [])]);
  const draftWords = words(text);
  const rows = annotateAll(indexEvents(events), now).filter((r) => r.status === "resolved");
  const scored = rows.map((r) => {
    const sharedDomains = r.domains.filter((d) => wanted.has(d)).length;
    const rowWords = words(`${r.text} ${r.criterion || ""} ${r.chosen || ""} ${r.over || ""}`);
    let sharedWords = 0;
    for (const w of draftWords) if (rowWords.has(w)) sharedWords += 1;
    const kindBonus = kind && r.kind === kind ? 1 : 0;
    return { row: r, score: sharedDomains * 4 + sharedWords + kindBonus };
  }).filter((s) => s.score > 0 || (!wanted.size && !draftWords.size));
  scored.sort((a, b) => b.score - a.score || b.row.ts.localeCompare(a.row.ts));
  return scored.slice(0, Math.max(0, limit)).map((s) => s.row);
}
