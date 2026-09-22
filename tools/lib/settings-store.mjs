// Local immutable revision storage for settings, after vonnegut's preference store:
// one revision file per change, an atomic current.json pointer, one exclusive writer.
// The ledger has its own store; this one may replace the pointer, never a revision.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { withDefaults } from "./defaults.mjs";
import { CairnError, invalid } from "./errors.mjs";
import { applySettings, diffSettings, digestOf, initSettings, undoSettings, validateSettings } from "./settings-core.mjs";

export const SETTINGS_DIR = "settings";
const revisionName = (s) => `${String(s.revision).padStart(6, "0")}-${digestOf(s)}.json`;
const paths = (dir) => ({ base: join(dir, SETTINGS_DIR), revisions: join(dir, SETTINGS_DIR, "revisions"), current: join(dir, SETTINGS_DIR, "current.json"), lock: join(dir, SETTINGS_DIR, ".writer.lock") });

/** The current revision, or null when no settings have been saved. Verifies the digest. */
export function readSettings(dir) {
  const p = paths(dir);
  if (!existsSync(p.current)) return null;
  const pointer = JSON.parse(readFileSync(p.current, "utf8"));
  if (!/^\d{6,}-[a-f0-9]{64}\.json$/.test(pointer.file || "")) throw new CairnError("corrupt", "settings/current.json: invalid pointer");
  const s = JSON.parse(readFileSync(join(p.revisions, pointer.file), "utf8"));
  const errors = validateSettings(s);
  if (errors.length) throw new CairnError("corrupt", `settings revision ${pointer.file}: ${errors.join("; ")}`);
  if (revisionName(s) !== pointer.file) throw new CairnError("corrupt", `settings revision ${pointer.file}: digest mismatch; the file was modified`);
  return s;
}

/** Effective settings: saved values over defaults. Never throws on a missing store. */
export function loadSettings(dir) {
  return withDefaults(readSettings(dir) ?? {});
}

function withLock(dir, action) {
  const p = paths(dir);
  mkdirSync(p.base, { recursive: true, mode: 0o700 });
  let fd;
  try { fd = openSync(p.lock, "wx", 0o600); } catch (e) {
    if (e.code === "EEXIST") throw new CairnError("locked", `settings store has another or interrupted writer; inspect ${p.lock} before removing it`);
    throw e;
  }
  try { return action(); } finally { closeSync(fd); unlinkSync(p.lock); }
}

function persist(dir, s) {
  const errors = validateSettings(s);
  if (errors.length) throw invalid(`invalid settings: ${errors.join("; ")}`);
  const p = paths(dir);
  mkdirSync(p.revisions, { recursive: true, mode: 0o700 });
  const file = revisionName(s);
  const bytes = `${JSON.stringify(s, null, 2)}\n`;
  const target = join(p.revisions, file);
  if (existsSync(target)) {
    if (readFileSync(target, "utf8") !== bytes) throw new CairnError("corrupt", `settings revision ${file} exists with different bytes`);
  } else writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  const temporary = join(p.base, `.pointer-${randomUUID()}.json`);
  try {
    writeFileSync(temporary, `${JSON.stringify({ file })}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, p.current);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  return s;
}

export function setSettings(dir, changes, ts, note) {
  return withLock(dir, () => {
    const current = readSettings(dir) ?? initSettings(ts);
    if (!existsSync(paths(dir).current)) persist(dir, current);
    const result = applySettings(current, changes, ts, note);
    persist(dir, result.settings);
    return result;
  });
}

export function undoLast(dir, ts) {
  return withLock(dir, () => {
    const current = readSettings(dir);
    if (!current || current.revision === 1) throw invalid("nothing to undo");
    const file = readdirSync(paths(dir).revisions).find((f) => f.endsWith(`-${current.parent_digest}.json`));
    if (!file) throw new CairnError("corrupt", "previous revision is missing; cannot invent undo history");
    const parent = JSON.parse(readFileSync(join(paths(dir).revisions, file), "utf8"));
    const next = undoSettings(current, parent, ts);
    persist(dir, next);
    return { settings: next, changed: diffSettings(current, next), restored: parent.revision };
  });
}

/** Every revision in order, each with what changed from the one before. */
export function settingsHistory(dir) {
  const p = paths(dir);
  if (!existsSync(p.revisions)) return [];
  const revisions = readdirSync(p.revisions).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(join(p.revisions, f), "utf8")));
  return revisions.map((s, i) => ({ revision: s.revision, ts: s.ts, note: s.note ?? null, changed: i ? diffSettings(revisions[i - 1], s) : [] }));
}
