# Recall arm — screening result, and the prediction before it runs

## The screen that reframes the target (measured on our side FIRST, as instructed)

| | |
|---|---|
| store topics | **155** — verified against `origin/main`, all framed, none left to add |
| with **≥1 live pooled estimate** | **27** |
| with **no** live pooled estimate | **128** — cannot host a Summary of Findings at any comparator quality |
| live **and** k ≥ 2 | 26 |
| of those, already carrying a comparator | **7** |
| **live, k ≥ 2, no comparator yet** | **19** |

⇒ Only **7 of our 14** comparator-bearing topics are live, independently reproducing the
4 permanently blocked pages (ablation ×3, colchicine ×2, attr ×1 sit on those 4).

⛔ **"Find more topics" is not available.** The 19 live topics without comparators were
already searched under the frozen rule and returned zero eligible. The only honest lever is
**better recall on topics already framed**, which is what this arm is.

## Prediction, on the record

> **I predict +1 eligible comparator (range 0–5), on 1 of the 114 topics.**
> Combined would be 21 comparators / 15 topics — but the **scoreable** figure would move
> from 13 to at most 14, because a new comparator only helps if its topic is live.

**Direction: TOO HIGH.** Nineteen projections in this project, fifteen optimistic.

**Why I expect near-zero, stated before running.** PubMed indexes a registration in the
SI/secondary-source field of *that trial's own reports*. A meta-analysis carries its
included registrations in the **full text**, which PubMed does not index. So arm B is
likely to surface the trials themselves (excluded at the design gate) rather than
meta-analyses of them.

⭐ **A measured zero is worth having.** It is the same shape as the cited-PMID remedy: a
lever declared in advance, executed, and measured to move nothing — which refutes a claim
rather than decorating one.

## What this does NOT do

⛔ The join is not reopened. `≥2 AND ≥50%` is untouched. PROSPERO stands. The enumeration
requirement stands. Every design gate is imported byte-for-byte from `opencomp.py`, whose
sha256 is recorded in the frame provenance. **Only the candidate population widens** — the
same rule, searched harder. Adding topics and lowering the bar are different acts, and only
the first would have been legitimate; since no topics remain, this is the third option:
better recall on what is already framed.
