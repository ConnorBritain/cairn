# 07 · capture

**Goal.** Natural-language capture that is fast at quick tier and adversarial at full
tier, with tone governed by one file.

## Files

```
skills/cairn/SKILL.md                    the /cairn capture skill
skills/cairn/references/bluntness.md     the four dial levels; the only tone document
skills/cairn/references/kinds.md         recognition cues and required fields per kind (mirrors schema.mjs)
agents/cairn-adversary.md                the adversary role
tests/roles.mjs                          structural tests on the prompt files
```

## `/cairn` flow

1. **Recognize.** From the user's sentence, pick the kind: "I think / I bet / will
   happen by" → prediction; "going with X over Y / decided" → choice; "I'll have /
   I will … by" → commitment; anything else → note. State the recognized kind in one
   line; the user can correct it.
2. **Tier.** Quick unless the user asks for full, gives reasoning, or the kind is
   choice/commitment with an explicit if-then. Say which tier and why in five words.
3. **Gate.** Run `cairn gates check add --tier <t>`. If refused, show `reasons`
   verbatim and offer quick tier. Never argue with the gate.
4. **Missing fields only.** Ask for required fields the sentence did not contain, one
   message, in the order of the kinds table. Defaults are offered, never assumed:
   domain from `settings.domains` if exactly one, else asked.
5. **Full tier only, dial ≥ 1.** Run `cairn score --domain <d> --summary` and
   `cairn ledger related --domain <d> --text "<text>"`. Spawn `cairn-adversary` with
   the draft entry, the summary, the related entries, and the dial level. Show its four
   outputs. Ask: "Commit as is, change the confidence, or drop it?" Record the pass on
   the entry via `--adversary-file`.
6. **Commit.** `cairn ledger add …`. Show the id and the date it comes due. Nothing
   else: no encouragement, no summary of what the user just said.

Quick tier is one exchange when the sentence carries the required fields, two when it
does not. Time budget: no tool calls beyond the gate check and the add.

At dial 0 the adversary never runs, and the entry is committed quick even if the user
supplied reasoning (full requires an adversary pass; the skill says so in one line).

## `cairn-adversary`

Frontmatter: `name`, `description` (trigger: full-tier capture; not the reviewer),
`model`, `tools: []`.

Inputs, verbatim in the prompt: the draft entry as JSON; the domain summary from
`score.mjs`; up to five related resolved entries; the bluntness level; the contents of
`bluntness.md`.

Outputs, in this order and labelled:

1. **The other side.** The strongest case for the rejected option, or against the
   claim, or for not committing. Argued, not listed.
2. **What would have to be true for this to fail.** Concrete, checkable conditions.
3. **The base-rate question.** One question about how often things like this succeed,
   phrased so the user has to supply the number.
4. **The record question.** One pointed question about why this differs from the user's
   record in this domain. Must cite the summary numbers or the related entry ids it is
   built on. If the summary is `insufficient`, the question says so and asks about a
   related entry instead, or is omitted with the line "no record to compare yet".

Rules: never recommends; never says which option is better; never infers a trait;
cites ids for every reference to the record; takes phrasing from `bluntness.md` only;
stays under 250 words at levels 1–2 and 180 at level 3.

## `bluntness.md`

One table, four rows, each with: what the role volunteers, sentence forms allowed,
sentence forms forbidden, and one example for the adversary and one for the reviewer.
Level 0 is "does not run". Every level forbids recommendations and person-verdicts.
The file is included by reference from every role prompt; no role restates it.

## Tests (`tests/roles.mjs`)

- Each agent file has only the allowed frontmatter keys and `tools: []`.
- The adversary prompt references `bluntness.md` and contains none of a fixed list of
  recommendation verbs in imperative form ("you should", "I recommend", "go with").
- `kinds.md` required fields equal `schema.mjs` required fields (parsed, compared).
- `SKILL.md` names every CLI command it uses and each exists in `tools/`.

## Status

planned
