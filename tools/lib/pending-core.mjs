// Candidate capture from decision language. Pure: matchers, transcript parsing, and
// the pending event stream (append-only, like the ledger). Nothing here writes an
// entry; a candidate becomes an entry only through the capture skill with the user's word.

// Order matters: the first matching kind wins for a sentence.
export const CUES = [
  { kind: "commitment", patterns: [/\bi(?:'ll| will) (?:have|get|finish|ship|send|do|write|deliver|complete)\b[^.!?\n]*\bby\b/i, /\bdone by\b/i, /\bi commit to\b/i] },
  { kind: "choice", patterns: [/\b(?:going with|decided (?:to|on)|we(?:'ll| will) use|i(?:'ll| will) use|let's go with|picking)\b/i, /\b\w+ over \w+\b.*\b(?:instead|rather)\b/i] },
  { kind: "prediction", patterns: [/\bi (?:think|bet|expect|predict|reckon)\b[^.!?\n]*\bwill\b/i, /\bprobably\b[^.!?\n]*\bby\b/i, /\b\d{1,3}\s?% (?:chance|likely|sure|confident)\b/i, /\bwill (?:happen|ship|land|be done|pass|fail)\b/i] },
];

export function guessKind(sentence) {
  for (const { kind, patterns } of CUES) if (patterns.some((p) => p.test(sentence))) return kind;
  return null;
}

export function sentences(text) {
  return String(text || "").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 8);
}

/** Text of a transcript line's user turn, or null for anything else. */
export function userText(line) {
  let obj;
  try { obj = JSON.parse(line); } catch { return null; }
  const message = obj?.message ?? obj;
  const role = message?.role ?? obj?.type;
  if (role !== "user") return null;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((c) => c && c.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n");
  return null;
}

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Scan transcript lines from `from`; returns candidates and the new cursor. */
export function scanTranscript(lines, { from = 0, known = new Set() } = {}) {
  const found = [];
  const seen = new Set(known);
  for (let i = from; i < lines.length; i += 1) {
    const text = userText(lines[i]);
    if (!text) continue;
    for (const sentence of sentences(text)) {
      const kind = guessKind(sentence);
      if (!kind) continue;
      const key = normalize(sentence);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ kind_guess: kind, text: sentence, line: i + 1 });
    }
  }
  return { candidates: found, cursor: lines.length };
}

/** Fold the pending event stream into open candidates, decisions, and cursors. */
export function pendingState(events) {
  const candidates = new Map();
  const cursors = new Map();
  let maxN = 0;
  for (const e of events) {
    if (e.event === "candidate") { candidates.set(e.n, { ...e, state: "open" }); maxN = Math.max(maxN, e.n); }
    else if (e.event === "confirmed" || e.event === "discarded") { const c = candidates.get(e.n); if (c) c.state = e.event; }
    else if (e.event === "cursor") cursors.set(e.transcript, e.line);
  }
  return { candidates: [...candidates.values()], open: [...candidates.values()].filter((c) => c.state === "open"), cursors, nextN: maxN + 1 };
}
