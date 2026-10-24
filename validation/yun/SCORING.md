# Yun et al. 2024 benchmark: frozen scoring spec

The original specification below is preserved as history. The amendment at the end supersedes its
denominator, automated-answer and output statements; its candidate-recall matching rules remain intact.

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

## Amendment 2026-10-21, made before any TEST run, no tuning

This additive amendment separates three metrics. It changes no extraction or ranking rules and uses
no TEST observations. Yun HS et al. (2024), arXiv:2405.01686v2, report per-comparison exact match:
65.5% binary / 48.7% continuous for GPT-4 on TEST. Each comparison is one intervention-comparator-outcome
item, and every number must match in the correct arm. Their 120 OA RCTs comprise 10 DEV / 110 TEST
articles (43 / 656 annotated items). DEV results must not be presented as a TEST head-to-head result.

### Eligibility and automated answer

Exclude **only GOLD_INCOMPLETE**: any required gold number is empty, non-numeric or non-finite after
the existing numeric parsing. Report its count separately, including the `is_data_complete=FALSE`
count. The flag alone does not exclude an otherwise complete item. `NO_TEXT`, `ERROR`, no candidate,
missing candidate fields and wrong candidate types remain in N and fail PC-EXACT. Missing answers
contribute zero correct numbers and all four/six gold numbers to PER-VALUE. This supersedes the old
NO_TEXT exclusion; the same eligible-item denominator is used for RECALL. Licence never excludes items.

Extract once with `AlmEntry.extract(text, schema, {outcome: item.outcome})`. The automated answer is
strictly `candidates[0]` in returned order: no gold-guided selection, no filtering to a later candidate,
no combining candidates, no user correction, no derived numbers. Names are used only after extraction
to assign arms, never to change ranking.

Assignment rule, fixed before any TEST run:

- Tokenise names and each returned arm's label/cue using lowercase maximal Unicode letter/digit runs.
  Use unique tokens, no stopword removal, synonyms, stemming or weighting. Overlap is intersection size.
  Arm text is the union of `values.arms[i].label`, its `cue`, and `candidate.armCues[i]` (cue `text`,
  otherwise `value`). The whole two-arm candidate cue is not assigned to either arm.
- For two arms, compare the summed overlaps for printed assignment (arm 0 intervention, arm 1
  comparator) and reversed assignment. Reverse only when its score is strictly larger.
  Ties, including zero overlap, retain printed order. Numeric values never influence assignment.
- The current continuous candidate is a single `mean_sd` arm. Its cue/label and returned
  `facetEvidence.arm` text are used as its arm text. Assign it to comparator only when comparator
  overlap is strictly larger; otherwise to intervention (printed-order fallback). The other arm is
  unanswered. No second candidate is used. A returned two-arm `mean_sd` payload, if supported by a
  future extractor, follows the two-arm rule; the current extractor is unchanged.

### Metric definitions

1. **PC-EXACT**, automated per-comparison exact match: PASS iff all four binary values (events and n
   for both assigned arms) or all six continuous values (mean, SD and n for both assigned arms) equal
   gold with strict numeric equality. Absent values fail, even if a matching number appears elsewhere
   in the article. Span validity is retained for RECALL only; PC-EXACT compares the returned numeric
   answer, without an additional span eligibility condition. This is the **only metric comparable**
   to the paper's GPT-4 per-comparison exact-match rate. Full TEST coverage would be needed for a
   head-to-head comparison; a DEV run or a text-subset run is not such a result.
2. **CANDIDATE-RECALL**, printed as RECALL: the original human-in-the-loop metric above, with arm
   order free and literal source spans required. Binary needs a matching two-arm counts candidate;
   continuous needs distinct matching mean/SD candidates and does not score group sizes. Keep rank,
   rank1 percentage and mean rank over recall PASS items, candidate burden and confusable statistics.
   This is **not comparable** to GPT-4's rate. Historical `status=PASS` and summary `binary`/`continuous`
   fields continue to mean recall; `pcExact` stores the automated result separately.
3. **PER-VALUE**, automated number accuracy: number of exactly equal rank-1, arm-assigned values divided
   by all gold numbers in eligible items (4 per binary item, 6 per continuous item). Count repeated
   numeric values separately by field and arm. No candidate contributes 0/4 or 0/6. Partial answers can
   earn partial credit. This is **not comparable** to GPT-4's per-comparison rate.

The current continuous extractor offers mean/SD for one arm per candidate and no group sizes;
continuous PC-EXACT therefore fails, even when human-in-the-loop RECALL passes. This is a reported
limitation, not grounds to relax the metric.

### Amended output

After per-item diagnostics, print these lines in this order (with rank/count details appended to RECALL):

```text
YUN <split> PC-EXACT binary=a/N continuous=b/N gold_incomplete=c
YUN <split> RECALL binary=a/N continuous=b/N gold_incomplete=c rank1=x% mean_rank=y confusable=z
YUN <split> PER-VALUE binary=a/V continuous=b/V
YUN NOTE: only PC-EXACT is comparable to Yun et al. 2024 GPT-4 per-comparison exact match (65.5% binary / 48.7% continuous, TEST split)
```

JSON summaries and per-licence summaries include all three metrics; per-item diagnostics include
`pc_exact` and `per_value` alongside the historical recall status. Zero denominators are printed as
0/0, not as a success rate. Candidate burden uses items with extraction results; missing-text/error
counts are reported separately and still contribute failures to metric denominators.
