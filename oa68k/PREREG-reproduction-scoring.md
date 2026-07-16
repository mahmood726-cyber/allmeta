# PRE-REGISTRATION — reproducing published OA meta-analyses
**Frozen 2026-07-16, BEFORE any reproduction is scored.** METHODS-CONTRACT §1.
Target corpus: the **68k OA metas** (Mahmood: "only open access ones I meant").

## 0. Prior art — EXTEND, do not rebuild (§0)

`C:\Projects\RECONSTRUCTION-LOOP-2026-07-13.md` **already implements this loop**:
6 components (PICO→SEARCH→SCREEN→EXTRACT→RECOVER→POOL) with per-component failure
attribution; a pre-registered split locked before tuning
(`sha256(review_id)%10<3` → TRAIN 323 / TEST 178, file on disk at
`allmeta-est-v3/truth-recovery-bench/reconstruction_split_2026-07-13.csv`); and 2/2
held-out reviews reproduced within CI (CD009298: ours **0.935 [0.827,1.058]** vs
published **0.92 [0.81–1.04]**, Codex-confirmed to 4 dp).

**Its §8 blocker #1, verbatim:** *"wire the loop to bulk APIs … This is the gate on
every headline number. Until then the rate is n=2."* **This lane opened that gate**
(~42k OA metas cached as JATS, 480/min). So: point the existing loop at the corpus.

**One scope change, in our favour:** that loop targets Cochrane/Pairwise70, whose §9
says redistribution is **BLOCKED pending Cochrane/Wiley ToU**. The OA corpus has no
such block, and is 68k rather than 501.

Also to read before writing anything new: `cochrane-vs-registry/PREREGISTRATION.md`,
`PREREG-SCALE.md`, `OA-META-AUDIT-2026-07-14.md`, `EXTRACTION-BAKEOFF-2026-07-13.md`,
`RAPIDMETA-AS-CORPUS-2026-07-13.md`.

## 1. ⭐ THE PRIMARY METRIC (one, stated before looking)

> **PRIMARY: cell recovery on the meta's pooled set.**
> Of the 2×2 cells the published meta actually pooled for its **primary outcome**,
> what fraction do we independently recover from open sources?
>
> `recovery = |cells we recover| / |cells the meta pooled|`

**Pre-specified success: ≥70%** (Mahmood: "even 70 percent is fine"). Frozen here so it
cannot drift after seeing results (§2). Reported per meta, then as a distribution —
never as a single corpus average hiding the spread.

**SECONDARY metrics** (reported, never promoted to primary):
- **S1 pooled-estimate agreement:** our pooled effect vs theirs, on the **declared
  effect measure** — pre-stated tolerance: point estimate within **±0.10 on the log
  scale** AND same direction AND our CI overlaps theirs. *(The measure must be typed
  and carried: the reconstruction loop measured OR 0.846 vs RR 0.935 for the SAME
  review — a scale artefact, not a discovery. Same family as the NMA lane's OR-vs-HR.)*
- **S2 trial-set overlap:** |shared| / |their set|.
- **S3 primary + ONE secondary + AEs only.** Extracting every outcome is work nobody
  needs and is paid for in throughput.

**Denominator rule:** the denominator is **what the meta pooled**, NOT every trial that
exists. Single-arm / dose-finding / PK / safety-only / subgroup / median-only trials
were never in anybody's forest plot; counting them inflates our own failure rate.

**Hold-out rule:** cells sourced from **forest-plot figures are the ANSWER KEY** and are
**never** in the recovery numerator. Recovery counts only cells obtained independently
from registry ∪ abstract ∪ OA full text (three-layer rule).

## 2. ⭐⭐ THE DECOMPOSITION (the core design; never collapse it)

Inclusion decisions are **partly unobservable** — eligibility judgement, language reach,
unpublished data obtained by writing to authors, companion-paper resolution, cluster and
crossover handling. So a set difference is **not** automatically our failure, and
reproduction alone does not disambiguate. Therefore:

> **Total difference = (A) extraction error on SHARED trials   [our bug]
>                    + (B1) OA gap — they had it, we can't reach it   [our cost]
>                    + (B2) their omission — we find it, they missed it
>                    + (B3) their CONTAMINATION — they pooled what their own rule excludes
>                    + (C) method difference**

**Each term is reported separately, per meta. Reporting a single "we differ by X%" is
forbidden** — that is exactly how the NMA lane got lost (diverged from published NMAs,
could not tell discovery from defect; it was neither).

### (A) Extraction error on SHARED trials — **the only term that is our bug**
For trials **both** we and the meta include: do we get the **same 2×2**?
- Fully observable, and the clean diagnostic of our extraction.
- **Compare like with like FIRST.** Precedent: raw divergence median |log-OR| 0.9 looked
  like error; on **strictly comparable** cells agreement was **9/9**, genuine error
  **0/90**. Read set differences as extraction failures and you condemn a working
  pipeline.
- Pre-specified: **exact** (integer match) / **within-tolerance** / **fail**.

### (B) Trial-set difference — **NOT noise; this IS the finding**
Split in **both** directions, always:
- **B1 — they included, we cannot reach** → the **open-access gap, measured**. These are
  the trials "hidden and not easily seeable" — precisely the ones a Kampala researcher
  also cannot reach. **This is the honest cost of the open-source constraint, measured
  rather than assumed.** It is the single most mission-relevant number in this lane.
- **B2 — we find, they missed** → a **meta omission**; their search failed. A defect in
  the published record, and a real contribution.

### ⭐ (B3) Their CONTAMINATION — trials they pooled that their OWN rule excludes

**Matching a contaminated meta means reproducing its mistake.** If a meta pooled a
phase-1 trial into a phase-3 efficacy question, **our failure to include it is us being
right**. So part of the 30% shortfall permitted by the 70% tolerance may be **us being
correct, not us falling short** — and that must be counted separately, never as our loss.

**Why registry-first earns its keep here — the sharpest instance of the thesis:** the
**paper often does not state phase clearly**, so a reviewer working from PDFs must judge
it by hand, one trial at a time. **AACT carries `phase` for every NCT**, plus
`eligibilities` (criteria, min/max age, gender) and `conditions`. So we can detect
contamination **the meta-analysts themselves could not easily see**. Invisible from
inside one review; visible across 68,000 — corpus-as-instrument, and cheap: we already
hold the JATS, the NCT links, and the AACT snapshot.

#### ⚠️⚠️ THE FALSIFIABILITY GUARD — load-bearing; without it this is worthless

**We may NOT call an inclusion an error after seeing that we differ.** That is post-hoc
rationalisation and would let us explain away every shortfall as "they were wrong" — the
exact trap §1 exists for. Therefore, **in this fixed order**:

1. **Extract the meta's OWN stated inclusion criteria** from its methods section
   (phase, design, population, comparator) — **BEFORE** any divergence is computed.
   Store it, frozen, per meta, at ingest.
2. **Judge the meta against its own rule, not ours.** A meta that says "we included
   phase 2 trials" and then does so is **NOT contaminated** — it is transparent. That is
   fair, falsifiable, and much harder to argue with.
3. Only then compare its pooled set to its own stated rule.

**Two categories, counted separately — never merged:**
- **B3a CONTAMINATION** — pooled trial **violates the meta's own stated criteria**
  (e.g. methods say "phase 3 RCTs of efficacy", AACT says the pooled trial is phase 1).
- **B3b DECLARED BROAD INCLUSION** — the meta explicitly says it includes phase 2 (or
  the broader population) and does. **Defensible. Not an error. Not counted against them.**

#### The test that decides whether this is a finding or trivia
**Does contamination move the answer?** Re-pool each meta **without** the B3a trials and
measure the shift in the pooled estimate.
- A contamination *rate* nobody cares about is trivia.
- A contamination rate that **moves pooled estimates** is a finding.
Pre-specified: report the distribution of |Δ log-effect| after removing B3a trials, and
the fraction of metas whose direction or significance changes. **State the result
whichever way it lands** (§17) — including "contamination is common but moves nothing",
which would be a real and publishable negative.

### (C) Method difference — interpretable ONLY after A, B1, B2, B3 are quantified
Model (FE/RE), estimator (DL/REML/PM/MH), continuity correction, effect measure.

## 3. Reproduce FIRST, then perturb

Only once a meta reproduces do we swap as-published inputs for **registry-first** inputs
and measure the movement — then it is **attributable**. Without reproduction a
difference is uninterpretable noise. (This is why the loop is ordered this way.)

## 4. Refutation criterion (stated before looking)

- **Primary recovery <70%** on the pre-registered held-out sample ⇒ the open-source
  reproduction claim is **not met**; report it plainly, do not retune the threshold.
- If recovery is high but **(A) extraction error on shared trials is non-trivial**, the
  extractor is broken regardless of the headline — report that louder than the headline.

## 5. Sample & split

Reuse the **existing** pre-registered split discipline rather than inventing one:
deterministic `sha256(pmcid)%10<3` → TEST. Sample size fixed **before** running and not
extended after seeing results. malaria / TB / **NCD** reported separately; cells with
n<30 labelled "too small to interpret" and not interpreted.

## 6. The bound — carried into every writeup

**Reproducing a published meta is PARITY, not superiority.** It is the *precondition*
for a claim, not the claim. Parity on clean questions is what we already measured
(mirrored meta ≈ standard meta). Our edge is **verified provenance, harms surfacing, and
registry-first input checking** — never "more cells". Do not let a good parity number be
written up as a win it isn't.

---

# ⭐ REFRAME (2026-07-16) — B3 becomes a SPECIFICATION CURVE, not a charge sheet

**Mahmood:** *"metas are done by HUMANS. This explains why they did what they did. We
should be robust."*

If inclusion is a human judgement made under an over-inclusion pressure, the response is
**not to catch reviewers out** — it is to build a synthesis whose answer does not depend
on those calls. **Don't adjudicate the choice; be robust to it.** The question changes:

> ~~"Did they include the right trials?"~~
> **"How much does the pooled answer move across the full space of DEFENSIBLE inclusion sets?"**

- **Stable across every defensible set** ⇒ the human judgement did not matter; the result
  is robust. **Reassurance the field cannot currently give, and nearly free for us.**
- **Answer flips** ⇒ the conclusion is an artefact of inclusion decisions. A stronger and
  far less accusatory claim than "contaminated": *here is the space of choices you faced,
  here is where your answer sits in it, here is how much it depends on a call that could
  reasonably have gone the other way.*

**Structural advantage, precisely stated:** a human reviewer can run ONE inclusion set.
We can run thousands. The multiverse is prohibitively expensive by hand and nearly free
here. It is also Mahmood's standing §12 rule ("model it 1000 times in each arm") applied
to *inclusion decisions* rather than to parameters.

## Citations — VERIFIED against Europe PMC, not recalled (§13)

- ✅ **CONFIRMED, exact:** Steegen S, Tuerlinckx F, Gelman A, Vanpaemel W. "Increasing
  Transparency Through a Multiverse Analysis." 2016:702–712. **PMID 27694465**,
  **DOI 10.1177/1745691616658637** (Perspectives on Psychological Science). Matches the
  attribution given.
- ⚠️ **NOT VERIFIED — do not cite yet:** "Simonsohn, Simmons & Nelson — specification
  curve analysis." A `TITLE:"Specification curve analysis"` search returned 27 hits, but
  the canonical Simonsohn/Simmons/Nelson paper did **not** surface in the top results
  (they were unrelated 2026 applications). The method is real and widely used; the
  **specific reference must be pinned before it is cited.**
- ⚠️ **PARTIALLY VERIFIED — attribution imprecise:** "Ioannidis & Patel — vibration of
  effects." Patel CJ and Ioannidis JP **do** co-author VoE work — e.g. Klau S, Hoffmann S,
  Patel CJ, Ioannidis JP, Boulesteix AL. "Examining the robustness of observational
  associations to model, measurement and sampling uncertainty." *Int J Epidemiol*
  2021:266–278, **PMID 33147614** — but as **co-authors, not first authors**, and this is
  not the originating VoE paper. **Pin the original before citing.**

## ⚠️ The real critique, answered in the design

A multiverse containing **indefensible** specifications yields a meaninglessly wide range
and proves nothing. So the space is **restricted to defensible choices**, bounded by
**BOTH** the Cochrane Handbook **AND** the meta's own stated criteria.

"Defensible" is itself a judgement ⇒ recursive. But it is **bounded** and
**pre-specifiable**: the space is defined **BEFORE** looking at results (§1), frozen, and
every boundary decision is logged in `DEPARTURE-LEDGER.md` — including the direction it
moves our answer.

## ⚠️ Second honesty point (state it; do not let it be inferred)

**A wide specification curve is NOT automatically an indictment of the authors.** It may
simply mean **the evidence is weak** — which is itself true, useful, and clinically
actionable. **Report width as a property of the evidence, not a verdict on the authors.**

## What survives from the old B3

The **measurements** stand — they define the multiverse's axes, not a charge sheet:
phase 1/2 inclusion (AACT `phase`), population/eligibility mismatch (AACT `eligibilities`,
`conditions`). The **deliverable changes**: a specification curve per meta, not a
contamination rate. Same data, better science, harder to dismiss.

**Instrument limit, already measured and carried:** AACT `phase` is usable for only ~44%
of our linked trials (41% "NA" — non-drug/behavioural; 15% missing). The phase axis of
the multiverse is therefore **blind on ~56%** and must be reported as such.
