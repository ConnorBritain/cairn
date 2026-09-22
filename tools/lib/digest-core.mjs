// The review packet: the only thing the reviewer role reads. Labels only, no prose, so
// the reviewer can only say what the record supports. Pure.
import { reviewScope } from "./gates-core.mjs";
import { score } from "./score-core.mjs";
import { annotateAll, indexEvents, lastReview } from "./status.mjs";

export function digest(events, nowIso, settings, { minN } = {}) {
  const index = indexEvents(events);
  const rows = annotateAll(index, nowIso);
  const review = lastReview(index);
  const first_review = !review;
  const from = review ? review.ts : (rows[0]?.ts ?? nowIso);
  const after = (ts) => (first_review ? Date.parse(ts) >= Date.parse(from) : Date.parse(ts) > Date.parse(from));

  const resolved = rows.filter((r) => r.status === "resolved" && after(r.resolution.ts)).map((r) => ({
    id: r.id, kind: r.kind, tier: r.tier, domains: r.domains, confidence: r.confidence, text: r.text, criterion: r.criterion,
    outcome: r.resolution.outcome, outcome_score: r.resolution.outcome_score, process_score: r.resolution.process_score,
    stake_honored: r.resolution.stake_honored, resolved_at: r.resolution.ts,
  }));
  const released = rows.filter((r) => r.status === "released" && after(r.release.ts)).map((r) => ({
    id: r.id, kind: r.kind, domains: r.domains, text: r.text, reason: r.release.reason, released_at: r.release.ts,
  }));
  const overdue = rows.filter((r) => r.status === "overdue").map((r) => ({
    id: r.id, kind: r.kind, tier: r.tier, domains: r.domains, date: r.date, confidence: r.confidence, text: r.text,
  }));
  const open_in_scope = reviewScope(events, nowIso, settings).map((r) => ({
    id: r.id, kind: r.kind, tier: r.tier, domains: r.domains, status: r.status, date: r.date, confidence: r.confidence, text: r.text, criterion: r.criterion, if_then: r.if_then,
  }));
  const scores = score(events, nowIso, { minN });

  return {
    period: { from, to: nowIso, first_review },
    resolved, released, overdue, open_in_scope,
    scores, drift: scores.drift,
    priorities_stated: review ? review.priorities : [],
  };
}

/** Fixed vocabulary of the markdown form. A test asserts nothing else appears. */
export const LABELS = {
  title: "Cairn digest", period: "Period", first: "first review", resolved: "Resolved since last review", released: "Released since last review",
  overdue: "Overdue", scope: "Open items requiring a forced choice", scores: "Scores", drift: "Drift", priorities: "Stated priorities",
  brier: "Brier", process: "process", stake: "stake", informativeness: "informativeness", release: "release rate", overdueCount: "overdue count",
  calibration: "calibration", said: "said", hit: "hit", gap: "gap", n: "n", insufficient: "insufficient", none: "none", due: "due",
  reason: "reason", stated: "stated", actual: "actual", delta: "delta", week: "week", variation: "total variation", since: "since",
  revised: "revised", criterion: "criterion", ifThen: "if-then", by: "by", kind: "kind", domain: "domain", tier: "tier", confidence: "confidence",
  entries: "entries", scored: "scored", open: "open", from: "from", to: "to",
};

const pct = (v) => `${Math.round(v * 100)}%`;
const stat = (s, asPct = false) => (s.insufficient ? `${LABELS.insufficient} (${LABELS.n}=${s.n})` : `${asPct ? pct(s.value) : s.value.toFixed(3)} (${LABELS.n}=${s.n})`);
const conf = (c) => (c === null ? "—" : `${c}%`);

export function renderDigest(d) {
  const L = LABELS;
  const out = [`# ${L.title}`, "", `${L.period}: ${d.period.from} ${L.to} ${d.period.to}${d.period.first_review ? ` (${L.first})` : ""}`, ""];
  out.push(`## ${L.resolved}`);
  out.push(...(d.resolved.length ? d.resolved.map((r) => `- ${r.id} · ${r.kind} · ${conf(r.confidence)} · ${r.outcome} · ${L.brier} ${r.outcome_score ?? "—"} · ${L.process} ${r.process_score} · ${L.stake} ${r.stake_honored} · ${r.domains.join(", ")} — ${r.text}`) : [`- ${L.none}`]), "");
  out.push(`## ${L.released}`);
  out.push(...(d.released.length ? d.released.map((r) => `- ${r.id} · ${r.kind} · ${r.domains.join(", ")} — ${r.text} · ${L.reason}: ${r.reason}`) : [`- ${L.none}`]), "");
  out.push(`## ${L.overdue}`);
  out.push(...(d.overdue.length ? d.overdue.map((r) => `- ${r.id} · ${r.kind} · ${r.tier} · ${conf(r.confidence)} · ${L.due} ${r.date} · ${r.domains.join(", ")} — ${r.text}`) : [`- ${L.none}`]), "");
  out.push(`## ${L.scope}`);
  out.push(...(d.open_in_scope.length ? d.open_in_scope.map((r) => `- ${r.id} · ${r.kind} · ${r.tier} · ${r.status} · ${conf(r.confidence)} · ${L.due} ${r.date} · ${r.domains.join(", ")} — ${r.text}${r.criterion ? ` · ${L.criterion}: ${r.criterion}` : ""}${r.if_then ? ` · ${L.ifThen}: ${r.if_then}` : ""}`) : [`- ${L.none}`]), "");
  const s = d.scores;
  out.push(`## ${L.scores}`);
  out.push(`- ${L.entries} ${s.n.entries} · ${L.open} ${s.n.open} · ${L.overdueCount} ${s.overdue_count} · ${L.scored} ${s.n.scored} · ${L.revised} ${s.revised_count}`);
  out.push(`- ${L.brier} ${stat(s.brier.overall)}`);
  for (const [dom, v] of Object.entries(s.brier.by_domain)) if (v.n) out.push(`- ${L.brier} ${L.by} ${L.domain} ${dom} ${stat(v)}`);
  for (const [k, v] of Object.entries(s.brier.by_kind)) if (v.n) out.push(`- ${L.brier} ${L.by} ${L.kind} ${k} ${stat(v)}`);
  for (const b of s.calibration.buckets) if (b.n) out.push(`- ${L.calibration} ${b.range} ${L.n}=${b.n} ${L.said} ${b.mean_confidence}% ${b.insufficient ? L.insufficient : `${L.hit} ${pct(b.hit_rate)} ${L.gap} ${b.gap >= 0 ? "+" : ""}${b.gap.toFixed(2)}`}`);
  out.push(`- ${L.informativeness} ${stat(s.informativeness)}`);
  out.push(`- ${L.release} ${stat(s.release_rate, true)}`);
  out.push(`- ${L.process} ${stat(s.process.mean)}`);
  out.push(`- ${L.stake} ${stat(s.stake.honored_rate, true)}`, "");
  out.push(`## ${L.drift}`);
  if (d.drift.reason) out.push(`- ${L.insufficient}: ${d.drift.reason}`);
  else {
    out.push(`- ${L.since} ${d.drift.review} · ${L.n}=${d.drift.n}${d.drift.insufficient ? ` (${L.insufficient})` : ""} · ${L.variation} ${d.drift.total_variation.toFixed(2)}`);
    for (const [dom, v] of Object.entries(d.drift.by_domain)) out.push(`- ${dom}: ${L.stated} ${pct(v.stated)} ${L.actual} ${pct(v.actual)} ${L.delta} ${v.delta >= 0 ? "+" : ""}${pct(v.delta)}`);
    for (const w of d.drift.by_week) out.push(`- ${L.week} ${w.week} ${L.n}=${w.n}: ${Object.entries(w.shares).map(([dom, v]) => `${dom} ${pct(v)}`).join(", ")}`);
  }
  out.push("", `## ${L.priorities}`);
  out.push(...(d.priorities_stated.length ? d.priorities_stated.map((p) => `- ${p.domain}: ${p.weight}`) : [`- ${L.none}`]), "");
  return out.join("\n");
}
