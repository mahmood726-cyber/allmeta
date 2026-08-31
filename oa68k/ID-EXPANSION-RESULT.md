# Widened ID frame + a second PROSPERO regex defect

**Criteria unchanged.** The only code change is a regex that could not match a real
identifier — see below. Frames: `opencomp_frame_cardiology.jsonl` (802 rows) ·
`opencomp_frame_id24.jsonl` (788 rows, 7,765,191 bytes, 26 contract fields, 27 provenance
keys). Nothing scored.

---

## ⭐ The number, as a pair, under the ruled join

| specialty | comparators | independent topics | pairs |
|---|---|---|---|
| cardiology | **12** | **4** | 13 |
| infectious disease | **2** | **2** | 2 |
| **combined** | **14** | **6** | **15** |

Under the frozen join the same frames give 25 / 5 and 2 / 2. **The ruled join stands.**

## The widening, scored against its prediction

| | predicted | measured |
|---|---|---|
| new eligible comparators | +2 (range 0–5) | **0** from the 12 added topics *before* the regex fix; **+1** after |
| new candidates | +300 to +450 | **+124** (664 → 788) |

Direction named **too high** — correct on both, for the third frame running. The added
topics are niche: nine of twelve returned fewer than 21 candidate records each
(`influenza-recombinant` 2, `lenacapavir-hiv` 2, `lenacapavir-prep` 2, `cvncov-covid19` 3,
`doravirine-hiv` 3, `delamanid-tb` 7).

## ⛔ A second PROSPERO regex defect — and it was caught by the audit field the first one made me add

PMID **41919720** — a Cochrane review of lenacapavir for PrEP — matched **2 of 2** on
`lenacapavir-prep`, was licence-open, and scored `prospero_registered = false` **while
carrying `CRD420251080791`** in `prospero_tokens_seen`.

**`CRD42\d{9}` cannot match it.** PROSPERO lengthened its identifiers in 2025: the id is
`CRD42` + **10** digits, not 9.

⭐ **The `prospero_tokens_seen` field exists only because the FIRST PROSPERO regex was
wrong** (`CRD42\d{12}`, which matched nothing). I added it so that "not registered" would
be auditable rather than silent. **It then caught the second instance of its own class.**

### Verified as a real format, not a concatenation artefact

A 9-digit id followed immediately by another digit would look identical to the audit regex,
so I read the surrounding characters in two papers from two different journals before
changing anything:

```
"Registration PROSPERO (2025) CRD420251080791."          Cochrane, PMID 41919720
"registered with PROSPERO (CRD420251034475)."            ESC Heart Failure, PMID 41711738
```

Both terminate cleanly. Regex widened to `CRD42\d{9,10}`.

### Exposure, measured across all three frames before the fix

| frame | examined | scored registered | **registered but MISSED** |
|---|---|---|---|
| cardiology | 164 | 71 | **6** (3 of them `MATCHED`) |
| ID (12 topics) | 84 | 43 | 1 |
| ID (24 topics) | 103 | 50 | 1 (`MATCHED`) |

### ⭐ What the fix actually moved — and why that matters here

Cardiology went **22 → 25** eligible under the *frozen* join, and **12 → 12** under the
**ruled** join. All three recovered cardiology comparators matched on **acronym-only** keys,
which the ruled join excludes.

⛔ **So a fix made while a target of 300 was live moved the ruled headline by +1, not +4.**
That is worth stating plainly, because a regex change that raises the number is exactly the
shape of a fix that should be distrusted. It is the identical class to a defect fixed hours
before the target existed; the audit field that caught it predates the target; and the
tokens were hand-verified in the source text before a character was edited.

## ⛔ Four of five matched ID comparators are excluded by the quality criterion

| PMID | journal | overlap | PROSPERO |
|---|---|---|---|
| 41919720 | *Cochrane Database Syst Rev* | 2/2 | **now true** — `CRD420251080791` |
| 31684685 | *Cochrane Database Syst Rev* | 3/3 | false |
| 30912133 | *Cochrane Database Syst Rev* | 3/3 | false |
| 31584679 | *JAMA Network Open* | 3/3 | false |
| 40313952 | *Frontiers in Immunology* | 2/2 | true — `CRD42025629937` |

⚠️ **A correction to my own earlier statement.** I wrote that Cochrane "registers in its own
library, not PROSPERO". **That is wrong as a general claim** — this 2026 Cochrane review
registers in PROSPERO and says so. The two rotavirus Cochrane reviews (2019) do not. So the
pattern is *older Cochrane reviews are not in PROSPERO*, not *Cochrane is never in PROSPERO*.

⭐ The criterion still excludes **3 of 5** matched ID comparators, all of them the
best-matching ones on their topics. **Recorded as a finding about the criterion. Not
adjusted.**

## On "at least 300" — the arithmetic, unchanged by tonight's work

| reading | where we stand |
|---|---|
| candidate meta-analyses screened | **1,590** (802 cardiology + 788 ID) |
| eligible comparators, ruled join | **14** |
| independent topics demonstrated | **6** |
| topics in the frames | **30** (6 cardiology + 24 ID) |

⇒ **Under the candidates reading, 300 was passed long ago. Under the comparators reading,
300 is not reachable on these criteria from this corpus.** `candidates → verified → judged`
is reported at every stage and never padded.
