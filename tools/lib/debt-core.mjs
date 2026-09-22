// Decision debt: what is overdue, due this week, blocked, and when the last review was.
// The SessionStart hook prints debtLines(); the gate reads blocked. Pure.
import { withDefaults } from "./defaults.mjs";
import { canAdd } from "./gates-core.mjs";
import { annotateAll, indexEvents, isOpen, lastReview } from "./status.mjs";
import { dateOf, daysBetween } from "./time.mjs";

const DUE_WINDOW_DAYS = 7;
const calendarDays = (fromDate, toIso) => daysBetween(`${fromDate}T00:00:00Z`, `${dateOf(toIso)}T00:00:00Z`);

export function debt(events, nowIso, settings) {
  const { review_cadence_days: cadence } = withDefaults(settings);
  const index = indexEvents(events);
  const rows = annotateAll(index, nowIso);
  const brief = (r) => ({ id: r.id, kind: r.kind, tier: r.tier, date: r.date, text: r.text });

  const overdue = rows.filter((r) => r.status === "overdue")
    .map((r) => ({ ...brief(r), days_over: calendarDays(r.date, nowIso) }))
    .sort((a, b) => b.days_over - a.days_over || a.id.localeCompare(b.id));
  const due_this_week = rows.filter((r) => r.status === "open" && r.date !== null)
    .map((r) => ({ ...brief(r), days_left: calendarDays(dateOf(nowIso), `${r.date}T00:00:00Z`) }))
    .filter((r) => r.days_left >= 0 && r.days_left <= DUE_WINDOW_DAYS)
    .sort((a, b) => a.days_left - b.days_left || a.id.localeCompare(b.id));

  const settingsAll = withDefaults(settings);
  const full = canAdd({ tier: "full", kind: "prediction" }, events, nowIso, settingsAll);
  const quick = canAdd({ tier: "quick", kind: "prediction" }, events, nowIso, settingsAll);
  const review = lastReview(index);
  const last_review = review ? { id: review.id, at: review.ts, days_since: daysBetween(review.ts, nowIso) } : null;
  const review_due = review ? last_review.days_since >= cadence : rows.length > 0;

  return {
    now: nowIso,
    overdue,
    due_this_week,
    blocked: { full_tier_capture: !full.allowed, quick_capture: !quick.allowed, mode: settingsAll.overdue_gate, by: full.blocking },
    last_review,
    review_due,
    counts: { overdue: overdue.length, due_this_week: due_this_week.length, open: rows.filter((r) => isOpen(r.status)).length },
  };
}

/** At most two lines; empty when nothing is due. Exactly what the hook prints. */
export function debtLines(d) {
  const first = [];
  if (d.overdue.length) {
    const head = d.overdue[0];
    const more = d.overdue.length > 1 ? ` +${d.overdue.length - 1} more` : "";
    first.push(`${d.overdue.length} overdue (${head.id} due ${head.date}${more})`);
  }
  if (d.due_this_week.length) first.push(`${d.due_this_week.length} due this week`);
  if (d.blocked.quick_capture) first.push("capture blocked (strict)");
  else if (d.blocked.full_tier_capture) first.push("full-tier capture blocked");
  const lines = [];
  if (first.length) lines.push(`cairn: ${first.join(" · ")}`);
  if (first.length || d.review_due) {
    const when = d.last_review ? `last review ${d.last_review.days_since} day${d.last_review.days_since === 1 ? "" : "s"} ago` : "no review yet";
    lines.push(`cairn: ${when}${d.review_due ? " · review due" : ""}`);
  }
  return lines;
}
