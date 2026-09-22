// The three gates as pure functions. Every verdict is { allowed, reasons, blocking } so a
// skill can show `reasons` verbatim and a CLI can exit 3 on refusal. Pressure comes from
// these mechanisms, never from tone.
import { withDefaults } from "./defaults.mjs";
import { FORCED_CHOICES } from "./schema.mjs";
import { annotateAll, indexEvents, isOpen } from "./status.mjs";
import { addDays, dateOf, endOfDayUtc } from "./time.mjs";

const ALLOW = () => ({ allowed: true, reasons: [], blocking: [] });
const REFUSE = (reasons, blocking) => ({ allowed: false, reasons, blocking });

/**
 * Overdue gate. A full-tier entry is refused while any full-tier entry is overdue.
 * Quick-tier entries of any kind, and notes, always pass.
 */
export function canAdd(draft, events, nowIso) {
  if (!draft || draft.tier !== "full") return ALLOW();
  const overdue = annotateAll(indexEvents(events), nowIso).filter((r) => r.status === "overdue" && r.tier === "full");
  if (!overdue.length) return ALLOW();
  const ids = overdue.map((r) => r.id);
  const noun = ids.length === 1 ? "entry is" : "entries are";
  return REFUSE(
    [`full-tier capture blocked: ${ids.length} full-tier ${noun} overdue (${ids.join(", ")}). Resolve, release, or capture at quick tier.`],
    ids,
  );
}

/** Release gate. A release needs a non-empty reason and an open entry. */
export function canRelease(entry, reason, events, nowIso) {
  const reasons = [];
  if (!entry) return REFUSE(["no such entry"], []);
  if (events && nowIso) {
    const row = annotateAll(indexEvents(events), nowIso).find((r) => r.id === entry.id);
    if (row && !isOpen(row.status)) reasons.push(`cannot release ${entry.id}: it is ${row.status}`);
  }
  if (typeof reason !== "string" || !reason.trim()) reasons.push("release requires a stated reason");
  return reasons.length ? REFUSE(reasons, [entry.id]) : ALLOW();
}

/**
 * The set of open entries a review must decide on: overdue, or due before the next
 * review (period end + cadence), plus anything the review lists explicitly.
 */
export function reviewScope(events, nowIso, settings, review = {}) {
  const { review_cadence_days: cadence } = withDefaults(settings);
  const periodEnd = review.period?.to || nowIso;
  const horizon = endOfDayUtc(addDays(dateOf(periodEnd), cadence));
  const listed = new Set((review.choices || []).map((c) => c.entry));
  return annotateAll(indexEvents(events), nowIso).filter((r) => {
    if (!isOpen(r.status)) return false;
    if (listed.has(r.id)) return true;
    if (r.status === "overdue") return true;
    return r.date !== null && Date.parse(endOfDayUtc(r.date)) <= Date.parse(horizon);
  });
}

/**
 * Review gate. Refused while any in-scope item is still open (not recommitted, adjusted
 * or released), or while a listed choice does not match the record.
 */
export function canCloseReview(review, events, nowIso, settings) {
  const index = indexEvents(events);
  const scope = reviewScope(events, nowIso, settings, review);
  const stillOpen = scope.filter((r) => isOpen(r.status)).map((r) => r.id);
  const reasons = [];
  if (stillOpen.length) {
    reasons.push(`review cannot close: ${stillOpen.length} open item${stillOpen.length === 1 ? "" : "s"} without a forced choice (${stillOpen.join(", ")}). Recommit, adjust, or release each one.`);
  }
  for (const choice of review.choices || []) {
    if (!FORCED_CHOICES.includes(choice.action)) { reasons.push(`choice for ${choice.entry}: unknown action ${choice.action}`); continue; }
    if (choice.action === "release") {
      const rel = index.releases.get(choice.entry);
      if (!rel || rel.id !== choice.result) reasons.push(`choice for ${choice.entry}: release ${choice.result} not found in the ledger`);
    } else {
      const sup = index.entries.get(choice.result);
      if (!sup || sup.links?.supersedes !== choice.entry) reasons.push(`choice for ${choice.entry}: ${choice.action} must point at an entry that supersedes it (${choice.result} does not)`);
    }
  }
  return reasons.length ? REFUSE(reasons, stillOpen) : ALLOW();
}
