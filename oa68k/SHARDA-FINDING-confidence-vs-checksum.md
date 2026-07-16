# The reject option came from the PLOT, not from the model's confidence

**Shard A, 2026-07-16.** Live `agent_read` vision over PMC forest plots.
Every number below is re-derivable from `data/visionstore/calls.shard-A.jsonl`
with `python shardA_report.py`. Nothing here is remembered.

## What we were sent to test

A text parser tested earlier was **47.1% wrong with every error emitted at
`confidence="high"`** — no gradient, therefore no reject option, therefore
unusable at any coverage. The hypothesis: *vision will abstain where the parser
confabulates, and that abstention is the finding.*

## What actually happened

**Vision did not abstain either.**

    study rows banked            465
    row-level abstentions          0        (0.00%)
    row confidence          high 435 | medium 29 | low 1
    per-field abstentions          4        (ci_high 3, ci_low 1)

The one error we can *prove* was emitted at `confidence: "high"`, with
`field_confidence["n_c"] = "high"`. **The model's self-reported gradient gave no
signal on its own error.** On this evidence vision shares the parser's failure
mode. It does not rescue us from it.

That is the opposite of the hypothesis, and it is the honest result. n=1 detected
error is a weak sample and must not be dressed up as a rate — see Limits below.

## What DID provide a reject option: the plot's over-determination

A forest plot states the same quantity twice — as per-arm counts and as a plotted
effect + CI — and prints column totals. That redundancy is free, needs **no
external ground truth**, and it caught the error the model's confidence missed.

**PMC12602456, `BRB3-15-e71049-g002.jpg`, subgroup 1.1.1.** Extracted rows vs the
figure's own printed checksums:

    sum events_t  130 + 91 + 206 = 427   vs printed "Total events" 427   OK
    sum n_t       219 + 172 + 454 = 845  vs printed Subtotal N     845   OK
    sum events_c  113 + 79 + 181  = 373  vs printed "Total events" 373   OK
    sum n_c       227 + 174 + 398 = 799  vs printed Subtotal N     774   FAIL by 25

One field is wrong. Three candidate single-field fixes reconcile the column sum;
only one also reconciles all three printed effect estimates:

    HYPOTHESIS                      Michael D 2020   Christensen   Hill
    n_c 227 -> 202                  1.061 vs 1.19 X  1.165 X       ok      rejected
    n_c 398 -> 373                  ok               1.165 X       0.935 X rejected
    n_c 174 -> 149                  1.192 vs 1.19 OK 0.998 vs 1.00 0.998   ALL RECONCILE

**Unique solution: `n_c` = 149, misread as 174.** Not a published error — a vision
misread, localised to one field, with its true value recovered from the pixels'
own arithmetic. The digits `149`/`174` are a plausible confusion at this raster
size; the point is that we did not need to know that to catch it.

## The per-row tolerance alone would have missed it

`forestvision.check_row` uses a 0.15 log-scale tolerance. Against the *misread*
data:

    Christensen  printed 1.00  recomputed 1.165  delta 0.153  FAIL (just over)
    Hill         printed 1.00  recomputed 1.095  delta 0.090  pass  <- FALSE PASS

The Hill row was corrupted by the same bad `n_c` sum and **passed**. The failure
surfaced at 0.153 — three thousandths past the threshold. A slightly looser
tolerance and this figure reports clean.

**So the column checksums are the stronger instrument, and they are currently
unused.** Per-row arithmetic is a necessary-not-sufficient check, exactly as
`forestvision`'s own docstring says; this is a live demonstration at n=1 that the
"not sufficient" half is not theoretical.

## The instrument has a hard coverage ceiling

    arith_ok   56
    arith_fail  1
    arith_na  746   <- 92.9% of rows are NOT checkable

`arith_na` is **not a pass**. It means the plot printed no per-arm counts, so no
2x2 is recoverable and no self-check is possible. Measured field capture over 465
study rows:

    label     100.0%      effect     94.2%
    year       84.5%      ci_low     94.0%
    n_t        42.6%      ci_high    93.5%
    events_t   32.5%      weight_pct 74.6%
    n_c        29.0%      mean/sd    10.1%
    events_c   18.9%

The plots reliably print the *review's* conduct (every included trial named,
94% with an effect+CI, 75% with a weight) and mostly do **not** print the
*trials'* data. That asymmetry is the corpus's shape, not a gap in the reading —
it is why `BEHAVIOURAL_RECORD` is the role with coverage and `ANSWER_KEY` is the
role with a ceiling.

## Limits — stated so they are not lost downstream

- **n=1 proven error.** "Vision is confidently wrong" is the *direction* this
  points, not a measured rate. A rate needs the checkable subset to grow.
- **We only detect errors on the 7.1% of rows that are checkable.** The error
  rate on the other 92.9% is **unmeasured**, not zero. Any headline accuracy
  number computed over all rows would be measuring the wrong denominator.
- **Selection**: the checkable rows are exactly the plots that print counts —
  older/Cochrane-style RevMan output. They are not a random sample of the corpus.
- **The 0 abstentions may be a prompt artefact**, not a property of the model:
  these figures were largely legible at native resolution. The abstention rate on
  *hard* figures is not yet measured.

## What follows

1. **Implement the column-checksum check.** Printed "Total events" and Subtotal N
   are free, they caught what the tolerance missed, and they can *localise and
   repair* a misread rather than only flag the figure. Nothing consumes them today.
2. **Do not trust emitted confidence as a filter.** On the only error we can
   prove, it was `high`. Filtering on it would have kept the error and cost
   coverage.
3. **Never mutate the ledger with the repair.** The stored record is evidence of
   what the model *said*. `n_c=174` stays. The correction belongs in an analysis
   layer keyed on the same `image_sha256` — that is the whole reason raw is kept
   verbatim.
