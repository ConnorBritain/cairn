# Contributing

Cairn is small on purpose. The rules below keep it that way and keep the ledger honest.

## Resuming work

Any session, human or agent, with or without memory of the last one:

1. Read [`docs/ROADMAP.md`](docs/ROADMAP.md), then [`docs/roadmap/STATUS.md`](docs/roadmap/STATUS.md).
2. Take the **first unchecked** item in STATUS, in sequence order. Open its spec in
   `docs/roadmap/`. Do not skip ahead; later items assume earlier ones.
3. Run `node tools/check.mjs` before starting. If it fails, that is the work.
4. Build the deliverable. Write its tests. Run `node tools/check.mjs` again.
5. Commit with the STATUS line ticked **in the same commit**, and the item's status
   in ROADMAP and its spec set to `done`. One deliverable per commit minimum; a commit
   that lands half an item leaves STATUS unticked and says so in the message.
6. A `package.json` version bump must land in the same commit as a STATUS change, or
   `tools/check-status.mjs` fails. `Last version:` in STATUS must equal the package
   version at all times.

If a spec turns out to be wrong, change the spec first, in its own commit, then build.
If a house rule in [`DESIGN.md`](DESIGN.md) is in the way, the design is not wrong;
stop and raise it.

## Conventions

Borrowed from [vonnegut](https://github.com/ConnorBritain/vonnegut) and
[roadmap](https://github.com/ConnorBritain/roadmap); when in doubt, do what they do.

- **Dependency-free Node 18+.** `package.json` has no `dependencies`. Tests use
  `node:assert` and a tiny `check`/`group` harness, not a framework.
- **Scripts count, models judge.** If a number appears in a role's output, a script
  computed it and the role cites it. A role that estimates is a bug.
- **Pure core, thin CLI.** Logic lives in `tools/lib/*.mjs` as functions over plain
  data; `tools/*.mjs` parse arguments, resolve the state directory, call the core,
  print. Tests call the core directly and the CLI through `spawnSync` in a temp
  `CAIRN_HOME`.
- **Every test says why it matters.** One comment per test naming what breaks if it
  regresses. A ledger that silently mis-scores looks identical to one that works.
- **State is the user's.** Nothing writes under the plugin directory. Tests never
  touch the real `~/.cairn`; set `CAIRN_HOME` to a temp dir in every test.
- **Append-only means append-only.** `store.mjs` exposes no rewrite. A test greps for
  truncating writes on the ledger path.
- **Hooks fail silent.** Any error inside a hook emits nothing and exits 0. A broken
  hook gets uninstalled, and an uninstalled hook protects nothing.
- **Roles have no tools.** `agents/*.md` declare `tools: []` and receive everything
  in the prompt. Tone comes from `skills/cairn/references/bluntness.md` by reference
  and from nowhere else.
- **No GitHub Actions.** `node tools/check.mjs` is the verifier. Run it locally before
  every commit.
- **Prompts in en-US imperative.** Docs consistent within a file. No secrets, no
  user-specific paths, no run narration.

## Layout

```
tools/            CLI entry points (cairn <subcommand>) and check scripts
tools/lib/        pure logic
tests/            suites, one per tool, plus fixtures/
agents/           model roles, clean context, no tools
skills/           slash-command skills and their references
hooks/            SessionStart and the optional Stop hook
docs/ROADMAP.md   the plan; docs/roadmap/ the specs and STATUS
DESIGN.md         house rules and the model
```

## Checks

```bash
node tools/check.mjs          # everything: status guard, packaging, all tests
node tools/check-status.mjs   # just the version/STATUS guard
node tools/check-status.mjs --staged   # pre-commit form
```

## Releasing

Bump `package.json`, both plugin manifests, the marketplace entry, CHANGELOG and
STATUS `Last version:` in one commit. `tools/check-packaging.mjs` (item 11) asserts
they agree.
