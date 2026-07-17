# The answer-key yield: 9.5% in my sample, ~31% in the corpus — and the gap is the finding

> **CORRECTION, added after the corpus-wide scan (2026-07-17).** The 9.5% below is
> real but it is **NOT the corpus rate**, and I published it as though it bounded
> the programme. It does not.
>
>     my sample (137 figures, priority-ordered) :  9.5%
>     corpus projection (16,830 forest figures) : 30.9%  [19.9%, 45.0%]
>     projected productive figures              : 5192   [3344, 7576]
>
> **Why the gap: I read malaria and TB first, by instruction, and those are the ~2%
> shape.** 74% of my sample was malaria+TB (46+56 of 137). The corpus is not 74%
> malaria+TB. **My denominator was the dispatch order, not the corpus** — the
> prioritisation instruction manufactured the pessimistic number, and I then
> reported that number as a property of the corpus.
>
> Both figures are correct for their denominators. The gap between them IS the
> selection effect, and it is more useful than either number alone.
>
> **The answer key IS reachable.** ~5,200 productive figures exist, concentrated in
> RevMan-tier papers (6,978 figures at a 68% productive rate). What is NOT reachable
> is an answer key built out of malaria and TB — see the per-disease section.
>
> The sections below are preserved as written, including the claim this correction
> overturns. That is deliberate: the reasoning that produced a wrong headline is
> worth more on the record than a silently-fixed doc.

## ORIGINAL (superseded headline, preserved): the answer-key yield is 9.5%

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

---

# The pre-filter: a toolchain signature, read from text, at zero vision cost

`figscan` typed all 137 of these identically as "forest". It cannot see the axis
that determines their entire value. The productive shape has a **publisher/
toolchain signature**, and the toolchain **names itself in the methods text** —
which is already on disk as cached JATS. No vision call is needed to decide
whether to spend a vision call.

Probe: regex over `data/cache/<PMCID>.xml` for `RevMan|Review Manager`,
`Comprehensive Meta-Analysis`, `Stata|metan|metaprop|StataCorp`,
`metafor|netmeta|meta package`. XML available for **137/137** labelled papers and
**5353/5353** corpus papers — coverage is not a constraint.

## Validated against the 137 labelled figures (18 productive / 119 barren)

    rule                              TP  FP  recall  recall 95% CI   prec  calls
    RevMan only                       13   6     72%  [49%, 88%]       68%   19/137
    RevMan OR CMA                     13  12     72%  [49%, 88%]       52%   25/137
    NOT Stata                         15  59     83%  [61%, 94%]       20%   74/137
    RevMan OR CMA OR not(Stata|R)     16  44     89%  [67%, 97%]       27%   60/137
    no filter                         18 119    100%  [82%, 100%]      13%  137/137

## USE IT AS A PRIORITY ORDER, NOT A GATE — the tradeoff dissolves

The brief framed this as asymmetric: a false negative "discards a productive
figure forever". **It does not have to.** The figure stays on disk; a filter that
*ranks* rather than *gates* loses nothing, because the tail is still read later.

    recall  = 100% by construction (nothing is discarded, only deferred)
    precision = how fast you climb the yield curve

So there is no recall/precision tradeoff to tune — only a queue to sort. Read
T1 first, then T2/T3, then T4. If the budget runs out before T4, the deferred
figures are the ones with a ~3% yield, which is the correct thing to run out of.

## Corpus-wide tiering (16,830 forest figures, 5,353 papers)

    tier                    figures   labelled rate   projected productive
    T1 RevMan                  6978     13/19  68%    4774  [3210, 5905]
    T2 CMA                     1178      0/6    0%       0  [   0,  459]
    T3 no toolchain named      3221      3/35   9%     276  [  95,  720]
    T4 Stata/R only            5453      2/77   3%     141  [  39,  489]
    ------------------------------------------------------------------
    TOTAL                     16830                   5192  [3344, 7576]
                                          overall yield 30.9% [19.9%, 45.0%]

**Read T1 and you reach ~92% of the corpus's productive figures for 41% of the
calls.** That is the whole prize.

Note T2: CMA *without* RevMan is 0/6 productive. Earlier the raw CMA signal looked
positive only because those papers also mentioned RevMan; the hierarchy resolves it.

---

# The corollary, tested: malaria and TB are concentrated in the barren shape

    topic       n  productive   rate 95% CI       single-arm (lower bound)
    malaria    46      1         2.2% [ 0%, 11%]   12 (26.1%)
    TB         56      1         1.8% [ 0%,  9%]   20 (35.7%)
    NCD        27     14        51.9% [34%, 69%]    0 ( 0.0%)
    other       8      2        25.0% [ 7%, 59%]    0 ( 0.0%)

    Fisher exact, malaria+TB (2/102) vs NCD (14/27): p = 9.9e-10

**This is not sampling noise and it is not a failure of ours.** It is a property of
the evidence base: OA malaria and TB meta-analyses are dominated by **single-arm
prevalence pooling** — drug-resistance marker prevalence, LTBI prevalence,
insecticide-resistance bioassays — not comparative trial synthesis. A single-arm
proportion plot prints `Events | Total` for ONE arm. There is no 2x2 in it, at any
resolution, for any reader.

**This is a candidate explanation for the standing TB=0**, and it reframes it: the
OA constraint bites hardest exactly where the programme cares most. Malaria/TB
comparative RCT evidence is not absent from the world — it is absent from the
*open-access meta-analysis figure* corpus we can read.

Caveat: `single-arm` is a LOWER BOUND. `comparator_present` only exists from prompt
v3, so pre-v3 reads report None and are not counted.

---

# The inversion: most of the "barren" 74.5% needs mathematics, not pixels

    A. complete 2x2                     13  ( 9.5%)
    B. complete continuous               5  ( 3.6%)
    C. effect+CI, no per-arm counts     93  (67.9%)   <- conversion-layer input
    D. no effect+CI either               2  ( 1.5%)
    no study rows (netmeta/states/etc)  24  (17.5%)

Category C holds **1,492 study rows**, 98.9% with a named measure. IV pooling needs
effect + SE, and **SE comes from the CI — N is not required**:

    study rows with effect + both CI bounds : 1757
      -> SE derivable, poolable NOW         :  626   (6.1x the 102 rows from 2x2s)
      -> measure not on a known scale       : 1124
      -> ratio measure w/ non-positive CI   :    7

So the binding gap for those 1,124 rows is **the measure name, not the pixels** —
and the measure is stated in the paper's text we already hold. Of them:
751 are pre-v3 reads with `comparator_present` unknown, 352 are single-arm
proportions (a different object — poolable as prevalence, never a comparative
contribution), and 21 are comparative with the measure unnamed on the figure.

**"Barren" was the wrong word for category C.** It is convertible, and the
conversion costs zero vision calls.

## Limits

- 137 figures, and the priority order was malaria -> TB -> NCD -> other, so this is
  **not a random sample of the corpus**. The true corpus-wide yield could differ.
  It is, however, the only measured yield that exists.
- The 9.5% is a yield of *figures*, not of *clusters*. Mapping contributing PMCIDs
  to tournament clusters has not been done here and would change the arithmetic.
- Nothing here measures whether the 102 banked 2x2 rows are CORRECT. They are
  `ANSWER_KEY`-role and held out of any recovery numerator by construction.
