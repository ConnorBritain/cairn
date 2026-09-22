#!/usr/bin/env node
// Packaging invariants: versions agree everywhere, every discoverable file is well
// formed, every relative markdown link resolves, no GitHub Actions, hooks point at
// files under hooks/. Stdlib only.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS } from "../install-cairn-codex.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const json = (p) => JSON.parse(read(p));
const frontmatter = (text, file) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  assert.ok(m, `${file}: frontmatter expected`);
  const fm = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return fm;
};

// Versions.
const pkg = json("package.json");
const claude = json(".claude-plugin/plugin.json");
const codex = json(".codex-plugin/plugin.json");
const market = json(".claude-plugin/marketplace.json");
assert.equal(claude.name, "cairn");
assert.equal(codex.name, "cairn");
assert.equal(market.name, "cairn");
assert.equal(market.plugins.length, 1);
assert.equal(market.plugins[0].name, "cairn");
assert.equal(market.plugins[0].source, "./");
for (const [label, v] of [["claude-plugin", claude.version], ["codex-plugin", codex.version], ["marketplace", market.plugins[0].version]]) {
  assert.equal(v, pkg.version, `${label} version ${v} != package.json ${pkg.version}`);
}
assert.match(read("docs/roadmap/STATUS.md"), new RegExp(`^Last version: ${pkg.version.replaceAll(".", "\\.")}$`, "m"));
assert.match(read("CHANGELOG.md"), new RegExp(`^## \\[${pkg.version.replaceAll(".", "\\.")}\\]`, "m"));
assert.equal(claude.repository, "https://github.com/ConnorBritain/cairn");
assert.equal(codex.repository, "https://github.com/ConnorBritain/cairn");
assert.ok(codex.interface && codex.interface.displayName && codex.interface.longDescription, "codex manifest needs an interface block");
assert.ok(!("agents" in claude) && !("skills" in claude) && !("commands" in claude), "plugin.json must not declare agents/skills/commands; declaring replaces auto-discovery");
assert.deepEqual(Object.keys(pkg.dependencies || {}), [], "no runtime dependencies");
assert.equal(pkg.bin.cairn, "tools/cli.mjs");

// Discoverable files.
const agents = readdirSync(join(root, "agents")).filter((f) => f.endsWith(".md"));
assert.deepEqual(agents.map((f) => f.slice(0, -3)).sort(), [...AGENTS].sort(), "installer AGENTS list matches agents/");
for (const file of agents) {
  const fm = frontmatter(read(`agents/${file}`), file);
  assert.equal(fm.name, file.slice(0, -3), file);
  assert.ok(fm.description, `${file}: description`);
  assert.equal(fm.tools, "[]", `${file}: roles have no tools`);
}
const skills = readdirSync(join(root, "skills"));
assert.deepEqual(skills.sort(), ["cairn", "cairn-resolve", "cairn-review", "cairn-score", "cairn-tune", "cairn-witness"]);
for (const dir of skills) {
  const fm = frontmatter(read(`skills/${dir}/SKILL.md`), dir);
  assert.equal(fm.name, dir);
  assert.ok(fm.description, `${dir}: description`);
}
const hooks = json("hooks/hooks.json").hooks;
for (const group of Object.values(hooks)) for (const h of group.flatMap((x) => x.hooks)) {
  const m = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([a-z-]+\.mjs)"$/.exec(h.command);
  assert.ok(m, `hook command shape: ${h.command}`);
  assert.ok(existsSync(join(root, "hooks", m[1])), `hooks/${m[1]}`);
  assert.ok(Number.isInteger(h.timeout) && h.timeout <= 15, "hook timeout");
}
assert.ok(!existsSync(join(root, ".github", "workflows")), "No GitHub Actions workflows");
for (const f of pkg.files) assert.ok(existsSync(join(root, f)), `package.json files: ${f}`);

// Eval cases: prompt with frontmatter and at least one grader with a type.
const evals = readdirSync(join(root, "evals"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
assert.ok(evals.length >= 3, "evals/ has cases");
for (const name of evals) {
  frontmatter(read(`evals/${name}/prompt.md`), `evals/${name}/prompt.md`);
  const graders = readdirSync(join(root, "evals", name, "graders")).filter((f) => f.endsWith(".md"));
  assert.ok(graders.length >= 1, `evals/${name}: grader`);
  for (const g of graders) assert.ok(frontmatter(read(`evals/${name}/graders/${g}`), g).type, `evals/${name}/graders/${g}: type`);
}
// check.mjs never invokes a CLI or a model.
assert.doesNotMatch(read("tools/check.mjs"), /check-installation|live-smoke|plugin eval|"claude"|"codex"/);

// Markdown links in maintained docs.
const documents = [];
(function visit(dir) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "tests") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.name.endsWith(".md")) documents.push(path);
  }
})("");
for (const file of documents) {
  const text = read(file).replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, "");
  for (const match of text.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
    const link = match[1].split("#")[0];
    if (!link || /^[a-z]+:|[<> ]/.test(link)) continue;
    assert.ok(existsSync(resolve(root, dirname(file), decodeURIComponent(link))), `${file}: broken link ${link}`);
  }
}

console.log(`check-packaging: cairn ${pkg.version} · ${agents.length} agents · ${skills.length} skills · ${evals.length} eval cases · ${documents.length} documents linked`);
