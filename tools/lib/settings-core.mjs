// Settings as immutable revisions. Pure: validate, apply a change, undo. The store
// (settings-store.mjs) owns files and locks.
import { createHash } from "node:crypto";
import { DEFAULT_SETTINGS, OVERDUE_GATE_MODES } from "./defaults.mjs";
import { invalid } from "./errors.mjs";
import { DOMAIN_RE } from "./schema.mjs";

export const SETTINGS_SCHEMA = "cairn-settings/1";
export const FIELDS = ["bluntness", "domains", "review_cadence_days", "witnesses", "capture_hook", "overdue_gate"];

export function validateSettings(s) {
  const errors = [];
  if (!s || typeof s !== "object") return ["settings: object required"];
  if (s.schema !== SETTINGS_SCHEMA) errors.push(`schema: expected ${SETTINGS_SCHEMA}`);
  if (!Number.isInteger(s.revision) || s.revision < 1) errors.push("revision: positive integer");
  if (s.revision === 1 ? s.parent_digest !== null : !/^[a-f0-9]{64}$/.test(s.parent_digest || "")) errors.push("parent_digest: sha256 of the parent revision (null for revision 1)");
  if (!Number.isInteger(s.bluntness) || s.bluntness < 0 || s.bluntness > 3) errors.push("bluntness: integer 0–3");
  if (!Array.isArray(s.domains)) errors.push("domains: array of domain names");
  else for (const d of s.domains) if (!DOMAIN_RE.test(d)) errors.push(`domains: "${d}" must match ${DOMAIN_RE}`);
  if (!Number.isInteger(s.review_cadence_days) || s.review_cadence_days < 1 || s.review_cadence_days > 90) errors.push("review_cadence_days: integer 1–90");
  if (!Array.isArray(s.witnesses)) errors.push("witnesses: array of { name, note? }");
  else for (const w of s.witnesses) {
    if (!w || typeof w.name !== "string" || !w.name.trim()) errors.push("witnesses[].name: required");
    if (w.note !== undefined && w.note !== null && typeof w.note !== "string") errors.push("witnesses[].note: string");
  }
  if (typeof s.capture_hook !== "boolean") errors.push("capture_hook: true or false");
  if (!OVERDUE_GATE_MODES.includes(s.overdue_gate)) errors.push(`overdue_gate: ${OVERDUE_GATE_MODES.join(" or ")}`);
  return errors;
}

export function digestOf(s) {
  return createHash("sha256").update(JSON.stringify(canonical(s))).digest("hex");
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}

export function initSettings(ts) {
  return { schema: SETTINGS_SCHEMA, revision: 1, parent_digest: null, ts, note: "defaults", ...pick(DEFAULT_SETTINGS) };
}

/** Parse a CLI assignment "key=value" into a typed change. */
export function parseAssignment(text) {
  const eq = text.indexOf("=");
  if (eq <= 0) throw invalid(`expected key=value, got ${text}`);
  const key = text.slice(0, eq).trim();
  const raw = text.slice(eq + 1).trim();
  if (!FIELDS.includes(key)) throw invalid(`unknown setting ${key}; settable: ${FIELDS.join(", ")}`);
  switch (key) {
    case "bluntness":
    case "review_cadence_days": {
      if (!/^-?\d+$/.test(raw)) throw invalid(`${key}: integer required, got ${raw}`);
      return { key, value: Number(raw) };
    }
    case "capture_hook": {
      if (!["true", "false", "on", "off"].includes(raw)) throw invalid(`${key}: true or false, got ${raw}`);
      return { key, value: raw === "true" || raw === "on" };
    }
    case "overdue_gate": {
      if (!OVERDUE_GATE_MODES.includes(raw)) throw invalid(`${key}: ${OVERDUE_GATE_MODES.join(" or ")}, got ${raw}`);
      return { key, value: raw };
    }
    case "domains":
      return { key, value: raw === "" ? [] : raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean) };
    case "witnesses": {
      if (raw === "") return { key, value: [] };
      if (raw.startsWith("[")) { try { return { key, value: JSON.parse(raw) }; } catch (e) { throw invalid(`witnesses: invalid JSON (${e.message})`); } }
      return { key, value: raw.split(",").map((w) => { const [name, ...note] = w.split(":"); return { name: name.trim(), ...(note.length ? { note: note.join(":").trim() } : {}) }; }) };
    }
    default: throw invalid(`unknown setting ${key}`);
  }
}

/** Apply typed changes; returns the next revision and what changed. */
export function applySettings(current, changes, ts, note) {
  const next = { ...current, revision: current.revision + 1, parent_digest: digestOf(current), ts, note: note ?? null };
  const changed = [];
  for (const { key, value } of changes) {
    if (!FIELDS.includes(key)) throw invalid(`unknown setting ${key}`);
    if (JSON.stringify(current[key]) !== JSON.stringify(value)) changed.push({ key, from: current[key], to: value });
    next[key] = value;
  }
  const errors = validateSettings(next);
  if (errors.length) throw invalid(`invalid settings: ${errors.join("; ")}`, { errors });
  if (!changed.length) throw invalid("no change: every value equals the current setting");
  if (!next.note) next.note = changed.map((c) => `${c.key}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join("; ");
  return { settings: next, changed };
}

/** Undo as a new revision equal to the parent's values. Nothing is deleted. */
export function undoSettings(current, parent, ts) {
  if (digestOf(parent) !== current.parent_digest) throw invalid("undo: parent revision digest does not match; history is inconsistent");
  return { ...pick(parent), schema: SETTINGS_SCHEMA, revision: current.revision + 1, parent_digest: digestOf(current), ts, note: `undo of revision ${current.revision} (back to revision ${parent.revision})` };
}

export function pick(s) { return Object.fromEntries(FIELDS.map((k) => [k, s[k]])); }

/** What differs between two revisions, for history. */
export function diffSettings(a, b) {
  return FIELDS.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => ({ key: k, from: a[k], to: b[k] }));
}
