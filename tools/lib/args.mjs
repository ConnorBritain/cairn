// Tiny argv parser. `--key value`, `--key=value`, `--flag` (boolean when listed in
// `booleans` or when nothing follows), repeated keys listed in `multi` collect into
// arrays, everything else is positional. Keys are camelCased: --resolve-by → resolveBy.
import { usage } from "./errors.mjs";

export function parseArgs(argv, { multi = [], booleans = [] } = {}) {
  const flags = {};
  const positionals = [];
  const bools = new Set(["json", ...booleans].map(camel));
  const multis = new Set(multi.map(camel));
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") { positionals.push(...argv.slice(i + 1)); break; }
    if (!arg.startsWith("--")) { positionals.push(arg); continue; }
    let key = arg.slice(2);
    let value;
    const eq = key.indexOf("=");
    if (eq >= 0) { value = key.slice(eq + 1); key = key.slice(0, eq); }
    key = camel(key);
    if (value === undefined) {
      if (bools.has(key)) value = true;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) { value = argv[i + 1]; i += 1; }
      else value = true;
    }
    if (multis.has(key)) (flags[key] ||= []).push(value);
    else if (key in flags) throw usage(`--${arg.slice(2).split("=")[0]} given twice`);
    else flags[key] = value;
  }
  return { flags, positionals };
}

function camel(key) { return key.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()); }
