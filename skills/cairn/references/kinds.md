# Kinds

Recognition cues and required fields per kind. The tables mirror `tools/lib/schema.mjs`
(`REQUIRED` and `FULL_REQUIRED`); a test keeps them equal.

## Recognition

| Kind | Cues in the user's sentence |
|---|---|
| prediction | "I think … will", "I bet", "will happen by", "probably", a percentage about the world, "X is going to" |
| choice | "going with X over Y", "decided on", "we'll use X instead of Y", "picking", "X, not Y" |
| commitment | "I'll have … by", "I will … by", "done by", "I commit to", "by Friday" |
| note | anything else worth keeping: a hunch, an option, a question, a thing to watch |

Ambiguous sentences default to the kind with the fewest required fields that still
fits, and the recognized kind is stated in one line so the user can correct it.

## Required fields

| Kind | Quick tier requires | Full tier additionally requires | Date key |
|---|---|---|---|
| prediction | text, confidence, criterion, dates.resolve_by | reasoning, adversary.ran | resolve_by |
| choice | chosen, over, confidence, criterion, dates.review_by | if_then, reasoning, adversary.ran | review_by |
| commitment | text, dates.due_by | criterion, if_then, reasoning, adversary.ran | due_by |
| note | text | — | resolve_by (optional) |

Every kind takes one or more `domains`; notes default to `general`. A full commitment
also needs an explicit `confidence` (quick commitments default to 100). Notes are always
quick.

## Asking for what is missing

Ask for missing required fields in one message, in table order, each with its
meaning in a few words:

- confidence: "how likely, 0–100"
- criterion: "what, checkable by someone else, would count as true / met"
- resolve_by / review_by / due_by: "the date this gets checked"
- chosen / over: "the option taken, and the one it beat"
- if_then (full): "if the criterion is not met by the date, what happens"
- reasoning (full): "why, in the words you would want to read later"

Offer a default only for the domain, and only when the settings list exactly one.
