# The reject option came from the PLOT, not from the model's confidence

**Shard A, 2026-07-16.** Live `agent_read` vision over PMC forest plots.
Every number below is re-derivable from `data/visionstore/calls.shard-A.jsonl`
with `python shardA_report.py`. Nothing here is remembered.

## What we were sent to test

A text parser tested earlier was **47.1% wrong with every error emitted at
`confidence="high"`** — no gradient, therefore no reject option, therefore
unusable at any coverage. The hypothesis: *vision will abstain where the parser
confabulates, and that abstention is the finding.*

## What actually happened — the answer changed once resolution was controlled

At 465 rows the abstention rate was **0.00%**, and the one provable error was
emitted at `confidence: "high"`. That looked like "vision shares the parser's
failure mode."

At 1185 rows it is **2.19% (26/1185)** — and the structure of those 26 is the
whole finding:

    study rows banked          1185
    row-level abstentions        26        (2.19%)
    row confidence        high 1091 | medium 67 | low 1 | abstain 26
    per-field abstentions        67        (weight_pct 27, effect 26, ci_high 3,
                                            ci_low 2, year 6, label 3)

**All 26 abstentions come from ONE figure** (PMC12548209 `Fig2`, 778x540 px,
~5px digits). The worker who read it cropped and upscaled, and reported that the
digits **flip between upscale factors** — `6.36` vs `6.96`, `0.59` vs `0.99`,
`3.85`/`3.95`/`3.05`. It abstained on every per-study effect and weight, while
still banking the legible footer (model "Random-effects model", tau²=1.69, Q,
df=25 — which matches its own 26 counted rows).

**So the reject option exists, and it fires when the model engages with the
ambiguity.** The earlier 0.00% was not vision refusing to abstain. It was vision
never being given the chance to notice it could not see.

The failure mode is therefore **not** "vision never abstains". It is:

> **Vision reading at native resolution does not know that it cannot see.**
> 5px text does not present as uncertain — it presents as a plausible glyph, at
> `high`.

That is a harness defect that *manufactures* the parser's pathology, and it is
fixable (prompt v4 makes crop-and-upscale mandatory). The parser's 47.1%-wrong-
all-at-high has no such fix — it has no reject option at any input quality.

The one proven error (`n_c` 174 vs 149, at `high`) is a native-resolution digit
confusion — i.e. an instance of exactly this defect, not evidence that vision is
irredeemably overconfident.

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

## The confounder that reframes the 0% abstention rate: READ RESOLUTION

Two workers, unprompted, reported the same thing — and it changes how the
abstention number should be read.

- One (PMC12028635 `g005`): τ² renders as **`28.2566` at native resolution**; a
  6x crop resolved it to **`26.2566`**. Their words: *"this is exactly the digit
  a parser emits at confidence=high."*
- Another (PMC12402402, three figures): *"All three BRB3 images pack 2–8 panels
  into ~700px-wide JPEGs (~5px text). I cropped each panel and 4x LANCZOS-upscaled
  before reading. A pipeline that feeds these at native size is reading noise —
  worth checking whether other shards did."*

**Workers were not told how to read.** Some cropped and upscaled; some read at
native size. So `read resolution` is an **uncontrolled variable across this run**,
and it is plausibly the dominant one:

- The one proven misread (`n_c` 174 vs 149) is a native-resolution digit
  confusion, emitted at `high`.
- The workers who cropped are the ones who *caught* ambiguous digits — and
  produced abstentions instead of confident wrong answers.

**This makes 0.00% abstention uninterpretable as a property of vision.** It is a
property of *vision-at-whatever-resolution-each-worker-chose*. A model reading
5px text does not experience uncertainty; it experiences a plausible glyph. That
is precisely the parser's failure mode, and it may be an artefact of the harness
rather than of the model.

**The abstention measurement must be redone with resolution controlled** — read
the same figures at native size and at Nx crop, compare. Until then, no
abstention rate from this run should be quoted as a property of vision. Recorded
here rather than quietly dropped, because the headline "vision doesn't abstain
either" is only half true: *vision reading noise* doesn't abstain. Whether *vision
reading legible pixels* abstains is not yet measured.

Prompt v4 makes crop-and-upscale mandatory for any ambiguous digit and requires
the worker to record how it read. That fixes future waves; it does not
retroactively fix the 64 figures already banked, which is why this section exists.

## A schema smell found by a false alarm: `null` is overloaded

A worker flagged another worker's file — `weight_pct: null` on two study rows in a
figure family that prints a Weight column — as a null/abstain conflation breaking
a checksum. **It was a false positive**, and the reason is instructive.

The accused file was correct: `weight_pct: null` **with**
`field_confidence.weight_pct: "abstain"`. Value slot empty, reason recorded. The
reporting worker read only the value and could not see the reason.

Checked against the pixels (PMC11201327 Fig17): the figure **prints a `% Weight`
column header and no weight values at all**. So neither code cleanly fits — this
is a third state, *"column declared, values absent"*, and the contract only offers
"never printed" and "printed but unreadable".

Two things follow:

1. **`null` is overloaded.** It means "publisher never printed it" AND "model
   abstained", separable only by reading `field_confidence`. Any consumer joining
   on `weight_pct` alone cannot tell a publisher's omission from a model's
   refusal — the exact distinction this run exists to preserve. `shardA_report.py`
   counts them separately and is safe; a naive consumer is not. A dedicated
   sentinel (or a `value_state` field) would fix it at the source.
2. **A worker reviewing another worker's output reached a confident wrong
   conclusion from a partial view of the schema** — the same failure mode we are
   studying in the parser, one level up. It was caught by opening the image. That
   is the only thing that ever catches it.

(Aside, registered in the error register rather than here: that figure pools k=2
studies with ORs of 3.09 and 0.41 into 1.12 [0.15, 8.04] at I² = 98.3%.)

## Test-retest: two independent reads of the same figures agreed on EVERY digit

A duplicate assignment (before the reservation log closed that hole) produced an
accidental but clean experiment: the same two figures read twice, independently,
under different contracts (v3 native-ish, v4 crop-mandated), the second worker
reading the pixels **before** opening the first's file.

    agreement on every digit      tau2=0.12, Q(10)=6278.57, all 22 effects/CIs/
                                  weights, three negative-zero limits
    both abstained                on the SAME two rows
    both flagged                  the SAME two anomalies
    crops corrected               NOTHING on these two figures

**Vision is self-consistent on legible pixels.** That matters for interpreting the
`n_c` 174/149 misread: it was not random noise from a stochastic reader, it was a
deterministic artefact of being shown unreadable input. Same conclusion, sharper —
the defect is in what we hand the model, not in the model's steadiness.

**And it bounds the v4 claim honestly.** These were 794px Stata renderings with
~8px text: legible at native, and cropping changed nothing. v4 is not uniformly
necessary. It earned its keep on the *other* two figures in that batch, where a
~5px `NOTE: Weights are from random-effects model` line is illegible at native
and is **the only thing licensing that figure's `model` field**. So: crops are
cheap insurance whose value is concentrated on the figures that need them, and you
cannot know which those are without looking. Mandating them is still right; the
blanket claim "native reading is unreliable" is not — it is unreliable *below a
legibility threshold*, and above it vision replicates exactly.

## A third cause of unreadability that no upscale fixes: OCCLUSION

The two abstentions above are not a resolution failure. PMC13141270 Fig3 rows
Heuchert 2015 and Abera 2021 print `?.00 [ 1.00, 1.00]` with the navy diamond
marker drawn **on top of** the leading digit. The worker escalated to **12x** to
test the cause: the glyph is physically covered. No upscale recovers a pixel the
publisher painted over.

`[1.00, 1.00]` makes `1.00` the only coherent value — and both workers abstained
anyway, because that value is derivable **only from its own CI**, which is
inference, not reading. This is the discipline working: a defensible guess is
still a guess.

**This is the cleanest discriminating case in the run.** A parser reading `.00`
will emit `0.00` at high confidence. Vision, twice, independently, refused. So the
abstention taxonomy is at least:

    resolution   fixable by cropping (tau2 28.2566 -> 26.2566)
    occlusion    IRREDUCIBLE — the datum is not in the image at any zoom
    absence      never printed (a null, not an abstain)

Only the first is a harness defect. Conflating them would let a fixable problem
hide inside an unfixable one.

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
