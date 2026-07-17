# The answer-key yield is 9.5%, not ~100% — measured on 137 figures

**2026-07-17, shard A.** Re-derivable: `python shardA_report.py` plus the query in
this doc's commit. Nothing here is remembered.

## The claim this tests

> "The answer key is forest plots. Forest plots are pixels. You are the only
> instrument that reads them. ⇒ **Every figure you bank moves the tournament's
> bottleneck.**"

The first three sentences are true. **The conclusion is not**, and the gap is
large enough to change the plan.

## Measured over 137 distinct figures banked tonight

    figures with >=1 COMPLETE 2x2 row      13   ( 9.5%)
    figures with >=1 complete continuous    5   ( 3.6%)
    figures with partial counts only       17   (12.4%)
    figures with NO per-arm data at all    102   (74.5%)

    study rows carrying a complete 2x2     102
    distinct PMCIDs contributing a 2x2       7   <- from 137 figures

    figure_kind: forest_generic 78 | forest_multipanel 32 |
                 forest_dichotomous 19 | forest_continuous 6 |
                 not_a_forest_plot 2

**Three quarters of forest plots print no per-arm data at all.** They print an
effect and a CI and nothing else. There is no 2x2 in those pixels to read — not
because the reading failed, but because the publisher never printed one. This is
the same fact `arith_na = 92.9%` reports at row level, restated per figure.

## Why this is the load-bearing number

If promotion is blocked at `frozen=20 < MIN_FROZEN=50`, the question is how many
figures must be read to add 30 frozen clusters. At tonight's measured rate:

    7 contributing PMCIDs / 137 figures  ~=  1 contributing paper per 20 figures

So **+30 clusters is on the order of 600 more figures**, not 30 — and that assumes
one cluster per contributing PMCID, which is optimistic. Reading more forest plots
does move the bottleneck, but at roughly a tenth of the assumed rate. A plan built
on "every figure moves it" will miss by ~10x.

**This does not say stop.** It says the estimate must carry the yield, and that
the cheapest win is not reading faster — it is **reading the right 10%**.

## The actionable lever: the 2x2-bearing figures are a recognisable subpopulation

The 13 productive figures are RevMan/Cochrane-style plots that print
`Events | Total | Events | Total` columns. The 102 barren ones are Stata `metan` /
R `meta` / `metaprop` / netmeta output printing only `ES (95% CI)` and a weight.

That is a **publisher/toolchain signature, not a topic signature** — and it is
invisible to `figscan`'s caption classifier, which typed all of these "forest".
Two consequences:

1. **A pre-filter is worth more than more workers.** If RevMan-style figures can be
   identified before dispatch — by journal (Cochrane reviews), by the JATS graphic
   filename convention, or by a cheap column-header probe on the cached raster —
   the yield per vision call rises ~10x. That is the single highest-leverage change
   available to this lane.
2. **Do not filter on topic.** malaria/TB/NCD priority does not predict 2x2 yield;
   the many single-arm prevalence meta-analyses in exactly those topics print
   Events/Total for ONE arm and yield nothing.

## Two traps that inflate this number if you are not careful

- **Single-arm proportion meta-analyses print `Events | Total`** and satisfy
  `forest_dichotomous` literally, while no 2x2 exists — there is no comparator.
  Counted here as non-yielding, correctly. A classifier keying on `figure_kind`
  alone would over-count them. (This is why `comparator_present` was added in
  prompt v3, on a worker's report.)
- **Percentage columns masquerade as counts.** PMC10863515 prints two per-arm
  numeric columns headed `Extended treatment duration %` / `Recurrence %` with no
  denominator anywhere. A parser keying on "two per-arm numeric columns present"
  banks those as a 2x2 and manufactures counts that were never printed.

## Limits

- 137 figures, and the priority order was malaria -> TB -> NCD -> other, so this is
  **not a random sample of the corpus**. The true corpus-wide yield could differ.
  It is, however, the only measured yield that exists.
- The 9.5% is a yield of *figures*, not of *clusters*. Mapping contributing PMCIDs
  to tournament clusters has not been done here and would change the arithmetic.
- Nothing here measures whether the 102 banked 2x2 rows are CORRECT. They are
  `ANSWER_KEY`-role and held out of any recovery numerator by construction.
