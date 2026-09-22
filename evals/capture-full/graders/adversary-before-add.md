---
type: tool_order
before:
  tool: Agent
  input_match: 'cairn-adversary'
after:
  tool: Bash
  input_match: 'ledger add'
---

The adversary runs before the commit, never after.
