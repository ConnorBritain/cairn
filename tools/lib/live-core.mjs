// Pure logic for live-session verification: parse a headless stream-json transcript,
// find tool calls, and decide each smoke case on files and tool calls, never prose.
// tests/live-core.mjs runs this over recorded fixture streams; tools/live-smoke.mjs
// runs it over a real session.

export const RECOMMENDS = [/\byou should\b/i, /\bi recommend\b/i, /\bgo with\b/i, /\bthe better (option|choice)\b/i, /\bmy (advice|recommendation)\b/i, /\bi('d| would) (choose|pick)\b/i];

const contentText = (content) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === "string" ? c : c?.type === "text" ? c.text : "")).join("\n");
  return "";
};

/** Parse `--output-format stream-json --verbose` output. Tolerates unknown lines. */
export function parseStream(text) {
  const stream = { init: null, toolCalls: [], toolResults: new Map(), texts: [], result: null, lines: 0 };
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    stream.lines += 1;
    if (obj.type === "system" && obj.subtype === "init") stream.init = obj;
    else if (obj.type === "assistant") {
      for (const block of obj.message?.content ?? []) {
        if (block?.type === "tool_use") stream.toolCalls.push({ id: block.id, name: block.name, input: block.input ?? {} });
        else if (block?.type === "text" && block.text) stream.texts.push(block.text);
      }
    } else if (obj.type === "user") {
      for (const block of obj.message?.content ?? []) {
        if (block?.type === "tool_result") stream.toolResults.set(block.tool_use_id, contentText(block.content));
      }
    } else if (obj.type === "result") stream.result = obj;
  }
  return stream;
}

export const agentCalls = (s) => s.toolCalls.filter((c) => c.name === "Agent" || c.name === "Task");
export const agentTarget = (c) => String(c.input?.subagent_type ?? c.input?.agent ?? "");
export const bashCalls = (s) => s.toolCalls.filter((c) => c.name === "Bash").map((c) => ({ ...c, command: String(c.input?.command ?? "") }));
export const resultText = (s, call) => s.toolResults.get(call.id) ?? "";
export const finalText = (s) => (typeof s.result?.result === "string" ? s.result.result : s.texts[s.texts.length - 1] ?? "");
export const entries = (events) => events.filter((e) => e.event === "entry");

/** Headless Claude Code invocation. Auth stays with the CLI; isolation is CAIRN_HOME plus no user settings. */
export function claudeArgs({ prompt, root }) {
  return ["-p", prompt, "--plugin-dir", root, "--output-format", "stream-json", "--verbose", "--no-session-persistence",
    "--setting-sources", "", "--permission-mode", "dontAsk", "--allowedTools", "Bash(node *)", "Bash(cairn *)", "Read", "Agent"];
}

/** Headless Codex invocation (flags as vonnegut's adapter uses them). */
export function codexArgs({ prompt, root }) {
  return ["exec", "--json", "--ephemeral", "--skip-git-repo-check", "-C", root, "-s", "workspace-write", prompt];
}

const pass = (detail) => ({ pass: true, detail });
const fail = (detail) => ({ pass: false, detail });

export function assertQuick({ events, stream }) {
  const es = entries(events);
  if (es.length !== 1) return fail(`expected 1 entry, found ${es.length}`);
  const e = es[0];
  if (e.kind !== "prediction") return fail(`kind ${e.kind}, expected prediction`);
  if (e.confidence !== 70) return fail(`confidence ${e.confidence}, expected 70`);
  if (e.tier !== "quick") return fail(`tier ${e.tier}, expected quick`);
  if (agentCalls(stream).length) return fail("an Agent call ran at quick tier");
  return pass(`${e.id} quick prediction at 70%, no role spawned`);
}

export function assertFullAdversary({ events, stream }) {
  const es = entries(events);
  if (es.length !== 1) return fail(`expected 1 entry, found ${es.length}`);
  const e = es[0];
  if (e.tier !== "full" || e.adversary?.ran !== true) return fail(`tier ${e.tier}, adversary.ran ${e.adversary?.ran}`);
  const calls = agentCalls(stream).filter((c) => agentTarget(c).includes("cairn-adversary"));
  if (!calls.length) return fail("no Agent call named cairn-adversary in the stream");
  const text = calls.map((c) => resultText(stream, c)).join("\n");
  const hit = RECOMMENDS.find((re) => re.test(text));
  if (hit) return fail(`adversary output matched ${hit}`);
  return pass(`${e.id} full ${e.kind}; adversary spawned once, output clean`);
}

export function assertGateBlocks({ ledgerBefore, ledgerAfter, stream }) {
  if (ledgerBefore !== ledgerAfter) return fail("ledger changed although the gate should have refused");
  const gate = bashCalls(stream).find((c) => /gates check add/.test(c.command));
  if (!gate) return fail("no `gates check add` call in the stream");
  const out = resultText(stream, gate);
  if (!/full-tier capture blocked|exit code 3|overdue_gate=strict/i.test(out)) return fail(`gate call result did not show a refusal: ${out.slice(0, 120)}`);
  return pass("ledger unchanged; gate refusal observed in the tool stream");
}

export function hookObserved({ stream }) {
  return stream.texts.concat(finalText(stream)).some((t) => /cairn: \d+ overdue|cairn: .*review due/.test(t));
}

export const CASES = [
  {
    name: "capture-quick",
    seed: [],
    prompt: (date) => `/cairn I think the vendor ships the API by ${date}, 70%. Criterion: their endpoint answers one real request from our staging environment. Domain: work. Commit it as a quick-tier prediction without asking me anything.`,
    check: assertQuick,
  },
  {
    name: "capture-full-adversary",
    seed: [],
    prompt: (date) => `/cairn Full tier. I'm going with Postgres over SQLite for the new service, 80% confident the criterion "p95 latency under 50 ms in staging" is met by ${date}. Domain: work. If-then: if it is not met by then, we revert to SQLite. Reasoning: the team already runs Postgres and the write volume is small. Run the adversary, then commit as is without asking me anything.`,
    check: assertFullAdversary,
  },
  {
    name: "gate-blocks",
    seed: [["add", "--kind", "prediction", "--tier", "full", "--text", "seeded overdue", "--confidence", "60", "--criterion", "c", "--domain", "work", "--resolve-by", "2000-01-01", "--reasoning", "r", "--adversary-json", JSON.stringify({ ran: true, at: "1999-12-01T00:00:00Z", other_side: "o", failure_conditions: "f", base_rate_question: "b", record_question: "r" })]],
    seedNow: "1999-12-01T00:00:00Z",
    prompt: (date) => `/cairn Full tier. I predict the release lands by ${date}, 75%. Criterion: tagged on main. Domain: work. Reasoning: scope is fixed. If the gate refuses, stop and tell me; do not capture at quick tier and do not capture a note.`,
    check: assertGateBlocks,
  },
];
