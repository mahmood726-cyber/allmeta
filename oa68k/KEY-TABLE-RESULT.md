# Completing our key table changed nothing — and it refutes a claim I made in advance

**Criteria untouched.** The only change was filling the `pmid` column the frozen rule
already names. Frame `opencomp_frame_id24pmid.jsonl`, 788 rows. Nothing scored.

## The measurement

| | registrations | with PMID |
|---|---|---|
| before | 67 | **0** |
| after | 67 | **60** (7 still keyless) |

| examined = 75 | `NO_COUNTERPART` | `MATCH_UNDECIDABLE` | `MATCHED` |
|---|---|---|---|
| **before** (NCT only) | 42 | 28 | 5 |
| **after** (NCT + PMID) | **42** | **28** | **5** |

**Identical.** Eligible stayed at **2**. The `cited_pmid` key fired on exactly **1** trial
overlap in the whole frame; `nct` fired on 17.

**Predicted +4, range 0–12. Measured 0** — bottom of the range. Direction *too high*,
correct for the fourth frame running.

## ⛔ It refutes what I declared in advance

The ID addendum, frozen before the first ID frame ran, said:

> *"our ID trial names are descriptive and the SSOT holds no PMIDs, so matching rests on
> NCT identifiers alone … **that deficiency is in OUR key table**, not in the comparator."*

**That was wrong, and this tested it.** `MATCH_UNDECIDABLE_NO_TRIAL_IDS` fires when the
**comparator** exposes no registry id and no PMID-tagged reference at all — our side's keys
are irrelevant to those rows. Filling 60 of 67 PMIDs moved the count by zero because the
missing keys were never ours.

⭐ I would not have found that by reasoning about it. The remedy was declared in advance,
executed, and **measured to do nothing** — which is worth more than the +4 it might have
produced.

## The real anatomy of the shortfall, ranked

1. **42 of 75 — `NO_COUNTERPART`.** Keys recovered on both sides; overlap below `≥2 AND
   ≥50%`. Driven by our own small k: **ten of 24 ID topics have k = 2**, where the rule
   demands *both* trials.
2. **28 of 75 — `MATCH_UNDECIDABLE`.** The comparator publishes no joinable identifier.
   **A property of ID publishing, not of our key table.**
3. **3 of 5 matched fail PROSPERO** — including two 2019 Cochrane reviews that are the
   best-matching comparators on their topic.

## Where 40 stands, honestly

| | comparators | independent topics | pairs |
|---|---|---|---|
| cardiology (ruled join) | 12 | 4 | 13 |
| infectious disease | 2 | 2 | 2 |
| **combined** | **14** | **6** | **15** |

**Candidates screened: 1,590.** `candidates → verified → judged` = **1,590 → 75 examined
(ID) + 164 (cardiology) → 14 eligible**.

⛔ **40 is not reachable on these criteria from this corpus, and I am saying so rather than
producing it.** Every lever that would close a 26-comparator gap is one the brief forbids:
reopening the join (which was chosen *against* our own headline count on a hand-read of
three papers), relaxing `≥2 AND ≥50%`, or dropping PROSPERO. The one legitimate lever —
completing our own key table, declared in advance — has now been executed and measured at
**zero**.

**What remains available without touching a criterion**, and none of it is small:
adding topics with **k ≥ 4** (the threshold is reachable at half the trials rather than
all), and adding specialties beyond the two used. Both are selection decisions about which
of *our* reviews to enter, must be declared in advance, and **I have not made them.**

⭐ **Stopping at 14 with stated reasons is the answer the brief asked for.** *"Stopping at
31 with a stated reason beats 40 with three that nobody hand-checked"* — this is that, at a
lower number than anyone wanted.
