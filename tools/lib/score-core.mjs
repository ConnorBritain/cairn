// Every countable thing about the record. Pure functions over the event array.
// Each statistic carries its n and reports { insufficient: true, n } below MIN_N
// rather than a number a sample cannot support. No role computes any of this.
import { MIN_N } from "./defaults.mjs";
import { OUTCOME_VALUE, round } from "./schema.mjs";
import { annotateAll, indexEvents, lastReview } from "./status.mjs";

export const SCORED_KINDS = ["prediction", "choice", "commitment"];
export const BUCKETS = [[50, 59], [60, 69], [70, 79], [80, 89], [90, 100]];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stat = (xs, minN) => (xs.length >= minN ? { value: round(mean(xs)), n: xs.length } : { insufficient: true, n: xs.length });
const ratio = (num, den, minN) => (den >= minN ? { value: round(num / den), n: den } : { insufficient: true, n: den });

/** Fold a confidence/outcome pair so confidence is ≥ 50 (claim negated when below). */
export function fold(confidence, outcomeValue) {
  return confidence < 50 ? { p: 100 - confidence, o: 1 - outcomeValue } : { p: confidence, o: outcomeValue };
}

export function bucketOf(p) {
  return BUCKETS.find(([lo, hi]) => p >= lo && p <= hi) ?? null;
}

export function isoWeek(iso) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function applyFilters(rows, { domain, kind, since }) {
  let out = rows;
  if (domain) out = out.filter((r) => r.domains.includes(domain));
  if (kind) out = out.filter((r) => r.kind === kind);
  if (since) out = out.filter((r) => Date.parse(r.ts) >= Date.parse(since));
  return out;
}

/** Resolved, scored rows as { row, confidence, value } triples. */
function scoredRows(rows) {
  return rows
    .filter((r) => r.status === "resolved" && SCORED_KINDS.includes(r.kind) && r.confidence !== null && r.resolution.outcome_score !== null)
    .map((r) => ({ row: r, confidence: r.confidence, value: OUTCOME_VALUE[r.resolution.outcome], brier: r.resolution.outcome_score }));
}

export function calibration(scored, minN) {
  const buckets = BUCKETS.map(([lo, hi]) => ({ range: `${lo}–${hi}`, lo, hi, ps: [], os: [] }));
  for (const s of scored) {
    const { p, o } = fold(s.confidence, s.value);
    const b = buckets.find((x) => p >= x.lo && p <= x.hi);
    if (b) { b.ps.push(p); b.os.push(o); }
  }
  const out = buckets.map((b) => {
    const n = b.ps.length;
    const base = { range: b.range, lo: b.lo, hi: b.hi, n, mean_confidence: n ? round(mean(b.ps)) : null };
    if (n < minN) return { ...base, hit_rate: null, gap: null, insufficient: true };
    const hit = round(mean(b.os));
    return { ...base, hit_rate: hit, gap: round(hit - mean(b.ps) / 100) };
  });
  const usable = out.filter((b) => !b.insufficient);
  const total = usable.reduce((a, b) => a + b.n, 0);
  const expected_error = total >= minN
    ? { value: round(usable.reduce((a, b) => a + (b.n / total) * Math.abs(b.gap), 0)), n: total }
    : { insufficient: true, n: total };
  return { buckets: out, expected_error };
}

export function drift(rows, index, minN) {
  const review = lastReview(index);
  if (!review) return { insufficient: true, n: 0, reason: "no review recorded" };
  const since = rows.filter((r) => Date.parse(r.ts) > Date.parse(review.ts));
  if (!since.length) return { insufficient: true, n: 0, reason: "no entries since last review", review: review.id };
  const totalWeight = review.priorities.reduce((a, p) => a + p.weight, 0) || 1;
  const stated = Object.fromEntries(review.priorities.map((p) => [p.domain, p.weight / totalWeight]));
  const actual = {};
  const weeks = {};
  for (const r of since) {
    const share = 1 / r.domains.length;
    const week = isoWeek(r.ts);
    weeks[week] ||= { week, n: 0, shares: {} };
    weeks[week].n += 1;
    for (const d of r.domains) {
      actual[d] = (actual[d] || 0) + share / since.length;
      weeks[week].shares[d] = (weeks[week].shares[d] || 0) + share;
    }
  }
  const domains = [...new Set([...Object.keys(stated), ...Object.keys(actual)])].sort();
  const by_domain = Object.fromEntries(domains.map((d) => {
    const s = round(stated[d] || 0), a = round(actual[d] || 0);
    return [d, { stated: s, actual: a, delta: round(a - s) }];
  }));
  const total_variation = round(0.5 * domains.reduce((acc, d) => acc + Math.abs((stated[d] || 0) - (actual[d] || 0)), 0));
  const by_week = Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)).map((w) => ({
    week: w.week, n: w.n, shares: Object.fromEntries(Object.entries(w.shares).map(([d, v]) => [d, round(v / w.n)])),
  }));
  return { review: review.id, since: review.ts, n: since.length, insufficient: since.length < minN, total_variation, by_domain, by_week };
}

export function score(events, nowIso, { minN = MIN_N, domain, kind, since } = {}) {
  const index = indexEvents(events);
  const all = annotateAll(index, nowIso);
  const rows = applyFilters(all, { domain, kind, since });
  const scored = scoredRows(rows);
  const resolved = rows.filter((r) => r.status === "resolved");
  const released = rows.filter((r) => r.status === "released");
  const closable = rows.filter((r) => r.kind !== "note" || r.date !== null);
  const closed = closable.filter((r) => r.status === "resolved" || r.status === "released");

  const domains = [...new Set(rows.flatMap((r) => r.domains))].sort();
  const by_domain = Object.fromEntries(domains.map((d) => [d, stat(scored.filter((s) => s.row.domains.includes(d)).map((s) => s.brier), minN)]));
  const by_kind = Object.fromEntries(SCORED_KINDS.map((k) => [k, stat(scored.filter((s) => s.row.kind === k).map((s) => s.brier), minN)]));

  const resolutions = resolved.map((r) => r.resolution);
  const withStake = resolutions.filter((r) => r.stake_honored !== "n/a");

  return {
    now: nowIso,
    filters: { domain: domain ?? null, kind: kind ?? null, since: since ?? null },
    min_n: minN,
    n: {
      entries: rows.length,
      open: rows.filter((r) => r.status === "open").length,
      overdue: rows.filter((r) => r.status === "overdue").length,
      resolved: resolved.length,
      scored: scored.length,
      released: released.length,
      revised: rows.filter((r) => r.status === "superseded").length,
    },
    brier: { overall: stat(scored.map((s) => s.brier), minN), by_domain, by_kind },
    calibration: calibration(scored, minN),
    informativeness: stat(scored.map((s) => Math.abs(s.confidence - 50) / 50), minN),
    release_rate: ratio(closed.filter((r) => r.status === "released").length, closed.length, minN),
    revised_count: rows.filter((r) => r.status === "superseded").length,
    overdue_count: rows.filter((r) => r.status === "overdue").length,
    process: {
      mean: stat(resolutions.map((r) => r.process_score), minN),
      by_flag: {
        adversary: stat(resolutions.map((r) => Number(r.process?.adversary === true)), minN),
        criterion: stat(resolutions.map((r) => Number(r.process?.criterion === true)), minN),
        reasoning: stat(resolutions.map((r) => Number(r.process?.reasoning === true)), minN),
      },
    },
    stake: { honored_rate: ratio(withStake.filter((r) => r.stake_honored === "yes").length, withStake.length, minN) },
    drift: drift(all, index, minN),
  };
}

/** The short block the adversary receives for one domain. Nothing else. */
export function summary(events, nowIso, domain, options = {}) {
  const s = score(events, nowIso, { ...options, domain });
  return {
    domain,
    n: { resolved: s.n.resolved, scored: s.n.scored, overdue: s.n.overdue },
    brier: s.brier.overall,
    calibration: s.calibration.buckets.map(({ range, n, mean_confidence, hit_rate, gap, insufficient }) => ({ range, n, mean_confidence, hit_rate, gap, ...(insufficient ? { insufficient } : {}) })),
    informativeness: s.informativeness,
    overdue_count: s.overdue_count,
  };
}
