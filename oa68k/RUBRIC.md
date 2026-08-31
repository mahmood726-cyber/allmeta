# The mechanical rubric — the LLM panel is removed from the scoring path

**Ruled by Mahmood, 2026-08-31: option 1.** **Status: published as code before any pair is
scored.** `rubric.py --score` **refuses**.

**Script:** `oa68k/rubric.py` · **version** `rubric-1.0.0-2026-08-31` ·
**sha256** `f887eec53d775aa62e5ea7fbcf3c2d675d654e4c371f89cdee764d33f65ef8c4`

The hash is stamped on every score row and in the result header. ⛔ **An unpublished
rubric is an LLM panel with extra steps.**

---

## Why the judge is gone — in the document, not in a chat

> **We argue our advantage is VERIFIABILITY, not authority. A panel of six models
> choosing us is exactly the kind of evidence a reader cannot check — the same thing we
> criticise Cochrane for. A published rubric, with both papers scored against it and the
> script available, is the version of this result that survives someone disagreeing with
> it.**

There is nothing to blind, because there is no judge.

---

## ⛔ METHODS — the blinding failure, stated here and not in a footnote

**An artefact that narrates its own construction cannot be blinded against one that does
not — we are identifiable because we carry the provenance that makes us checkable.**

Measured, not asserted. A pre-registered blinding control was run before any criterion:
**9/9 completed calls correct, one-sided p = 0.00195**, with **Anthropic 6/6 (p = 0.0156)
clearing its own pre-registered per-family test and depending on no voided call**. An
offline tell-check then scanned both sides of 12 pairs against a frozen marker list:
**every pair carried identifying markers on both sides**, and after normalisation the
residue — `self_reference` (935 hits), `pipeline_vocabulary` (288), `caps_emphasis` (160)
on ours; journal sections and *et al.* on theirs — did not strip. ⭐ **Normalisation
removed 831 of 175,878 characters: 0.5%. The tell is the prose, not the chrome.**

⛔ **The LLM-panel results are NOT deleted and NOT rewritten.** They stand as what they
are — real, log-verified, persuasive — and are **separately labelled as LLM-panel results
that a reader cannot reproduce**. Both go in the paper. Neither is disguised as the other.

⛔ **Sample B stays unspent and frozen. It is now evidence about our format, not a
resource.**

---

## The six criteria — unchanged, with their PRISMA anchors

⛔ **The rubric was NOT re-opened when the judge was deleted.** Changing the criteria at
the same moment as the scoring method would make both unfalsifiable.

Each entry states what the script tests **and what it does not**.

| id | anchor | the script's test | it does NOT test |
|---|---|---|---|
| **S2** | PRISMA 5, 20b | within one 900-char window: an intervention term, a population term, a comparator token, an effect-measure token and a timepoint token. Vocabularies are the ones **frozen in `OPEN-COMPARATOR-PROTOCOL.md` §5.2** — no new list is introduced. | whether the estimand is well *chosen*. That is judgement → NARRATIVE. |
| **S3** | PRISMA 19 | for **every** enumerated included study, arm events/total or an estimate-with-interval within 600 chars of its label. | whether the numbers are *correct*. |
| **S4** | ⚠️ **OURS, declared** — no PRISMA item demands recomputability | recover ≥2 per-study estimates and a stated pooled estimate; recompute; pass if the stated value matches **either** a fixed-effect inverse-variance pool **or** a DerSimonian–Laird random-effects pool within **0.05 on the log scale**. Which one matched is recorded. | which estimator the authors used — we cannot know, so matching either is the test. ⚠️ DL is used to *reproduce what a paper most likely did*, not because it is the estimator we would choose; for k < 10 it is biased and we say so. |
| **S5** | PRISMA 13e, 20c–d | a heterogeneity statistic with a number, **and** the estimator named, **and** (k ≥ 2) a prediction interval reported or its absence explicitly stated. | whether the heterogeneity was correctly *interpreted*. |
| **S6** | PRISMA 7 | a named database **and** a search date **and** ≥1 query **as executed** (boolean operators with a field tag or registry parameter). | whether the search was *adequate*. |
| **S7** | PRISMA 18, 20 | a named tool, **and** a risk-of-bias level within 400 chars of **every** study label, **and** an explicit outcome-level statement. | whether the risk-of-bias judgements are *right*. |

### `NOT_SCOREABLE_*` survives unchanged

`NO_STUDY_LIST` · `INPUTS_ABSENT` · `SINGLE_STUDY` · **`MATERIAL_NOT_RETRIEVED`** ·
`SOURCE_NOT_PUBLISHED` · `NO_PROTOCOL_EXISTS` · **`SURFACE_DISAGREEMENT`**.

⛔ `MATERIAL_NOT_RETRIEVED` still fires when a document defers to a supplement Europe PMC
does not carry. That hazard remains **one-sided against the comparator**, and refusing to
score is what stops it manufacturing wins for us.

### ⚠️ A weakness declared before the run, not after

**S3 and S7 are conjunctions over every study label.** A review with six studies must
satisfy the test six times. Conjunctions refuse more than intuition expects, and this is
the single most likely place for the rubric to be unfair — in the direction of
`NOT_SATISFIED` on both sides, which produces `TIE_NEITHER_SATISFIES` rather than a win
for anyone. It is recorded here **before** any pair is scored.

⛔ **If a criterion turns out badly designed, that is recorded as a finding and the score
stands.** No criterion is tuned after seeing how a pair scores.

---

## The evidence contract — this is the whole product

Every score row carries:

```
criterion · side · verdict · evidence{ file, offset, length, span } · rule_version · script_sha256
```

⭐ **A reader who disagrees with a score can point at the sentence.** The extracted text
files the offsets index into are published with the result (`page_*.txt`, `ft_PMC*.txt`),
so an offset resolves without re-running our extraction.

Pair-level labels use the **same `derive()` function the judge protocol used**, unchanged:
`OURS_BETTER` · `COMPARATOR_BETTER` · `TIE_BOTH_SATISFY` · `TIE_NEITHER_SATISFIES` ·
`NOT_SCOREABLE`. `TIE_BOTH_SATISFY` and `TIE_NEITHER_SATISFIES` stay apart — "both good"
and "both absent" are different facts.

### Self-test, on synthetic strings only — no pair touched

`python rubric.py --selftest` → **14/14 cases as specified**, exercising `SATISFIED`,
`NOT_SATISFIED` and the `NOT_SCOREABLE_*` path of every criterion, each printing the
evidence span it derived the verdict from.

---

## ⛔ NARRATIVE — recorded, explicitly NOT scored

These need judgement, so by the rule above they are not in the rubric. They are reported
as prose, marked unscored, and no number is attached to them:

- whether either review's **estimand is the right one** for the clinical question;
- whether the **search was adequate**, as opposed to reproducible;
- whether **risk-of-bias judgements are correct**, as opposed to present and per-outcome;
- whether **heterogeneity was interpreted sensibly**;
- **S1** (enumeration) and **S8** (registration), which our own selection rules already
  decided — the comparators satisfy both by construction, and our reviews declare
  `protocol.prespecified = false` as policy. ⭐ **The S8 asymmetry — *the comparators are
  prospectively registered and our reviews are not, permanently and by our own rule* —
  goes in the same section as the headline result, in the same breath as any win.**

---

## ⭐ Prediction, on the record, before the rubric runs

**Population: 12 pairs × 6 criteria = 72 comparisons.** (13 pairs under the ruled
`nct_pmid` join, less `iv-iron-hf` which the surface gate returned
`NOT_SCOREABLE_SURFACE_DISAGREEMENT`.)

⛔ **The old prediction does not transfer and is retired, not reused.** 45% and ~26
ours-better were made about a *judge panel*: a different instrument, a different
denominator (78, not 72), and a different meaning of "better" — a model's preference
versus a regex satisfying a stated rule. Carrying that number across would be dressing up
a guess as continuity.

> ### I predict **54 of 72 scoreable (75%)**, and **31 of those 54 favour us (57%)**.
>
> Built per criterion, 12 comparisons each:
>
> | | scoreable | ours better |
> |---|---|---|
> | S2 estimand | 12 | 5 |
> | S3 per-trial inputs | 10 | 6 |
> | S4 recomputability | 4 | 2 |
> | S5 heterogeneity | 12 | 8 |
> | S6 search string | 6 | 4 |
> | S7 risk of bias | 10 | 6 |
> | **total** | **54** | **31** |

**Direction of the miss, reasoned from this instrument and not from the last one:**

- **Scoreable: I expect 54 to be too HIGH.** S3 and S7 are conjunctions over every study
  label, and S4 needs three separate extractions to succeed at once. Conjunctions are
  exactly where I have over-estimated before, and a regex over a 175,878-character page
  and JATS-derived text will miss labels I am assuming it finds.
- **Ours-better as a COUNT: too HIGH**, mostly because it is a fraction of a denominator I
  have over-estimated.
- **Ours-better as a RATE among scoreable: I expect 57% to be roughly right or slightly
  LOW.** Our pages are enormous, dense and self-describing, which favours a
  presence-detecting rubric — and the comparators, having been selected for being
  registered, enumerating and open, are the well-behaved end of the literature.

⛔ **A zero, a 100%, or a unanimous criterion measures the instrument until proven
otherwise** — settled by reading the evidence span for one pair by hand, not by inspecting
the result file that produced it. That rule has now turned a "0 eligible comparators" into
a broken PROSPERO regex, and a "0 of 13 scoreable" into a mis-paired join.
