# Scoring protocol for the open-access head-to-head

**Status: FROZEN. Written and committed BEFORE a single pair was judged.**
**Date written: 2026-08-31 · Depends on: `oa68k/OPEN-COMPARATOR-PROTOCOL.md` (frozen `fe1f2fd`), `oa68k/OPEN-COMPARATOR-RUN1.md` (frame at `4708684`).**

Implementation `oa68k/opencompscore.py`; checks `oa68k/tests/test_opencompscore.py`;
planting driver `oa68k/opencompscore_plant.py`. **No judge has been called.**

---

## ⛔ 0. The join is not mine and this protocol never touches it

Mahmood holds 22 / 12 / 8. **Nothing here picks one.**

The scored run judges the **union — all 23 paper–topic pairs admitted by the frozen
rule** — and every pair carries `join_tiers`, listing which of the three joins admits
it. The choice is therefore a **filter applied to the finished verdict file**: no
rebuild, and no re-run either. The property that makes this possible —
`overlap_detail[topic].key_used`, which records *which key produced every trial-level
match* — is carried through untouched into every pair row.

Judging the union costs more than judging 8. That is the price of keeping his decision
free, and it is worth paying once.

---

## ⛔ 1. What run 1 got wrong, and the structural fix

In run 1 the criterion `AT2` failed **6 of 6** because Cochrane never enumerates its
included studies. That is not a low score. **It is an unsatisfiable criterion, and an
unsatisfiable criterion reported as a failure is a measurement of the rubric, not of
the review.**

⚠️ **I could not find run 1's criterion definitions on this machine.** I searched the
repo's documents and the whole of `F:\claude-temp\pend` for `AT`-prefixed identifiers
and found none. So the criteria below are written fresh and **the identifiers do not
correspond to run 1's**. If Mahmood has the run-1 list, re-keying to it is a rename,
not a rewrite — but I am not going to invent continuity I cannot verify.

**The fix, applied to every criterion below:**

1. Each criterion states, in its own text, **what makes a side structurally unable to
   satisfy it**, and that case resolves to a named `NOT_SCOREABLE_*` state — never to
   a failure.
2. `NOT_SCOREABLE` is not a bad score, is not counted as one, and is reported by
   reason and by count so the reader can see how much of the rubric never applied.
3. Two criteria are **selected on** by our own frame's rules (§3). They are reported
   and **excluded from the headline**, because a criterion whose value was fixed by an
   inclusion rule measures the inclusion rule.

---

## ⛔ 2. The conflict of interest, stated first

**We wrote the reviews and we are writing the rubric.** That is the single most
attackable thing about this comparison and no amount of care removes it. Four
mitigations, all pre-committed:

1. **The rubric is anchored to an external standard.** Six of the eight criteria cite
   a **PRISMA 2020 item number**. The one that does not (`S4`) is marked as ours, in
   the criterion, rather than dressed up as a standard.
2. **Blinding.** Both sides are rendered into one common dossier format with identical
   section headings; the judge sees `SIDE_A` / `SIDE_B` with order set by
   `sha256(pair_id)` parity — deterministic, recorded, no RNG.
3. ⭐ **A blinding control runs FIRST and its result gates everything after it.** On a
   pre-drawn sample of pairs the judge is asked only *"which side is machine-generated,
   and what gave it away?"* If it identifies our side above chance, the comparison is
   **not blinded**, and every criterion result afterwards is a measurement of format.
   That control is step 0 of the run, not an afterthought, and its result is published
   whichever way it falls.
4. ⭐ **Our reviews were built by Claude (Anthropic family), so an Anthropic judge is
   grading its own family's output.** `judge_family` and `our_side_built_by` are
   recorded on every verdict; the primary analysis is **stratified by judge family**;
   **the Anthropic stratum is never pooled into the headline.** If all three families
   agree, the confound cannot explain the agreement. If only Anthropic favours us,
   *that* is the finding.

⚠️ This measures **reporting completeness against a fixed rubric**. It does not measure
which review is more useful, more correct, or better. Nothing in the output may be
worded as if it did.

---

## 3. The criteria

Every criterion is judged from **what a reader can recover from the published
artefact** — never from format, file type or machine-readability, because our side
ships JSON and the comparator ships a paper, and a criterion that rewards the format
would measure the format.

### Counted in the headline — six

| id | question | anchor | a side cannot satisfy it when… |
|---|---|---|---|
| **S2** | Is the pooled quantity named to the level of population, intervention, comparator, outcome, **effect measure** and **timepoint**? | PRISMA 2020 items 5, 20b | never structurally — both sides can always state their estimand |
| **S3** | For **each** included study, are the numbers feeding the pooled estimate recoverable (arm events/N, or effect + interval)? | PRISMA 2020 item 19 | the study list itself is absent → `NOT_SCOREABLE_NO_STUDY_LIST` |
| **S4** | Can the headline pooled estimate be **recomputed** from the published per-trial inputs, to within the tolerance the review itself implies? | ⚠️ **OURS, not PRISMA.** No PRISMA item demands recomputability. Declared as our own criterion. | S3 unsatisfied on that side → `NOT_SCOREABLE_INPUTS_ABSENT` (never a failure) |
| **S5** | Is heterogeneity quantified (τ² or I²) **with the estimator named**, and for k≥2 is a prediction interval given or its absence justified? | PRISMA 2020 items 13e, 20c–d | k = 1 on that side → `NOT_SCOREABLE_SINGLE_STUDY` |
| **S6** | Are databases, dates **and at least one search string as executed** published? | PRISMA 2020 item 7 | the text defers to unretrieved supplementary material → `NOT_SCOREABLE_MATERIAL_NOT_RETRIEVED` |
| **S7** | Is risk of bias assessed **per included study** and reported **against the outcome that was pooled**? | PRISMA 2020 items 18, 20 | as S6 |

### ⛔ Reported but NOT counted — two, because our own rules fixed their values

| id | question | why it is not counted |
|---|---|---|
| **S1** | Does the review publish a list of the studies it pooled, sufficient to identify each? | **The comparator satisfies it by construction.** Enumeration was the *hard inclusion criterion* of the frame — nothing that failed it is in the population. Counting S1 would be scoring the selection rule. It is kept because **Cochrane's value on S1 is the published asymmetry** and this is where that number lives. |
| **S8** | Is there a prespecified protocol or registration, and are departures from it disclosed? | **Both sides' values are fixed, in opposite directions.** The comparator satisfies it by construction — a `CRD42` id was the frame's quality criterion. Our side **cannot**: every corpus SSOT carries `protocol.prespecified = false, permanently_refused = true`, on the stated ground that a protocol is a historical fact about the past and cannot be created retrospectively. Scoring S8 would report a declared policy and an inclusion rule as a quality gap. |

⭐ **I found both of these before freezing, by checking what each side can satisfy
rather than by running the rubric and reading the output.** A criterion that both
sides' selection rules have already decided produces a clean, monotone, entirely
artefactual result — and it would have been the most quotable number in the report.

⚠️ **S8's asymmetry is real and is not a scoring artefact — it is a finding, reported
in prose:** the comparators are prospectively registered and our reviews are not. A
reader is entitled to weigh that. It is excluded from the *score* because the score
would double-count our two selection rules, not because it is unimportant.

### The rule that catches the retrieval trap one layer up

**If the retrieved full text explicitly defers a criterion's evidence to material we
did not retrieve** — "see Supplementary Table S1 for the full strategy" — the verdict
for that side is **`NOT_SCOREABLE_MATERIAL_NOT_RETRIEVED`**, never a failure. Europe
PMC's `fullTextXML` does not carry supplementary files, and our side has no supplement
at all, so this hazard is **one-sided against the comparator** and would silently
manufacture wins for us on S6 and S7. This is `RETRIEVED_NO_VALUE` vs
`NOT_RETRIEVED_*` again: *"we could not see it"* is not *"it is not there"*.

---

## 4. ⛔ Every label is gated against its own free-text finding

A bare label is not checkable. The judge returns, per criterion:

```json
{"criterion":"S3",
 "a":{"satisfied":true,"quote":"...","absence_checked_in":null},
 "b":{"satisfied":false,"quote":null,"absence_checked_in":["Methods","Results","Tables"]},
 "label":"A_BETTER",
 "reason":"free text, >= 120 chars"}
```

### Gate 1 — the label must be DERIVED, not asserted

`label` must equal `f(a.satisfied, b.satisfied)` exactly:

| a | b | required label |
|---|---|---|
| true | false | `A_BETTER` |
| false | true | `B_BETTER` |
| true | true | `TIE_BOTH_SATISFY` |
| false | false | `TIE_NEITHER_SATISFIES` |
| either `NOT_SCOREABLE_*` | — | `NOT_SCOREABLE` |

Mismatch → **`DISCARD_LABEL_CONTRADICTS_ITS_OWN_FINDING`**. The discarded record keeps
the label, both sub-findings and the full reason — a discard that throws away its
evidence costs a whole re-run to diagnose.

`TIE_BOTH_SATISFY` and `TIE_NEITHER_SATISFIES` are kept apart. "Both good" and "both
absent" are different facts and one summary word for them would hide half the result.

### Gate 2 — a quote must be in the bytes the judge was shown

When `satisfied` is true a quote is **required**, and it must appear in that side's
payload after normalisation (tags stripped, whitespace collapsed, casefolded).

⭐ **Checked against the WHOLE payload, never against a window.** A prior harness
showed a reviewer `page_text[:26000]` and then gated the answer against the same
truncated slice, which converted true statements into recorded fabrications at an 82%
discard rate. Here the payload is **sectioned, never cut** — `opencompscore.py`
asserts the sections reassemble to the exact original length — and the gate runs
against the union of all sections.

Failure → **`DISCARD_QUOTE_NOT_IN_PAYLOAD`**, **storing the offending quote**.

When `satisfied` is false a quote is impossible in principle — you cannot quote an
absence — so `absence_checked_in` is required instead, naming the sections searched.
That is the difference between *absent* and *not shown*, made a required field.

### Gate 3 — payload identity is recorded, so raise-time and check-time cannot drift

Every verdict carries `sha256` of **each side's payload as shown**, plus the git commit
of our SSOT and the comparator's PMC id, fetch timestamp and retrieved-bytes hash. A
verdict with no payload hash is refused. 95% of a prior adjudication corpus was judged
against artefacts that had changed since the finding was raised; one hash field is the
difference between an auditable corpus and an anecdote.

---

## 5. ⛔ Judge panel: pin the model, and read the pin back out

**Cross-family judging is compromised until proven otherwise, and it is not assumed.**

⭐ **Verified from disk this session, no quota spent:**
`C:\Users\mahmo\.gemini\antigravity-cli\settings.json` carries
`"model": "GPT-OSS 120B (Medium)"`. **agy's default is OpenAI-family — the same family
as Codex.** An unpinned agy call does not add a third family; it silently collapses the
panel to two and every "3-family agreement" computed from it is false.

Rules, all enforced by the harness before a verdict is counted:

1. **Pin explicitly on every call.** For agy the pin lives in `settings.json` (its
   `--print` mode ignores `--model`), so the file is written and re-read per call.
2. ⭐ **Read the pin back out of the artefact.** Each prompt requires the judge to
   state its own model and family; the harness asserts the returned string names the
   expected family. **A call that can only report "OK" is not a check.**
3. **Assert the artefact is non-empty.** An unpinned or unauthenticated call returns an
   empty artefact at `rc=0` that looks exactly like a judgement. Empty → `JUDGE_CALL_VOID`.
4. Any of {`rc != 0`, empty, model string absent, wrong family} → **`JUDGE_CALL_VOID`**,
   counted by reason, **never scored, and never silently retried into existence**.
5. If a family cannot be verified live, the panel is published as
   **`DEGRADED_TWO_FAMILY`** in the output. It is never described as three.

Expected families: `anthropic` (Claude) · `openai` (Codex) · `google` (agy pinned to a
Gemini model, or the separate `gemini` CLI on PATH — both present, neither yet proven).

⚠️ **No liveness probe has been run.** The standing rule is that a status file is not
liveness and only a real completion that names its own model proves a seat. The
settings file above is evidence about a *default*, not about whether any seat answers.
Probing costs quota, so I have stopped short of it and am asking rather than assuming.

---

## 6. ⭐ Prediction, on the record, before any pair is judged

**Primary pre-registered quantity:** across the six **counted** criteria, the
proportion of **scoreable** verdicts in which our review is judged better —
**median across the three judge families**, with all three published and the Anthropic
stratum shown separately and never pooled.

> ### I predict **45%**.
>
> Derived per criterion, from what each population publishes:
> S2 estimand **70%** · S3 per-trial inputs **15%** · S4 recomputability **35%** ·
> S5 heterogeneity + PI **65%** · S6 search strings **40%** · S7 RoB per outcome **55%**.
> Mean = 46.7%, rounded to **45%**.
>
> **Secondary: I predict `NOT_SCOREABLE` on 20% of counted verdicts**, mostly S6 and
> S7 deferring to supplements we did not retrieve.
>
> **Counts, stated separately from the rate because last time I confused the two.**
> 23 pairs × 6 counted criteria = **138** comparisons per family. At 20% not-scoreable
> that is ~110 scoreable, of which 45% ≈ **50 ours-better per family**. Under a 12-pair
> filter: 78 → ~62 → **~28**. Under 8: 48 → ~38 → **~17**.

**Direction of the miss, reasoned from the population and not from my last one:**

- **The rate: I expect 45% to be too LOW.** Two forces oppose each other. Our reviews
  were purpose-built for exactly these properties, which pushes it up; but the frame
  selected the *best-behaved* comparators in the literature — open-access, PROSPERO-
  registered, enumerating — which pushes it down. I judge the first force stronger
  **because I chose the criteria**, and I keep under-weighting that I am scoring a
  product built against a rubric that overlaps this one.
- **`NOT_SCOREABLE`: I expect 20% to be too LOW**, probably materially. Published
  meta-analyses put search strategies and risk-of-bias tables in supplements as a
  matter of course, and Europe PMC's `fullTextXML` does not carry them.
- **I predict the Anthropic stratum shows a HIGHER ours-better rate than the other two
  families.** If it does not, the self-family confound is smaller than I feared. If it
  does, the headline must be the median of the other two, and I am pre-committing to
  that now rather than deciding once I can see which way it helps.

⛔ **A zero, a 100%, or a unanimous criterion measures the instrument until proven
otherwise** — by hand-running one pair end to end and reading the payload, not by
inspecting the verdict file that produced it. Last time this rule turned a "0 eligible
comparators" into a regex that could not match any PROSPERO id that exists.

⚠️ **My last prediction missed low by 2.4× and I named its direction wrongly.** The
numbers above are not corrected for that, in either direction; leaning against a
previous miss only relocates the error.
