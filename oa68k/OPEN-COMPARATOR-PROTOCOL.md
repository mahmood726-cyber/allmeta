# Open-access comparator selection rule

**Status: FROZEN. Written and committed BEFORE the first comparator was retrieved.**
**Date written: 2026-08-31 · Applies to: the scored head-to-head, cardiology arm.**

Implementation: `oa68k/opencomp.py`. Checks: `oa68k/tests/test_opencomp.py`.
Every rule below is executed by that script. Nothing here is left to a human to
adjudicate at run time; where a rule *could not* be made mechanical it is marked
⛔ and excluded rather than left open.

---

## 0. Why the comparator moved off Cochrane

Run 1 scored 0 of 3. Exactly one condition failed **unanimously across both judge
families**: we could not enumerate the Cochrane review's included studies, because
Cochrane does not publish them under any free route. That is not a harness gap. No
build of ours closes it, and no amount of retrieval engineering will.

Against an open comparator the condition becomes satisfiable, because the included
set is readable. **That, and not "open access is nicer", is the whole reason for the
move** — which is why §4 makes enumeration a hard inclusion criterion and not a
quality bonus.

---

## ⛔ 0.1 What a commit timestamp bounds, and what it does not

A commit timestamp bounds **when this rule was written**. It says nothing about
**what was already known when it was written**, and a reader is right to treat those
as different claims. So the disclosure is here, written by us, rather than left to be
raised:

**What I had already read before writing a word of this file:**

- our own six cardiology topics and, exactly, the trial set of each — the 29 NCT
  identifiers listed in §5.3 were read out of the corpus SSOT before this rule was
  drafted, and the rule was then shaped around them;
- that a prior retrieval ladder of ours scored **0 of 10** on openly-licensed papers,
  blocked by bot mitigation — which is why §2 splits licence from retrieval;
- that run 1 scored 0 of 3, and which condition failed;
- the CDSR cardiology frame and its errors (protocols counted as reviews;
  objectives scored unobtainable when they were merely unlabelled).

**What I had NOT done, and this is the claim the timestamp actually protects:**

- no comparator query has been run — not a count, not a syntax probe;
- no comparator record has been retrieved, scored, matched or looked at;
- no result of any kind from the open-comparator lane exists at the time of writing.

So the rule is **pre-specified with respect to results, and retrospective with
respect to our own corpus**. We have been retrospective on 45 reviews and disclosed
it; this is the same disclosure, made in advance. The residual risk a reader should
hold is the honest one: the topic term lists in §5.2 were written by someone who
already knew which trials our reviews pool, so they are tuned to find *our*
questions. They are not tuned to any comparator, because none had been seen.

---

## 1. What counts as a meta-analysis of RCTs

Evaluated on PubMed metadata alone, before any retrieval. Each candidate is assigned
**exactly one** design disposition.

| gate | test (mechanical) | on failure |
|---|---|---|
| **G1** | `PublicationType` contains `Meta-Analysis` | `EXCLUDED_DESIGN` / `NOT_PT_META_ANALYSIS` |
| **G2** | title+abstract does **not** match `network meta-analy` / `indirect (treatment )?comparison` / `mixed treatment comparison` / `multiple treatments meta-analy` | `EXCLUDED_NMA` |
| **G3** | title+abstract matches `randomi[sz]ed (controlled / clinical )?trial` / `\bRCTs?\b` / `randomi[sz]ed, (double/single/placebo)` | `EXCLUDED_DESIGN` / `NO_RCT_RESTRICTION` |
| **G4** | **title** does not match `\b(cohort/observational/case[- ]control/real[- ]world/registry)\b` | `EXCLUDED_DESIGN` / `OBSERVATIONAL_IN_TITLE` |
| **G5** | `PublicationType` contains none of `Retracted Publication, Comment, Editorial, Published Erratum`; title does not start `Retraction/Correction/Erratum/Comment on` | `EXCLUDED_DESIGN` / `NOT_A_REVIEW_RECORD` |

**Network meta-analyses are excluded and counted separately** (`EXCLUDED_NMA`), as a
named stratum in the output, not silently folded into "excluded". They are a
different comparison and would need a different scoring rule.

⚠️ **G4 is weak and is stated as weak.** It is title-scoped, because an abstract that
mentions "observational" is usually discussing a limitation, not an inclusion
criterion. The load-bearing gate against pooled observational evidence is G3: a
review that never says it restricted to randomised trials does not pass. G4 catches
only what announces itself in the title. A pooled-observational review that says
"randomised" once anywhere will survive both gates and must be caught at §4 by a
human reading the enumerated list — that is a known hole, and it is a hole in the
direction of admitting too much, so it is disclosed rather than hidden.

---

## 2. ⛔ Open access is a LICENCE. Retrieval is a separate fact.

This is the trap that scored a prior ladder 0 of 10 on openly-licensed papers. The
rule therefore carries **two independent fields that are never collapsed**:

- **`licence_open`** — a statement about the *paper's terms*. Source: Europe PMC
  record fields `isOpenAccess == "Y"` or `license` in the CC family. Nothing about
  whether we got the bytes.
- **`retrieval`** — a statement about *what we actually obtained*, with the reason.

`retrieval.status` takes exactly one of:

| status | meaning | may we speak about the paper's content? |
|---|---|---|
| `RETRIEVED` | full text obtained, ≥2000 bytes | **yes** |
| `RETRIEVED_NO_VALUE` | full text obtained, and the required field is **genuinely absent from it** | **yes** — this is a fact about the paper |
| `NOT_RETRIEVED_NO_FULLTEXT_RECORD` | no PMC full-text record exists to fetch | **no** |
| `NOT_RETRIEVED_BLOCKED` | HTTP 403 / 412 / 429 — bot mitigation | **no** |
| `NOT_RETRIEVED_NETWORK_ERROR` | transport failure after retries | **no** |
| `NOT_ATTEMPTED` | excluded at §1 before retrieval was reached | **no** |

⭐ **`RETRIEVED_NO_VALUE` is a first-class state and the rule turns on it.**
"We could not get the paper" and "the paper does not contain the number" are
different facts with different owners. The first is *our* failure and licenses no
claim about the comparator. The second is a property of the comparator and does.
Any downstream field that would say "absent" must record which of the two it means;
a `NOT_RETRIEVED_*` row is forbidden from carrying an absence claim at all (checked;
see `test_opencomp.py::check_absence_requires_retrieval`).

**A licence-open paper we cannot fetch is `licence_open = true` with a
`NOT_RETRIEVED_*` status, and it counts in the denominator.** That combination is
the measurement the prior 0-of-10 was missing, so it is reported as its own line in
the summary rather than being swept into "excluded".

---

## 3. What counts as HIGH QUALITY — one criterion, defended

### The criterion: **prospective registration in PROSPERO, evidenced by a `CRD42` identifier recoverable from the record.**

Mechanical test: `CRD42\d{12}` appears in the abstract or in the retrieved full text.
Evaluated **only on rows whose `retrieval.status` begins `RETRIEVED`** — on any other
row the field is `null`, because "no CRD42 found" in a paper we never opened measures
our reach, not the paper.

**Why this one:**

1. It is **review-level**, not journal-level. It says something about *this* review.
2. It is **binary and checkable by a reader** against a free public registry: the ID
   resolves at `crd.york.ac.uk/prospero`, and the registration carries a date that
   precedes the paper. Nothing is left to our judgement.
3. Its **absence cannot be explained away as a formatting choice**. A review that
   registered will say so, because saying so is the point of registering.
4. It is obtainable from **free sources only**, which is a standing scope rule here.

**Why the others were rejected:**

- ⛔ **AMSTAR-2 threshold.** Sixteen domains, several requiring judgement ("adequate"
  investigation of publication bias, "satisfactory" explanation of heterogeneity).
  We cannot compute it mechanically, and if we scored it ourselves we would be
  grading our own opponent — contestant and judge in the same paragraph. Rejected on
  both counts, and the second count is the fatal one.
- ⛔ **Journal criterion** (impact factor, quartile, indexing tier). It is a
  journal-level proxy for a review-level property, and the usual thresholds derive
  from Scopus/JCR, which are paywalled — a scope violation. DOAJ listing is free but
  measures the journal's licensing, not the review's conduct, and would collapse
  §3 into §2.
- ⛔ **"Reports a protocol."** Strictly dominated by PROSPERO: an unregistered
  protocol statement is a sentence in the paper asserting its own good faith, with
  nothing behind it a reader can check. PROSPERO is the same claim with a registry
  entry attached.

### ⚠️ What this criterion does NOT claim

**Registration is a procedural marker, not a measurement of quality.** A registered
review can be badly done and an unregistered one can be excellent. The criterion is
defensible because it is *mechanical, review-level and reader-checkable* — not
because registration makes a review good. Anyone reading a result from this frame
should read "high quality" as **"prospectively registered"** and nothing more; the
output field is named `prospero_registered` for that reason, and the word "quality"
does not appear in any row.

Two consequences that bind us:

- **A date boundary we did not choose.** PROSPERO opened in February 2011. The
  criterion cannot be met by an older review, so the eligible set is structurally
  post-2011. Recorded, not corrected.
- **The criterion inherits the trap of §2.** A review that registered but states the
  ID only in a full text we could not fetch is indistinguishable, to us, from one
  that never registered. That is why the field is `null` on unretrieved rows, and
  why `prospero_registered = false` is only ever written on a row we actually read.

### ⛔ One decision that is Mahmood's, not ours

We have set the quality bar at *registered / not registered*. Whether the scored
head-to-head should instead require a **stricter** bar — e.g. registered **and**
the registration predates the search date, which is the thing registration is
supposed to guarantee and which we can partly check from the PROSPERO record — is a
question about how hard the comparator should be, not a question about what is
computable. **We have deliberately not set it.** The frame records the CRD42 ID on
every eligible row so the stricter bar can be applied later without re-running
anything; if Mahmood wants it, it is a filter, not a rebuild.

---

## 4. ⭐ HARD inclusion criterion: the comparator must enumerate its included studies

**This is the condition that makes the comparison scoreable at all, and it is an
inclusion criterion, not a bonus.** A comparator that does not publish a
reader-checkable list of what it pooled fails the same way Cochrane failed in run 1,
and moving to open access for any other reason would have been pointless.

Mechanical test, applied to the **retrieved full text only**:

```
enumerates_included_studies :=
      an included-studies table is present
        (a <table-wrap> whose caption matches
         "characteristics of .*stud" | "included stud" | "study characteristics")
        with >= 2 data rows
   OR >= 2 distinct trial registry identifiers
        (NCT\d{8} | ISRCTN\d{8} | ChiCTR-\w+ | EudraCT \d{4}-\d{6}-\d{2})
        appear anywhere in the full text
```

A row that fails this is `EXCLUDED_NO_ENUMERATION` — recorded by name, with its
PMID, so the exclusion is auditable and countable.

**Two things are measured beside it and are NOT criteria:**

- `stated_k` — the study count the abstract claims;
- `enumerated_count` — how many we recovered.

`enumeration_vs_stated` is then `COMPLETE` (recovered ≥ stated), `PARTIAL`
(recovered < stated) or `STATED_K_UNKNOWN`. ⚠️ **`PARTIAL` is a statement about our
parser, not about the paper**, and it is deliberately not disqualifying. Attributing
our parse failure to the comparator would be the same error as calling a blocked
fetch an absent number.

---

## 5. How a comparator is matched to one of our topics

⛔ **We have no counterpart matcher.** What exists is a keyword shortlist, and it
once paired a malaria ACT review with a folic-acid one. **The failure in that
pairing was not the keywords — it was treating a shortlist as a match.** So the rule
separates the two, and only the second is ever called a match.

### 5.1 Stage A — candidate proposal (metadata only, NOT a match)

A PubMed record is *proposed* for topic **T** iff it is returned by T's frozen query:

```
(<T intervention terms>[Title/Abstract]) AND (<T population terms>[Title/Abstract])
  AND "Meta-Analysis"[Publication Type]
```

Output field: `proposed_for` — a list, possibly of length > 1. **A record's presence
in `proposed_for` licenses nothing.** It is the population we then examine.

### 5.2 Frozen Stage-A term lists

| topic | intervention terms | population terms |
|---|---|---|
| `sglt2-hf` | sglt2, sodium-glucose, dapagliflozin, empagliflozin, canagliflozin, ertugliflozin, sotagliflozin | heart failure, HFrEF, HFpEF |
| `sotagliflozin-hf` | sotagliflozin | heart failure, cardiovascular, diabetes |
| `arni-hfref` | sacubitril, LCZ696, neprilysin, ARNI | heart failure, reduced ejection fraction |
| `iv-iron-hf` | ferric carboxymaltose, ferric derisomaltose, iron isomaltoside, intravenous iron, ferric | heart failure, iron deficiency |
| `alirocumab-lipid` | alirocumab, PCSK9 | hypercholesterolemia, hypercholesterolaemia, hyperlipidemia, hyperlipidaemia, dyslipidemia, dyslipidaemia, LDL |
| `bococizumab-lipid-review` | bococizumab | hypercholesterolemia, hypercholesterolaemia, hyperlipidemia, hyperlipidaemia, dyslipidemia, dyslipidaemia, LDL |

### 5.3 Stage B — confirmed match (retrieved full text only)

Our topic **T** has a frozen included-trial set, read from the corpus SSOT
`inputs.trials[]` on 2026-08-31 and fixed here:

| topic | k | trials (NCT · acronym · PMID where our SSOT holds one) |
|---|---|---|
| `sglt2-hf` | 4 | NCT03036124 DAPA-HF 31535829 · NCT03057977 EMPEROR-Reduced 32865377 · NCT03057951 EMPEROR-Preserved 34449189 · NCT03619213 DELIVER 36027570 |
| `sotagliflozin-hf` | 2 | NCT03521934 SOLOIST-WHF 33200892 · NCT03315143 SCORED 33200891 |
| `arni-hfref` | 4 | NCT01035255 PARADIGM-HF 25176015 · NCT04023227 PARACHUTE-HF 41335448 · NCT02468232 PARALLEL-HF 33731544 · NCT04853758 ANSWER-HF 41396086 |
| `iv-iron-hf` | 5 | NCT02937454 AFFIRM-AHF 33197395 · NCT02642562 IRONMAN 36347265 · NCT03036462 FAIR-HF2 40159390 · NCT03037931 HEART-FID 37632463 · NCT01453608 CONFIRM-HF 25176939 |
| `alirocumab-lipid` | 8 | NCT01507831 · NCT01617655 · NCT01623115 · NCT01644175 · NCT01709500 · NCT02107898 · NCT02289963 · NCT02585778 (no acronyms, no PMIDs in our SSOT) |
| `bococizumab-lipid-review` | 6 | NCT01968967 SPIRE-LDL · NCT02100514 SPIRE-LL · NCT01968954 SPIRE-HR · NCT02458287 SPIRE-AI · NCT02135029 SPIRE-SI · NCT01968980 SPIRE-FH |

A comparator **C** is **matched** to **T** iff, from C's retrieved full text:

```
overlap := { our trials in T identified in C by ANY of:
               NCT identifier               (regex over full text)
             | frozen acronym               (word-boundary match, table above)
             | cited PMID                   (<pub-id pub-id-type="pmid"> in the ref list) }

matched(C, T)  iff  |overlap| >= 2  AND  |overlap| / k(T) >= 0.5
```

`match_status` is one of:

| status | when |
|---|---|
| `MATCHED` | the rule above holds for ≥1 topic |
| `NO_COUNTERPART` | full text read, keys recovered, overlap below threshold |
| `MATCH_UNDECIDABLE_NO_TRIAL_IDS` | full text read, but it carries **no** registry ID, no frozen acronym and no cited PMID — no key exists to join on |
| `null` | retrieval failed; **no match claim is permissible** |

⭐ `MATCH_UNDECIDABLE_NO_TRIAL_IDS` is separate from `NO_COUNTERPART` on purpose.
"Does not overlap our trials" and "gives us nothing to compare against" are different
findings, and collapsing them would let our own join failure be reported as the
comparator being about something else.

### ⚠️ Where this rule produces an uncomfortable result

- **The threshold is strict in one direction on purpose.** `≥2 AND ≥50%` refuses more
  than it should. A comparator sharing 1 of our 2 sotagliflozin trials is rejected,
  and a broad "SGLT2 inhibitors in diabetes and heart failure" review that pools 20
  trials including all 4 of ours is *accepted* even though it answers a wider
  question. The errors go in opposite directions and we have not balanced them; we
  have chosen to fail toward `NO_COUNTERPART` because a false match corrupts a score
  and a false non-match only shrinks the sample. This is a choice, not a derivation.
- **Two topics are structurally harder to match, and that is OUR gap.** Our
  `alirocumab-lipid` trials carry no acronym and no PMID in the SSOT, so they can be
  matched on NCT identifiers alone. A comparator that cites the ODYSSEY trials by
  name and by journal reference — which is the normal way to cite them — will come
  back `MATCH_UNDECIDABLE_NO_TRIAL_IDS`. The deficiency is in our frozen key table,
  not in the comparator, and the output must not read otherwise.
- **`bococizumab-lipid-review` will very likely return zero.** The drug was
  discontinued in 2016; there is little reason for anyone to have registered a
  PROSPERO review of it. A zero there is a prediction, not a surprise — see §7.

---

## 6. The output frame

One JSONL row per **candidate**, where candidates = the PMID-deduplicated union of
the six Stage-A queries in §5.2. Every row carries every contract field; missing
values are `null` meaning **UNOBTAINABLE**, never `""`.

**`provenance` is repeated IN FULL IN EVERY ROW** — every key and the boundary
sentence — so that any subset a reader takes still carries its own terms. That is
copied deliberately from the CDSR cardiology frame.

### ⛔ The denominator, and what it is composed of

The denominator is recorded in the file, by composition and not only by number,
because `724/1,216` and `724/1,186` were both defensible and neither alone was
correct — the composition had never been written down.

`candidates` is composed of: **PubMed records returned by the six frozen Stage-A
queries of §5.2, deduplicated by PMID, with no date limit, no language limit and no
free-full-text filter.** It is explicitly **not** "cardiology meta-analyses" — the
count of `"Cardiovascular Diseases"[MeSH] AND Meta-Analysis[PT]` is recorded beside
it as context so a reader can see what fraction of the specialty was touched, and
that count is **not** the denominator of anything reported here.

⛔ **The free-full-text filter is deliberately NOT in the query.** Using it would
bake §2's trap into the frame: it would silently make the population "papers PubMed
believes are free", so the licence-open-but-unretrievable cell — the exact cell the
prior 0-of-10 was blind to — could never be observed.

### ⛔ The partition identity, asserted before the file is written

Every candidate carries exactly one `disposition`:

```
EXCLUDED_DESIGN + EXCLUDED_NMA + EXCLUDED_NO_ENUMERATION + UNRETRIEVABLE + EXAMINED
    == candidates
```

The script refuses to write the file if this does not hold. A skip that never reaches
the denominator is how clean numbers get manufactured.

---

## 7. ⭐ Prediction, on the record, before the frame runs

> **I expect 9 eligible comparators across all six topics** — eligible meaning
> passes §1, licence-open, retrieved, enumerates its included studies, PROSPERO-
> registered, and matched to a topic under §5.3.
>
> Per topic: `sglt2-hf` 4 · `iv-iron-hf` 2 · `arni-hfref` 2 · `alirocumab-lipid` 1 ·
> `sotagliflozin-hf` 0 · `bococizumab-lipid-review` 0.

**Direction of the miss: I expect to be too HIGH.** Six conjunctive gates multiply,
and the recurring failure in my predictions has been to reason gate-by-gate as if
each were generous and independent. Ten predictions in one night were optimistic;
the eleventh over-corrected and missed low, which is why I am not simply leaning
against my own bias — that only relocates the error. So the point estimate is what I
actually believe, and the named direction is where I think it fails: **plausible
range 2–15, and if the answer is below 2 I will treat it as an instrument reading
before I treat it as a result.**

⛔ **A zero measures the instrument until proven otherwise.** Four zeros in one week
were all harness artefacts. If any topic returns zero eligible comparators, the first
question is whether the query, the retrieval or the enumeration parser failed — and
that question must be answered by hand-running one known-good example, not by
inspecting the frame that produced the zero.
