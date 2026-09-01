# The recall arm returned the identical set — and that is the most useful thing it could do

**Criteria untouched.** 114 framed topics, two-arm query, one batch. Frame
`opencomp_frame_recall.jsonl`: **4,595 candidates → 339 examined → 33 eligible (frozen
join)**. Partition asserted and holding.

## Under the ruled join, against the published set

| | comparators | topics | pairs |
|---|---|---|---|
| published union of four frames | 20 | 14 | 24 |
| **recall frame, 114 topics, wider query** | **20** | **14** | **24** |
| **new** | **0** | **0** | — |
| **lost** | **0** | **0** | — |

**Identical set.** Predicted **+1** (range 0–5); measured **0**. Direction *too high* —
correct for the sixth consecutive frame.

⭐ **This is a recall check on the published twenty, and it passed.** A materially wider
search — asking PubMed directly for meta-analyses that mention our trials' registration
identifiers, across every framed topic — recovered **precisely the same twenty comparators**
and not one more. The 20 is not an artefact of under-searching.

⭐ It is also the **second pre-declared remedy measured to do exactly nothing**, after the
`cited_pmid` key-table completion (0 → 60 of 67 PMIDs, match distribution unchanged). Both
were declared before running, both were executed, both moved zero rows. A lever that is
measured to be inert is worth more than one that is merely argued about.

---

## ⛔ The real bottleneck is on OUR side, not in the literature

Screened first, as instructed:

| | |
|---|---|
| store topics | **155** — verified on `origin/main`; **all already framed** |
| with **≥1 live pooled estimate** | **27** |
| with **no** live pooled estimate | **128** |
| live and k ≥ 2 | 26 |
| — already carrying a comparator | **7** |
| — **live, k ≥ 2, still comparator-less** | **19** |

**Only 7 of our 14 comparator-bearing topics are live.** That independently reproduces the
four permanently blocked pages (ablation ×3, colchicine ×2, attr ×1 sit on those four).

⛔ **There were never any topics to add.** The apparent 320 `ssot/` entries were `ls-tree`
counting files: only 157 directories hold anything — 155 canonical topic objects plus `figs`
and `registration`. Every one is framed. The 19 live comparator-less topics have now been
searched **twice**, the second time with a wider query, and return zero eligible.

## Where the ceiling actually stands

```
20  comparators found
-4  permanently blocked: no live pooled estimate to summarise
-3  temporarily blocked: surface disagreement (fixable upstream)
=13 scoreable now          ceiling 16
```

**Reaching 20 scoreable is not available from comparator work.** The three routes are:

1. ⭐ **Fix the 3 surface disagreements — 13 → 16.** Upstream, already identified, and the
   only route that costs nothing methodological. **This is the one I would do.**
2. ⛔ **Revive a pooled estimate on the 4 dead pages — I recommend against it.** Those
   estimates are withdrawn for stated methodological reasons (*"the four trials measure
   four different things"*, *"not pooled — the estimate is withdrawn"*). Reviving a pool the
   review itself refused, in order to raise a comparator count, would be the worst thing
   this project could do — it is the exact shape of every failure the frozen rule exists to
   prevent, applied to our own content instead of our criteria.
3. **New reviews on live topics** — content creation, not comparator retrieval, and not
   mine to initiate.

⚠️ **So the honest answer to "find more topics to get to 20" is that the comparators are not
the constraint — our live pooled estimates are.** 128 of 155 topics have none. Twenty
comparators exist and have been verified twice; only sixteen of them can ever be scored, and
thirteen can be scored today.
