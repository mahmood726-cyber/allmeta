# Reconciling the ladder's vocabulary against the E156 union ledger

**Ledger:** `F:\E156\hfref-union-ledger.jsonl` (724,114 bytes, schema 2.0, generated 2026-07-19)
**Trial ledger:** `F:\E156\hfref-trial-ledger-v3.jsonl` (204,112 bytes, schema 3.0-multioutcome)
**Ladder:** `oa68k/ladder.py`, `ladder_store.py`, `obtainability.py`

## 0. Kinds before counts

The union ledger is **381 lines**, not 206. Enumerated:

| kind | n |
|---|---|
| `UNION-LEDGER-HEADER` | 1 |
| TRIAL entity | 148 |
| **DATUM** | **206** |
| **SOURCE** | **20** |
| decision | 4 |
| execution / analysis | 2 |

The "206 datum-level rows + 20 SOURCE records" figure is right; it is 206 of 381 lines, and saying "206 rows" without the kinds invites the reader to think the file has 206 lines. Same rule I apply to my own counts.

---

## 1. Where the ledger is richer, and I am adopting it

### 1a. `isnad_grade` — corroboration across donors. **I have no equivalent.**

`ECHO` (114) · `FLAGGED-SINGLE` (78) · `FLAGGED-CONFLICT` (14)

This grades a datum by **how many independent donors carry it and whether they agree**. Source-ref counts per datum: 84 have one, 26 two, 44 three, 38 four, 12 five, 2 six.

My `reconciliation` field only compares a prior-meta value against **the primary read** — a pairwise check. It cannot express "three donor supplements agree" (ECHO) or "two donors disagree with each other" (FLAGGED-CONFLICT). **The 14 FLAGGED-CONFLICT rows are exactly the class my ladder would silently take the first of.** Adopting.

### 1b. `matn` — arithmetic reconciliation against the randomised N

`FLAG` (130) · `NOT_TESTABLE` (76) · `PASS-verbatim` (in v3)

Checks the arm counts against the trial's randomised N. My extractor gives per-effect internal consistency (`consistency_ok`) and `pct_consistent` on arm proportions, but **nothing that reconciles an extracted denominator against the trial's own randomised total.** Adopting; it is the check that catches an arm count copied from the wrong analysis set.

### 1c. `epistemic_status` — `INHERITED` (152) · `UNVERIFIABLE` (52) · `CONTESTED` (2)

Orthogonal to my `State`. Mine says **whether we hold the datum**; theirs says **whether it can be trusted**. A datum can be `OBTAINED` and `UNVERIFIABLE` at once, and that pair is more informative than either alone. Adopting as a second axis, not a replacement.

### 1d. The SOURCE record — **the thing I do not have at all**

```
ledger_id SRC-B17 | Burnett H et al. Circ Heart Fail 2017;10(1):e003529
  access_tier      OPEN
  reachability     BLOCKED
  text_layer       MIXED
  retrieval_route  PMC5265698 main text RETRIEVED; Supplement Table II NOT retrieved
  _trials_stated   57      _trials_recovered 30      _shortfall 27
  taken_from_it    ['30 trial names read from Fig 2/3/4 legends; ZERO arm-level counts']
  _barrier         Supplement Table II ... bot-mitigation on the publisher supplement
```

**My ladder's `Attempt` is per-datum.** A source that fails for 27 trials gets recorded 27 times in prose rather than once, with a fraction and a named barrier. The SOURCE record gives *yield per source* alongside my *yield per rung*, and those answer different questions: mine says which rung supplied, theirs says which document was worth fetching. Adopting.

⚠ And `access_tier: OPEN` with `reachability: BLOCKED` is a distinction I would have lost: **the licence is open and the bytes are not reachable.** "Open access" is not "machine-retrievable" — the caution stated in the original brief, here recorded as two separate fields rather than one conflated one.

### 1e. `T6-abstract` — a tier I collapse and should not

Their v3 provenance tiers: `T0-journal` (31) · `T5-supplement` (20) · `T2-registry` (13) · `T1-FDA` (3) · `T6-abstract` (2) · `T4+T5` (1) · `T4-EuropePMC` (1) · `T0-companion` (1) · `T3-JSTAGE` (1) · `none` (1).

**I have no abstract tier.** All five of my HFrEF benchmark's abstract-derived values are tagged `trial_report`, identical to a full-text read. An abstract is a weaker source than the paper it heads — it is the author's summary, and it omits the analysis-set detail that decides whether two numbers are comparable. Adopting `T6-abstract` as a distinct tier below `trial_report`.

---

## 2. Where the ladder is richer, and I am keeping it

### 2a. `Outcome` at the attempt level — six typed values, not prose

`HIT · RETRIEVED_NO_VALUE · MISS · EMPTY · FAILED · SKIPPED`

**`RETRIEVED_NO_VALUE` is the one that matters here, and Burnett 2017 is its exact case**: main text retrieved, zero arm-level counts. The ledger records that truthfully but *in prose* (`taken_from_it: "ZERO arm-level counts"`), so no query can count it. As a typed outcome it is countable, and it is the guard against the 317-retrieved/31-reports error.

`EMPTY` (a 200 with an empty body) and `FAILED` (transport) are likewise typed here and prose there.

### 2b. `GENUINELY_UNOBTAINABLE` must be **earned** — the ledger has no equivalent gate

The ledger's closed status set is `INCLUDED · QUARANTINED · PENDING-VERIFICATION · DOESNT-BELONG · ASSUMPTION-CHALLENGING`. **Every one of those is about INCLUSION, not obtainability.** The nearest obtainability field is `reachability: BLOCKED` — which under my rules is a *probe result* and can never earn an absence claim.

So the ladder contributes the piece the ledger lacks: an absence state that requires a named enumeration, its date and hash, and a positive control found in the same bytes first. Keeping, and offering it to the ledger.

### 2c. Route is not tier

`T3-JSTAGE` and `T4-EuropePMC` name **where the bytes came from**, not what kind of document it is — so those two rows cannot tell you whether the value was a trial report or a supplement. My `Attempt.source` (route) and `provenance_tier` (evidence kind) are separate fields. Keeping the split, and it is worth pushing back into the ledger.

### 2d. `T5-supplement` and `T5-donor-supplement` share a number and are different evidence

The trial's **own** supplement and **someone else's meta-analysis's** supplement are not the same tier of evidence. My ranking separates them (`trial_supplement` at rank 2, `prior_meta_table` at rank 6) and the whole reconciliation rule in §6b turns on that distinction. Keeping the split.

---

## 3. The merged vocabulary

| axis | source | values |
|---|---|---|
| attempt outcome | **ladder** | HIT · RETRIEVED_NO_VALUE · MISS · EMPTY · FAILED · SKIPPED |
| datum state | **ladder** | OBTAINED · NOT_YET_FOUND · GENUINELY_UNOBTAINABLE (earned) · NOT_YET_ATTEMPTED |
| trust | **ledger** | INHERITED · UNVERIFIABLE · CONTESTED |
| corroboration | **ledger** | ECHO · FLAGGED-SINGLE · FLAGGED-CONFLICT |
| arithmetic | **ledger** | PASS-verbatim · FLAG · NOT_TESTABLE |
| evidence tier | **both** | trial_report · **abstract** · trial_supplement · regulatory_review · protocol_sap · registry_results · **donor/prior-meta supplement** · registry_reference_row |
| route | **ladder** | efetch_pmc_jats · epmc · ctgov_v2 · openfda · … (kept out of the tier) |
| source-level | **ledger** | access_tier · reachability · text_layer · retrieval_route · stated/recovered/shortfall · barrier |

**Neither vocabulary is a superset of the other.** The ledger is richer about *evidence quality and about sources*; the ladder is richer about *what one attempt did* and about *earning an absence claim*. Merging them costs nothing because they overlap on only one axis — tier — and there the fix is to split route out and split the two T5s apart.
