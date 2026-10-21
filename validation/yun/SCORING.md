# Yun et al. 2024 benchmark: frozen scoring spec

Status: **FROZEN** (written 2026-10-21, before any DEV or TEST run). Rules version under test:
`shared/alm-entry.js` `RULES_VERSION` as printed by the runner. Changing anything below after
the TEST run invalidates the TEST result; harness bug fixes found on DEV must not change these rules.

## Inputs

- Gold: `data/annotated_rct_dataset.json` (hyesunyun/llm-meta-analysis, commit in `PINNED_SHA.txt`),
  one ICO item per row, field `split` is `DEV` or `TEST`. The runner reads only the requested split.
- Text: `<texts>/PMC<pmcid>.md`, used byte-for-byte as the paste. The whole article markdown
  (abstract + results, tables as space-aligned text) is passed to `AlmEntry.extract` in one call.
  This simulates a user pasting the full results section; nothing is trimmed, cleaned or pre-selected.
- Call: `extract(text, "binary2x2", {outcome})` for binary items, `extract(text, "continuous", {outcome})`
  for continuous items. `outcome` is the item's `outcome` string (what a user would type). No other
  item field (gold values, intervention/comparator names, notes, flags) reaches extraction or ranking.

## Evaluable items (N)

- Binary items need all four of `intervention_events`, `intervention_group_size`, `comparator_events`,
  `comparator_group_size`; continuous items need all six of `*_mean`, `*_standard_deviation`,
  `*_group_size`. Any empty or non-numeric field -> `GOLD_INCOMPLETE`, excluded from N, reported separately
  (with the count whose `is_data_complete` is `FALSE`).
- Missing text file for an evaluable item -> `NO_TEXT`, excluded from N, reported separately (this is the
  normal state for non-CC-BY items when run on the committed `texts/` subset).

## Number normalisation

- Gold strings are parsed with `Number()` after trimming. Candidate values are the numbers the
  extractor returns. Comparison is exact numeric equality (`3.30` equals gold `3.3`; `3.3` does not equal
  `3.31`). No tolerance, no rounding, no unit conversion, no recomputation (e.g. events from percentages,
  SD from SE/CI are never derived by the harness).
- Span check: every value used for a match must have a span `[start,end)` that slices the original paste
  to exactly one complete printed numeric token whose numeric value equals the value
  (token grammar of `validation/realpaper/run.mjs`: thousands separators, Unicode minus and middle-dot
  decimals accepted; only real HTML tags `<name ...>`/`</name>` are excluded).
  Harness fix made on DEV, before any TEST run: the realpaper tokeniser blanks every `<...>`, which in
  these markdown tables swallowed rows between `<0.05` and `(>0.05)`; `run.mjs` therefore keeps its own
  copy restricted to real tags. Scoring rules are otherwise unchanged.

## PASS (candidate recall)

- **Binary**: some candidate of kind `counts` with exactly two arms whose `{events/n}` multiset equals the
  gold `{intervention_events/intervention_group_size, comparator_events/comparator_group_size}`, with valid
  spans. **Arm order is not required** (the user maps printed arms to intervention/control).
  Rank = 1-based position of the first such candidate in the returned list.
- **Continuous**: two **distinct** candidates of kind `mean_sd` (different spans), one equal to
  `(intervention_mean, intervention_standard_deviation)` and the other to
  `(comparator_mean, comparator_standard_deviation)`, both with valid spans. Arm order not required.
  A candidate whose spread is not labelled SD (`dispersion: null`, the tool asks SD or SE) still passes
  and is counted as `sd_question`. The extractor's continuous mode does not offer group sizes, so group
  sizes are **not** part of PASS; whether both gold group sizes are printed literally in the paste is
  reported per item (`n_printed`) and the strict count including n is reported as `continuous_with_n`.
  Rank = the larger of the two arms' ranks under the best assignment (the user needs both).
- Ranking only orders the list; it never decides PASS. Every PASS reports rank and candidate count.

## CONFUSABLE (no "tool answer" is ever computed)

For PASS items only: a candidate ranked strictly above the gold rank whose values differ from the gold
(binary: different arm multiset; continuous: a `mean_sd` whose (mean, sd) equals neither gold arm, or any
`median_iqr`). Candidates with identical values at other spans are not confusable. Reported as number of
items with >=1 confusable and the total number of confusable candidates, categorised as:
`ONE_ARM_GOLD` (binary, shares exactly one gold arm), `OTHER_COUNTS`, `SAME_MEAN_OTHER_SD`,
`OTHER_MEAN_SD`, `MEDIAN_IQR`.

## Miss categories (exactly one, first applicable in this order)

Let *printed(v)* mean v occurs as a complete literal numeric token in the paste (same tokeniser as the span check).

1. `PERCENT_ONLY` (binary): some gold events value is not printed, and a percentage `p%` is printed with
   `|100*events/n - p| <= 0.5*10^-d` (d = printed decimals) for that arm.
2. `SD_SE_AMBIGUOUS` (continuous): both gold means printed, some gold SD not printed, and the paste mentions
   `SE`, `SEM` or `standard error` (gold SD probably derived from an SE/CI); or a `mean_sd` candidate
   matches a gold mean but not its SD.
3. `NOT_FOUND`: some scored gold value (binary: events and n; continuous: mean and SD) is not printed.
4. `IN_TABLE_LAYOUT`: all printed, and for some arm every occurrence of its events (binary) or mean
   (continuous) lies on a table line (a line with `|`, a tab, or at least two runs of 2+ spaces between
   non-space characters).
5. `SPLIT_ACROSS_SENTENCES`: all printed in prose, but for some arm no single sentence contains both of
   its values (sentences split at `[.;!?]` followed by whitespace + capital/parenthesis, or newline).
6. `OTHER`: printed together in one prose sentence but not offered (a rule gap). Exceptions are `ERROR`.

## Output

One line per item, then
`YUN <split> binary recall=a/N1 continuous recall=b/N2 gold_incomplete=c rank1=x% mean_rank=y confusable=z`
(rank1 and mean_rank over PASS items of both types; confusable = PASS items with >=1 confusable), then a
per-licence breakdown (`cc by` vs other, from `licences.json`). Licence never changes scoring.
