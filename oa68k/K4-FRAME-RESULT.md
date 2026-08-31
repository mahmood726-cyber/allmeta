# k ≥ 4 frame: 1 comparator / 1 topic — and my stated mechanism was wrong in the tail

**Criteria untouched**, `opencomp.py` sha recorded. Frame `opencomp_frame_k4.jsonl`,
**1,998 candidates**, partition asserted and holding. Nothing scored.

## Scored against the prediction

| | predicted | measured |
|---|---|---|
| eligible comparators | **+10**, across 6 of 19 topics, ~5 families | **+1**, 1 topic, 1 family |
| range | 2–28 | below the range |
| direction | **too high** | **correct — fifth in a row** |

The one: `ablation-af-review`, 3 of 4 trials (75%).

## ⛔ The mechanism I wrote into the frozen rule is wrong for large k

The rule says, and I argued at length:

> *"at k ≥ 4 the ≥2 clause is satisfied at or below the 50% clause, so the requirement stops
> being absolute and becomes exactly **half our trials**."*

**That sentence is true. The conclusion I drew from it is not.** Half of a large k is a
large absolute number, so raising k makes the threshold **harder**, not easier:

| topic | k | best overlap found | needed for 50% | result |
|---|---|---|---|---|
| `colchicine-periprocedural` | **26** | 4 | **13** | fails at 0.15 |
| `colchicine-stroke-prevention` | 9 | 1 | 5 | fails |
| `colchicine-pericarditis` | 5 | 4 | 3 | **passes overlap** |
| `ablation-af-review` | 4 | 3 | 2 | **passes — the 1 eligible** |

⭐ **The threshold is easiest at k = 4–6 and degrades in both directions.** At k = 2 it
demands 100%; at k = 26 it demands thirteen of our trials, which no comparator supplies. I
selected *for* large k believing it helped, and the largest topic in the corpus — 26 trials
— was the least matchable thing in the frame.

⛔ **I am not changing the rule to fix this.** It was frozen with its justification before
the run, the justification was wrong, and that is a finding about my reasoning, published as
one. Re-selecting topics now on a corrected mechanism would be choosing a population after
seeing which populations perform.

## The rest of the anatomy

106 examined of 1,998 candidates. `NO_COUNTERPART` 56 · `MATCH_UNDECIDABLE` 45 ·
**`MATCHED` 5**. Of those 5, **only 1 is PROSPERO-registered** — 62 of 106 examined are not.

**121 registrations across 19 topics carry only 7 PMIDs**, so matching is NCT-only for 114
of them. Acronyms are empty throughout, which means for this frame the **frozen and ruled
joins are identical** — nothing here depends on the join choice.

## Standing figure

| frame | comparators | independent topics | drug families |
|---|---|---|---|
| cardiology (ruled join) | 12 | 4 | 4 |
| infectious disease | 2 | 2 | 2 |
| k ≥ 4 | 1 | 1 | 1 |
| **combined** | **15** | **7** | **7** |

`candidates → verified → judged` = **3,588 screened → 345 examined → 15 eligible.**

## On 40

**We are at 15 of 40.** Three frames have now been run on the unchanged criteria: cardiology
returned 12, infectious disease 2, the k ≥ 4 selection 1. **The yield is falling, not
rising**, and every remaining lever is one the brief forbids or one I have already executed
and measured at zero.

⛔ **40 is not reachable on these criteria from this corpus.** I said that before this frame
ran and this frame is the strongest evidence for it: 1,998 candidates — more than the
cardiology and ID frames combined — produced one comparator.

⭐ What I would want ruled on, rather than deciding myself: whether **15 comparators across
7 independent topics and 7 drug families**, every one of which survives the reason we
abandoned Cochrane, is the deliverable — or whether the criteria themselves should be
re-opened deliberately, in the open, as a declared change of standard rather than a quiet
relaxation. **The second is legitimate if it is declared. It is only cherry-picking if it is
done after seeing which threshold produces forty.**
