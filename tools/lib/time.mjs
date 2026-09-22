// Clock and date helpers. Every tool takes "now" from --now or CAIRN_NOW so tests and
// reviews are reproducible; nothing else reads the wall clock.
import { usage } from "./errors.mjs";

const DAY_MS = 86_400_000;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function nowIso(override, env = process.env) {
  const source = override || env.CAIRN_NOW;
  if (!source) return new Date().toISOString();
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) throw usage(`invalid timestamp: ${source}`);
  return date.toISOString();
}

export function isValidDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Last millisecond of a YYYY-MM-DD day in UTC, as ISO. */
export function endOfDayUtc(date) { return `${date}T23:59:59.999Z`; }

export function dateOf(iso) { return iso.slice(0, 10); }

/** Whole days from a to b (floor); negative when b is earlier. */
export function daysBetween(aIso, bIso) {
  return Math.floor((Date.parse(bIso) - Date.parse(aIso)) / DAY_MS);
}

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Compact YYYYMMDD from an ISO timestamp, for ids. */
export function compactDate(iso) { return iso.slice(0, 10).replaceAll("-", ""); }
