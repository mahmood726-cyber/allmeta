# The comparator-selection rule, and the defences that make it hold

**Consolidated statement of a rule that was written, frozen and pushed BEFORE any
comparator was retrieved.** This document adds no new measurement; every number in it was
established earlier and is cited to the artefact that produced it.

**Rule frozen at commit `fe1f2fd`** (`oa68k/OPEN-COMPARATOR-PROTOCOL.md`, with
`opencomp.py`, `opencomp_plant.py`, `tests/test_opencomp.py`).
**Join ruled at `5a42600`. ID topic inputs frozen at `7ad2538`.**

---

## 0. The criticism this exists to answer

**"High quality" decided after the fact is cherry-picking**, and it is the single objection
that would sink the claim outright. The answer is not a promise. It is an ordering that can
be checked: **the rule was committed and pushed before the first comparator was retrieved**,
and the retrieval, the frame and every result came afterwards.

⛔ **What a commit timestamp does and does not bound.** It bounds **when** the rule was
written. It says nothing about **what was already known** when it was written, and a reader
is right to treat those as different claims. So, stated by us:

**Known before a word of the rule was written** — our six cardiology topics and their exact
trial sets, read out of the corpus SSOT; that a prior retrieval ladder scored **0 of 10** on
openly-licensed papers, blocked by bot mitigation; that run 1 scored 0 of 3 and which
condition failed; the CDSR cardiology frame and its errors.

**Not done** — no comparator query run, not a count, not a syntax probe; no comparator
record retrieved, scored, matched or looked at; no result of any kind in existence.

⇒ **Pre-specified with respect to results. Retrospective with respect to our own corpus.**
The residual risk a reader should hold is that the topic term lists were written by someone
who already knew which trials our reviews pool, so they are tuned to find *our* questions.
They are not tuned to any comparator, because none had been seen.

---

## 1. The rule, in five mechanical decisions

| | decision | test |
|---|---|---|
| **1** | meta-analysis of RCTs | five metadata gates; network meta-analyses excluded as a **named stratum**, never folded into "excluded" |
| **2** | open access | ⛔ **`licence_open` and `retrieval.status` are separate fields and never collapse.** `RETRIEVED_NO_VALUE` is first-class: *"cannot get the paper"* is not *"the paper lacks the number"* |
| **3** | high quality | **PROSPERO registration** (`CRD42\d{9}`), chosen over AMSTAR-2, a journal criterion, and "reports a protocol" |
| **4** | scoreability | ⭐ the comparator must **enumerate its included studies** — a **hard inclusion criterion**, not a bonus |
| **5** | matching | two stages; a keyword shortlist licenses **nothing** |

### Why criterion 3 and not the others

**PROSPERO** is review-level rather than journal-level, binary, checkable by a reader
against a free registry, and obtainable from free sources. **AMSTAR-2** was rejected because
it needs judgement across sixteen domains and — fatally — scoring it ourselves would make us
contestant and judge in the same paragraph. A **journal criterion** is a journal-level proxy
whose usual thresholds are paywalled. **"Reports a protocol"** is strictly dominated: it is
the paper asserting its own good faith with nothing behind it.

⚠️ **Registration is a procedural marker, not a measurement of quality.** The output field is
named `prospero_registered` and the word "quality" appears in no row. It also imposes a
post-2011 boundary we did not choose.

### Criterion 4 is the whole reason for the move

Run 1 scored 0 of 3, and one condition failed **unanimously across both judge families**: we
could not enumerate Cochrane's included studies, because Cochrane does not publish them
under any free route. No build of ours closes that. Against an open comparator it becomes
satisfiable — **which is why enumeration is an inclusion criterion and not a quality bonus.**

---

## 2. ⭐ The join: the strongest defence we have, stated rather than left to be inferred

> **All three join options were COMPUTED AND PUBLISHED BEFORE the choice was made, from one
> artefact. The chosen join — 12 comparators / 13 pairs — is SMALLER than the alternative
> (22), so the choice went AGAINST our own headline count. The evidence for it was a
> hand-read of three papers, not a look at which number was larger.**

| join | comparators | pairs | admitted keys |
|---|---|---|---|
| frozen | 22 | 23 | NCT id · cited PMID · frozen acronym |
| **`nct_pmid` — RULED** | **12** | **13** | NCT id · cited PMID |
| `cited_pmid` | 8 | 8 | cited PMID only |

All three reproduce from a single file, `opencomp_pairs.jsonl`, because every pair carries
`join_tiers` and every trial-level match records **which key produced it**. Choosing a join
is therefore a **filter on a finished artefact** — no rebuild, no re-run.

**The hand-read.** The frozen acronym key finds **mentions, not inclusions**. `DELIVER`
matched 14 papers; three were read by hand:

- PMID 33586910 (2020) — *"Two ongoing SGLT2 inhibitor trials … and DELIVER"* — a trial that
  had not reported. **Not an included study.**
- PMID 35338608 (2022) — *"In addition to the ongoing DELIVER study"* — the same.
- PMID 37773799 (2023) — *"including DELIVER and EMPEROR-Preserved trials"* — a genuine
  inclusion.

⇒ 22 keeps matches we have **specific evidence** are unsound; 8 discards NCT-joined pairs
that are sound; **12 drops exactly the class we caught and keeps the rest.**

⛔ **The join has not been reopened since**, including when a later target of twenty
comparators would have been met by reopening it. That was pre-committed before the second
frame ran, so the shortfall could not reopen it.

---

## 3. ⛔ The pair reporting rule — binding

> **Report `COMPARATORS / INDEPENDENT TOPICS`, side by side, every time.**

**22 pairs drawn from 4 of our reviews is 22 comparisons and FOUR independent
demonstrations.** A pair count must never be allowed to read as a review count. In the
cardiology frame, **9 of 13 ruled pairs sit on a single topic** (`sglt2-hf`), so a bare "13"
overstates independence by more than three-fold.

| specialty | comparators | independent topics | pairs |
|---|---|---|---|
| cardiology (ruled join) | 12 | 4 | 13 |
| infectious disease | 1 | 1 | 1 |
| **combined** | **13** | **5** | **14** |

This is the near-duplicate inflation problem one level up, and it is the criticism that
would land hardest after the cherry-picking one.

---

## 4. The denominator, by composition and not only by number

`724/1,216` and `724/1,186` were both defensible and neither alone was correct, because the
denominator's composition had never been written down. So:

**Cardiology `candidates` = 802** — PubMed records returned by the six frozen Stage-A
queries, deduplicated by PMID, with **no date limit, no language limit and no free-full-text
filter**. Per-topic hits 460 / 152 / 123 / 82 / 54 / 6, summing to 877 because 72 records
are proposed for more than one topic.

⛔ **The free-full-text filter is deliberately absent.** Including it would silently redefine
the population as "papers PubMed believes are free" and make the licence-open-but-
unretrievable cell unobservable — the exact cell a prior ladder was blind to.

⛔ **Context, not a denominator:** PubMed holds **39,524** records under
`"Cardiovascular Diseases"[MeSH] AND "Meta-Analysis"[PT]`. Six drug-specific queries touch
**2.03%** of that. It is the denominator of nothing reported here.

**The partition is asserted before either file is written**, and the builder refuses to
write if it fails:

| cell | cardiology | infectious disease |
|---|---|---|
| `EXCLUDED_DESIGN` | 222 | 422 |
| `EXCLUDED_NMA` (named) | 133 | 52 |
| `EXCLUDED_NO_ENUMERATION` | 56 | 23 |
| `UNRETRIEVABLE` | 283 | 106 |
| `EXAMINED` | 108 | 61 |
| **sum = candidates** | **802** ✅ | **664** ✅ |

**Licence-open AND unretrievable: 24 (cardiology), 12 (ID).** That cell exists only because
licence and retrieval are separate fields.

---

## 5. What the rule cost us, recorded rather than smoothed

- **Cardiology.** 48 of 108 examined were PROSPERO-registered (44%). 22 eligible.
- **Infectious disease.** 33 of 61 (54%) registered — so the quality instrument reads
  normally in both specialties — yet **1 eligible**, because two pre-declared constraints
  bind: our ID key table has no acronyms and no PMIDs, and **`≥2 AND ≥50%` demands *both*
  trials when k = 2**, which four of twelve ID topics are.
- ⛔ **Two of four ID matches were Cochrane reviews**, matched 3 of 3, excluded by the
  PROSPERO criterion because Cochrane registers in its own library. **The frame found
  Cochrane as the best-matching comparator and our quality rule excluded it for a reason
  unrelated to the enumeration problem that drove us off Cochrane.** Recorded as a finding
  about the criterion. **Not adjusted.**

⚠️ **Combined we are at 13 of a target of 20.** The honest report is that we are short, not
that the join should be revisited.

---

## 6. Where the rule produces uncomfortable results

- **The threshold is strict in one direction on purpose.** A comparator sharing 1 of our 2
  sotagliflozin trials is rejected; a broad review pooling 20 trials including all 4 of ours
  is accepted though it answers a wider question. We fail toward `NO_COUNTERPART` because a
  false match corrupts a score and a false non-match only shrinks the sample. **A choice,
  not a derivation.**
- **Two topics are structurally harder to match, and that is OUR gap.** Our
  `alirocumab-lipid` trials carry no acronym and no PMID, so a comparator citing the ODYSSEY
  trials the normal way returns `MATCH_UNDECIDABLE_NO_TRIAL_IDS`. The deficiency is in our
  key table, not the comparator.
- **`MATCH_UNDECIDABLE_NO_TRIAL_IDS` is kept apart from `NO_COUNTERPART`** so our own join
  failure can never be reported as the comparator being about something else.

---

## 7. Open slots — questions this document does not answer, left empty on purpose

⛔ Filling these requires a corpus sweep, and the volume is I/O-starved. **An explicitly
empty slot is honest; a number fetched at the cost of another lane's turn is not.**

- ▢ How many of the 155 topic objects would clear `k ≥ 4`, the arithmetic that makes the
  overlap threshold reachable.
- ▢ Which remaining ID topics (of the 35 shortlisted, 12 used) would yield eligible
  comparators on the unchanged criteria.
- ▢ Whether a third specialty exists in the corpus with cardiology's class-level structure
  rather than ID's drug-level structure.
- ▢ The corpus-wide count of topics whose trial acronyms are recorded, which is the key
  channel that carried 10 of cardiology's 22 and none of ID's.

---

## 8. Checks: every one watched to fail

**8 of 8** planted in the real frame file, watched to fail, restored byte-identical:
partition · provenance in every row · no empty strings · **absence requires retrieval** ·
**licence is not retrieval** · denominator composition recorded · eligibility as a
conjunction · pmid uniqueness. **A check not watched to fail is not a check.**

⭐ **A zero, a 100%, or a unanimous criterion measures the instrument until proven
otherwise** — settled by hand-running one known-good example, never by inspecting the file
that produced it. That rule has already converted a "0 eligible comparators" into a PROSPERO
regex that could not match any real registration, and a "0 of 13 scoreable" into a
mis-paired join.
