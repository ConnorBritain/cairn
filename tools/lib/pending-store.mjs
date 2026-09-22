// pending.jsonl: append-only stream of candidate notes and what happened to them.
// Separate from the ledger; a candidate is not an entry.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pendingState } from "./pending-core.mjs";

export const PENDING_FILE = "pending.jsonl";
const pendingPath = (dir) => join(dir, PENDING_FILE);

export function readPending(dir) {
  const path = pendingPath(dir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function appendPending(dir, events) {
  if (!events.length) return;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  appendFileSync(pendingPath(dir), events.map((e) => `${JSON.stringify(e)}\n`).join(""), { mode: 0o600, flag: "a" });
}

export function loadPending(dir) { return pendingState(readPending(dir)); }
