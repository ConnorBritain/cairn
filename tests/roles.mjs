#!/usr/bin/env node
// Item 07 onward: structural checks on role prompts, skills and references. A prompt
// cannot be unit-tested, but the things that would make it violate a house rule can.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, finish, group, ROOT } from "./harness.mjs";
import { FULL_REQUIRED, REQUIRED } from "../tools/lib/schema.mjs";

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const frontmatter = (text) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  assert.ok(m, "frontmatter expected");
  const fm = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { fm, body: m[2] };
};
const RECOMMENDS = [/\byou should\b/i, /\bi recommend\b/i, /\bgo with\b/i, /\bthe better (option|choice)\b/i, /\bmy (advice|recommendation)\b/i, /\bi('d| would) (choose|pick)\b/i];
const PERSON = [/\byou tend to\b/i, /\byou always\b/i, /\byou are (a|an) \w+ person\b/i];
const agents = existsSync(join(ROOT, "agents")) ? readdirSync(join(ROOT, "agents")).filter((f) => f.endsWith(".md")) : [];
const skills = existsSync(join(ROOT, "skills")) ? readdirSync(join(ROOT, "skills")).filter((d) => existsSync(join(ROOT, "skills", d, "SKILL.md"))) : [];
const LEDGER_VERBS = ["add", "resolve", "release", "reflect", "list", "show", "related", "review"];

group("agents");
check("at least the adversary exists", "item 07 ships it", () => assert.ok(agents.includes("cairn-adversary.md")));
for (const file of agents) {
  const { fm, body } = frontmatter(read(`agents/${file}`));
  check(`${file}: frontmatter keys, tools: [], name matches file`, "a role with tools can read the ledger or the session and stop being evidence-bound by construction", () => {
    for (const k of Object.keys(fm)) assert.ok(["name", "description", "model", "tools", "color"].includes(k), `unexpected key ${k}`);
    assert.equal(fm.tools, "[]");
    assert.equal(fm.name, file.slice(0, -3));
    assert.ok(fm.description.length > 40);
  });
  check(`${file}: references the bluntness reference and no other tone instruction`, "one file holds the levels so they mean the same thing across roles", () => {
    assert.match(body, /bluntness reference|bluntness\.md/);
    assert.doesNotMatch(body, /\b(be (gentle|kind|harsh|nice|encouraging|supportive))\b/i);
  });
  check(`${file}: contains no recommendation or person-verdict phrasing`, "house rules 3 and 5: the role asks and cites; it never picks or diagnoses", () => {
    const lines = body.split("\n").filter((l) => !/^\s*-\s*(do not|never|no )/i.test(l) && !/never/i.test(l));
    const text = lines.join("\n");
    for (const re of RECOMMENDS) assert.doesNotMatch(text, re);
    for (const re of PERSON) assert.doesNotMatch(text, re);
  });
}

group("skills");
check("at least the capture skill exists", "item 07 ships it", () => assert.ok(skills.includes("cairn")));
for (const dir of skills) {
  const text = read(`skills/${dir}/SKILL.md`);
  const { fm, body } = frontmatter(text);
  check(`${dir}: frontmatter has name and description; name matches directory`, "the host discovers skills by these fields", () => {
    assert.equal(fm.name, dir);
    assert.ok(fm.description && fm.description.length > 40);
  });
  check(`${dir}: every cairn command it names exists`, "a skill that names a command that does not exist fails at first use", () => {
    const named = [...new Set([...body.matchAll(/`cairn ([a-z-]+)(?: ([a-z-]+))?/g)].map((m) => [m[1], m[2]]))];
    assert.ok(named.length > 0, "names at least one command");
    for (const [sub, verb] of named) {
      if (LEDGER_VERBS.includes(sub)) continue;
      assert.ok(existsSync(join(ROOT, "tools", `${sub}.mjs`)) || sub === "pending" || sub === "settings", `tools/${sub}.mjs for \`cairn ${sub}\``);
      if (sub === "ledger" && verb) assert.ok(LEDGER_VERBS.includes(verb), `ledger verb ${verb}`);
    }
  });
  check(`${dir}: referenced files exist`, "relative references survive both plugin and loose installs only if they resolve", () => {
    for (const m of body.matchAll(/\]\(([^)]+)\)/g)) {
      const link = m[1].split("#")[0];
      if (!link || /^[a-z]+:/.test(link)) continue;
      assert.ok(existsSync(join(ROOT, "skills", dir, link)), link);
    }
  });
}

group("references");
check("kinds.md required-field tables equal schema.mjs", "the skill asks for what this table lists; drift from the schema means asking for the wrong thing", () => {
  const md = read("skills/cairn/references/kinds.md");
  const rows = [...md.matchAll(/^\| (prediction|choice|commitment|note) \| ([^|]*) \| ([^|]*) \| ([^|]*) \|$/gm)];
  assert.equal(rows.length, 4);
  for (const [, kind, quick, full] of rows) {
    const q = quick.split(",").map((s) => s.trim()).filter(Boolean);
    const f = full.trim() === "—" ? [] : full.split(",").map((s) => s.trim()).filter(Boolean);
    assert.deepEqual(q, REQUIRED[kind], `${kind} quick`);
    assert.deepEqual(f, FULL_REQUIRED[kind], `${kind} full`);
  }
});
check("bluntness.md defines levels 0–3 with the invariants", "every role reads this; a missing level or invariant is a hole in the contract", () => {
  const md = read("skills/cairn/references/bluntness.md");
  for (const n of [0, 1, 2, 3]) assert.match(md, new RegExp(`^\\| ${n} \\|`, "m"));
  assert.match(md, /Never recommend/);
  assert.match(md, /Never characterize the person/);
  assert.match(md, /Cite entry ids/);
  for (const re of RECOMMENDS) assert.doesNotMatch(md.replace(/Never recommend[^\n]*/g, ""), re);
});

finish();
