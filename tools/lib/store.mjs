// The only writer. Resolves where state lives, reads the event stream, appends one
// validated line under an exclusive lock. Nothing here rewrites, truncates or deletes;
// tests/ledger.mjs greps this file to keep it that way.
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { CairnError, invalid } from "./errors.mjs";
import { validateEvent } from "./schema.mjs";

export const LEDGER_FILE = "ledger.jsonl";
const LOCK_FILE = ".ledger.lock";
const LOCK_WAIT_MS = 3000;

/** CAIRN_HOME → nearest docs/cairn/ walking up from cwd → ~/.cairn. Never the plugin. */
export function resolveStateDir({ env = process.env, cwd = process.cwd(), home = homedir() } = {}) {
  if (env.CAIRN_HOME) {
    if (!isAbsolute(env.CAIRN_HOME)) throw invalid("CAIRN_HOME must be an absolute path");
    return env.CAIRN_HOME;
  }
  for (let dir = resolve(cwd); ;) {
    const candidate = join(dir, "docs", "cairn");
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return join(home, ".cairn");
}

export function ledgerPath(dir) { return join(dir, LEDGER_FILE); }

/** Every event, in file order. A malformed line fails the read with its line number. */
export function readEvents(dir) {
  const path = ledgerPath(dir);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const events = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch (e) { throw new CairnError("corrupt", `${LEDGER_FILE} line ${i + 1}: not JSON (${e.message})`, { line: i + 1 }); }
    const errors = validateEvent(event);
    if (errors.length) throw new CairnError("corrupt", `${LEDGER_FILE} line ${i + 1}: ${errors.join("; ")}`, { line: i + 1, errors });
    events.push(event);
  }
  return events;
}

/** Validate, then append exactly one line. Creates the directory on first write. */
export function appendEvent(dir, event) {
  const errors = validateEvent(event);
  if (errors.length) throw invalid(`refusing to append: ${errors.join("; ")}`, { errors });
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  withLock(dir, () => {
    appendFileSync(ledgerPath(dir), `${JSON.stringify(event)}\n`, { mode: 0o600, flag: "a" });
  });
  return event;
}

function withLock(dir, action) {
  const path = join(dir, LOCK_FILE);
  const deadline = Date.now() + LOCK_WAIT_MS;
  let fd;
  for (;;) {
    try { fd = openSync(path, "wx", 0o600); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (Date.now() > deadline) throw new CairnError("locked", `${LEDGER_FILE} has another or interrupted writer; inspect ${path} before removing it`);
      sleep(15);
    }
  }
  try { return action(); } finally { closeSync(fd); unlinkSync(path); }
}

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
