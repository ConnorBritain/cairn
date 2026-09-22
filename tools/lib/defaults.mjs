// Settings defaults, shared by every tool that reads settings before item 09 lands
// the settings store and after it (the store falls back to these).
export const DEFAULT_SETTINGS = Object.freeze({
  schema: "cairn-settings/1",
  bluntness: 1,
  domains: [],
  review_cadence_days: 7,
  witnesses: [],
  capture_hook: false,
  overdue_gate: "full",
});

export const OVERDUE_GATE_MODES = ["full", "strict"];

export const MIN_N = 5;

export function withDefaults(settings) { return { ...DEFAULT_SETTINGS, ...(settings || {}) }; }
