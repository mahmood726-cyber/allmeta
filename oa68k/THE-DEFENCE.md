# Twenty open-access comparators: the funnel, the disposition, and the rule that was never amended

**Result: 20 comparators · 14 independent topics · 10 drug families · 6,182 candidates
screened.** Criteria frozen before the first comparator was retrieved and **never amended**.

---

## 1. The funnel

```
6,182  candidate meta-analyses screened   (four frames, PubMed, no date/language/OA filter)
1,105  full text retrieved                (RETRIEVED or RETRIEVED_NO_VALUE)
  442  EXAMINED    = retrieved AND an included-study list recovered
   20  eligible comparators
```

| frame | candidates | retrieved | **examined** | comparators | topics | families |
|---|---|---|---|---|---|---|
| cardiology, 6 topics | 802 | 164 | **108** | 12 | 4 | 4 |
| infectious disease, 24 topics | 788 | 103 | **75** | 2 | 2 | 2 |
| k ≥ 4 selection, 19 topics | 1,998 | 215 | **106** | 1 | 1 | 1 |
| all remaining k ≥ 2, 65 topics | 2,594 | 289 | **153** | 6 | 7 | 5 |
| **union** | **6,182** | **1,105** | **442** | **20** | **14** | **10** |

### ⛔ A correction to this document, caught by a delegated known-answer control

**The first draft of this table said 451 examined.** It was wrong twice over: for two frames
I had used the count of rows whose *retrieval succeeded* (164, 103) rather than the count
that reached `EXAMINED`, conflating those with the 56 and 28 that were retrieved but carried
**no included-study list**; and for the fourth frame I wrote **78**, a figure I had never
measured.

An independent Codex sweep, given `451` as a known-answer control, **failed it and said so
loudly** — observed 442 — and declared its own sweep suspect rather than adjusting the
control. **It was right and I was wrong.** The two counts are now reported as separate
columns, because *"we got the paper"* and *"the paper lists what it pooled"* are different
facts and merging them is the exact error this protocol exists to prevent.

⭐ Seven of the eight controls were confirmed independently: candidates per frame and total,
union comparators (20), union topics (14), union pairs (24), the sum-versus-union gap (21
vs 20), the double-frame PMID, and the 155-object disposition. **Every frame's partition
identity holds.**

Families: `ablation · arni · attr · colchicine · finerenone · iv-iron · lenacapavir ·
nirsevimab · sglt2 · sotagliflozin`.

### ⛔ Two number-hygiene facts that a reviewer would otherwise find first

> **Summing the frames gives 21; the union is 20. One comparator is eligible in two frames.
> The sum is the wrong number.**

> **PMID 40998847 is eligible against THREE of our ablation topics — 3 of the 24 pairs, one
> paper, one drug family. It is closer to one demonstration.**

That is why every figure here is reported as **comparators / independent topics / families**
and never as a pair count. **24 pairs is not 24 demonstrations, and 14 topics across 10
families is not 14 independent ones.**

**Three comparators account for all four of the extra pairs**, and each spans one family:

| PMID | topics matched | family |
|---|---|---|
| 40998847 | `ablation-af-review` · `ablation-af-heart-failure` · `ablation-af-medical-therapy` | ablation |
| 38505729 | `colchicine-cvd-coronary` · `colchicine-cvd-review` | colchicine |
| 39893467 | `sglt2-hf` · `sotagliflozin-hf` | sglt2 |

**20 comparators produce 24 pairs; 17 of them produce one each.** Reporting the 24 would
inflate the demonstration count by a fifth, entirely inside three drug families.

---

## 2. The disposition of all 155 topic objects

Every object in the corpus is accounted for. Nothing was skipped, sampled, or left
unexamined.

| disposition | n |
|---|---|
| framed in the first three frames | 49 |
| framed in the fourth (all remaining k ≥ 2) | 65 |
| excluded on the object's **own** declaration | 4 |
| **k < 2** — the frozen rule needs ≥2 overlapping trials, so no comparator can ever match | 37 |
| **total** | **155** ✅ |

The four exclusions are by the objects' own text, not by their yield:
`hiv-prep-injectable-review` (*"DUPLICATE PAGE — see cab…"*), `olmesartan-htn`
(*"RETIRED"*), `malaria-vaccine` and `menacyw-healthy-volunteers-auto-full-review`
(near-duplicates of framed topics, larger kept).

⭐ **The 37 are excluded by arithmetic, not by preference.** At k = 1 the rule's `|overlap|
≥ 2` clause cannot be satisfied by any comparator on earth.

---

## 3. Provenance: what was frozen, and when

| artefact | commit |
|---|---|
| the comparator-selection rule, **before the first comparator was retrieved** | **`fe1f2fd`** |
| the join ruled at `nct_pmid` | `5a42600` |
| ID topic inputs, before the ID frame ran | `7ad2538` |
| `k ≥ 4` selection rule + its justification, before that frame ran | `05642cc` |
| that frame's prediction, before it ran | `d9a9d16` |
| all-remaining-k≥2 rule + prediction, before that frame ran | `48ff05a` |
| consolidated rule, sha256 `0e756f80…c25c43` | `10a5e74` |

**Every frame's inputs and every prediction were committed and pushed before the frame ran.**
The scoring criteria were never amended for a specialty, a target, or a result.

### The join, which is the strongest single defence

**All three join options were computed and published before the choice, from one artefact.
The chosen join — 12 comparators — is smaller than the alternative (22), so the choice went
AGAINST our own headline count. The evidence for it was a hand-read of three papers, not a
look at which number was larger.**

`DELIVER` matched 14 papers; PMIDs 33586910 and 35338608 name it as an **ongoing** trial,
37773799 genuinely includes it. The acronym key finds mentions, not inclusions.

---

## 4. ⭐ A mechanism this project asserted, wrote into a frozen rule, and then measured to be false

The `k ≥ 4` selection rule was justified — in the review instruction that commissioned it and
in the rule text I wrote — by this sentence:

> *"At k = 2 the `≥2 AND ≥50%` threshold demands **both** trials, an effective 100% overlap
> requirement; at k ≥ 4 it becomes reachable at **half**."*

**The first half is true. The conclusion is false, and the run proved it.** Half of a large
k is a large absolute number:

| topic | k | best overlap found | needed for 50% |
|---|---|---|---|
| `colchicine-periprocedural` | **26** | 4 | **13** |
| `colchicine-stroke-prevention` | 9 | 1 | 5 |
| `colchicine-pericarditis` | 5 | 4 | 3 ✅ |
| `ablation-af-review` | 4 | 3 | 2 ✅ |

⭐ **The threshold is easiest at k = 4–6 and degrades in both directions** — 100% at k = 2,
thirteen trials at k = 26. The frame selected *for* large k believing it helped; the largest
topic in the corpus (26 trials) was the least matchable thing in it, and **1,998 candidates
produced one comparator.**

⛔ **The rule was not amended.** It was frozen with its justification; the justification was
wrong; the refutation is published and the rule stands as run.

**Why this is the most persuasive artefact here:** a protocol that records a mechanism its
own run disproved, *without* editing the rule to match the new understanding, cannot
simultaneously be a protocol that was tuned toward a target. The correction cost the
project its most promising-looking lever and it is published at the expense of the people
who asserted it.

---

## 5. ⭐ A lever with no discretion in it cannot be gamed

The fourth frame was meant to be a *specialty* selection. Measured before declaring, the
corpus's k ≥ 4 population turned out to be **exhausted** — of 106 remaining unframed topics
the k distribution was `{0:18, 1:19, 2:41, 3:28}`, **zero at k ≥ 4**.

So there was no specialty list to choose. The declaration became **everything remaining with
k ≥ 2** — 65 topics, one batch, run together. Cardiology, infectious disease, ophthalmology,
amyloidosis, haematology and pulmonary hypertension entered side by side **because the rule
cannot see specialty.**

⭐ **A lever with no discretion in it cannot be gamed**, and that is the point: the fourth
frame's population was not selected, it was simply *what was left*.

---

## 6. Predictions: two parts, separate provenance

Every frame carried a prediction committed before it ran. The final one:

| | value | provenance |
|---|---|---|
| magnitude | **+6 comparators** — measured +6 | **REASONED** from population (65 topics, all in the hardest k band) |
| direction | *"too high"* — **wrong** | **REFLEX**: sixteen consecutive over-estimates had made it feel safe |

⭐ **A prediction has two parts and they can have different provenance.** The number landed
exactly; the direction was a habit wearing the costume of a measurement. That is only
visible because the two were recorded separately, and they are separated from here on.

Full record: cardiology 9 → 22 · ID 18 → 1 · ID widening +2 → 0 · key-table +4 → 0 ·
k ≥ 4 +10 → 1 · final +6 → **+6**.

### The pre-declared remedy that measured zero

The `cited_pmid` gap was declared in an addendum frozen **before** the first ID frame ran:
*"that deficiency is in OUR key table, not in the comparator."* It was executed — **0 → 60
of 67 registrations gained a PMID** — and the match distribution did not move by a single
row (42 / 28 / 5, before and after). **The claim we had written down was wrong**, and only
running it could have shown that. A pre-declared remedy measured to do nothing is worth more
than the yield it might have produced.

---

## 7. What would change the number, and how it would have to be done

Every corpus topic that can match has been framed. **There is no untouched lever.** Reaching
40 requires reopening one of three frozen criteria:

1. the **join** — chosen against our own headline count;
2. the **`≥2 AND ≥50%` threshold** — now known to degrade at both ends of k;
3. **PROSPERO registration** — the largest single filter on matched comparators, which
   excludes well-matched Cochrane reviews.

⭐ **Any of these is legitimate as a deliberate, declared change of standard: state it in
advance, publish the reason, and re-run from the frozen frames.**

⛔ **None is legitimate applied to this result.** A criterion loosened after seeing which
threshold produces forty is cherry-picking whatever the intention behind it — and it would
destroy the one thing this artefact has that a sceptical reader can check: that the rule was
fixed before the data, and stayed fixed when the data disappointed it.
