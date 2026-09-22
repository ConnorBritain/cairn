# Explaining the numbers

Fixed text with placeholders. The skill fills `{…}` from `cairn score --json` and
prints nothing about a statistic the tool marked insufficient except the
insufficient line. No number in this file is computed by the model.

## Brier

"Brier score: for each resolved entry, take your confidence as a number from 0 to 1,
subtract what happened (1 if it came true, 0 if not, 0.5 for partial), and square it.
Then average. 0 is perfect. 0.25 is what you get by always saying 50%. 1 is being
certain and wrong every time. Yours: {brier} across {n} entries."

By domain: "In {domain}: {brier} across {n}." Insufficient: "In {domain}: not enough
resolved entries yet ({n} of {min_n})."

## Calibration

"Calibration groups your entries by how confident you were and checks how often you
were right in each group. At {range}% you said, on average, {mean_confidence}% and
were right {hit_rate}% of the time ({n} entries). The gap is {gap}." A negative gap
means the hit rate was below the stated confidence; a positive gap means above.
Insufficient bucket: "At {range}%: {n} entries, not enough to say yet."

Expected error: "Averaged over the groups with enough entries, your confidence was
off by {expected_error} on the 0–1 scale."

## Informativeness

"Informativeness is how far your confidences sit from 50%, on a 0–1 scale. 0 means
every entry said 50%, which can never be wrong and never says anything. 1 means every
entry said 0% or 100%. Yours: {informativeness} across {n}."

## Release rate

"Release rate is the share of closed entries you let go of instead of resolving.
{released} of {closed}: {release_rate}%." Insufficient: "{closed} closed entries, not
enough to say yet."

## Process

"Process score is how many of the three pre-registration steps were on an entry when
it resolved: an adversary pass, a written criterion, frozen reasoning. Average
{process_mean} out of 1 across {n}. Adversary on {adversary}%, criterion on
{criterion}%, reasoning on {reasoning}%."

## Overdue and revised

"{overdue} entries are past their date without a resolution. {revised} entries were
recommitted or adjusted at review."

## Drift

"Drift compares the priorities you stated at the last review with where your entries
actually went since then. Total variation {total_variation}: 0 means the shares
match exactly, 1 means none of the activity was in a stated domain." Per domain:
"{domain}: stated {stated}%, actual {actual}%." With no review: "No review recorded
yet, so there are no stated priorities to compare against."

## Stake

"Of the {n} resolved entries that had an if-then, the if-then was carried out
{honored_rate}% of the time."
