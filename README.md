# Cairn

A decision and prediction ledger for coding agents. You pre-register predictions,
choices and commitments with a confidence and a date; a script scores the record when
it resolves; a fresh-context adversary argues the other side before you commit; a
Socratic coach reads the numbers back at review and never tells you what to decide.

Plain Markdown and JSONL in your own directory. Runs as a Claude Code or Codex plugin
plus a dependency-free Node CLI. No network, no API keys.

**Status: planning.** The plan is in [`docs/ROADMAP.md`](docs/ROADMAP.md); progress in
[`docs/roadmap/STATUS.md`](docs/roadmap/STATUS.md); the rules that bind every item in
[`DESIGN.md`](DESIGN.md). The install and the five-minute walkthrough arrive with
roadmap item 11.

## Development

```bash
node tools/check.mjs
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md), and its **Resuming work** section before
touching anything.

## License

[MIT](LICENSE).
