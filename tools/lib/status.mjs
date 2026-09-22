// Derived status. Entry lines never change; everything here is computed from later
// events and the clock. Precedence: superseded > resolved > released > overdue > open.
import { DATE_KEY } from "./schema.mjs";
import { endOfDayUtc } from "./time.mjs";

export const STATUSES = ["open", "overdue", "resolved", "released", "superseded"];

/** Index the event stream once; every derived view reads from this. */
export function indexEvents(events) {
  const index = {
    entries: new Map(),
    order: [],
    resolutions: new Map(),
    releases: new Map(),
    reflections: new Map(),
    supersededBy: new Map(),
    reviews: [],
  };
  for (const e of events) {
    switch (e.event) {
      case "entry":
        index.entries.set(e.id, e);
        index.order.push(e.id);
        if (e.links?.supersedes) index.supersededBy.set(e.links.supersedes, e.id);
        break;
      case "resolution": index.resolutions.set(e.entry, e); break;
      case "release": index.releases.set(e.entry, e); break;
      case "reflection": (index.reflections.get(e.entry) || index.reflections.set(e.entry, []).get(e.entry)).push(e); break;
      case "review": index.reviews.push(e); break;
      default: break;
    }
  }
  return index;
}

export function dateOf(entry) { return entry.dates?.[DATE_KEY[entry.kind]] ?? null; }

export function isPastDue(entry, nowIso) {
  const date = dateOf(entry);
  return date !== null && Date.parse(nowIso) > Date.parse(endOfDayUtc(date));
}

export function statusOf(entry, index, nowIso) {
  if (index.supersededBy.has(entry.id)) return "superseded";
  if (index.resolutions.has(entry.id)) return "resolved";
  if (index.releases.has(entry.id)) return "released";
  if (isPastDue(entry, nowIso)) return "overdue";
  return "open";
}

export function isOpen(status) { return status === "open" || status === "overdue"; }

/** The entry plus everything derived about it. */
export function annotate(entry, index, nowIso) {
  return {
    ...entry,
    status: statusOf(entry, index, nowIso),
    date: dateOf(entry),
    resolution: index.resolutions.get(entry.id) ?? null,
    release: index.releases.get(entry.id) ?? null,
    reflections: index.reflections.get(entry.id) ?? [],
    superseded_by: index.supersededBy.get(entry.id) ?? null,
  };
}

export function annotateAll(index, nowIso) {
  return index.order.map((id) => annotate(index.entries.get(id), index, nowIso));
}

export function lastReview(index) {
  return index.reviews.length ? index.reviews[index.reviews.length - 1] : null;
}
