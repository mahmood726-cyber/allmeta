# "Open access" is a licence status, not a retrieval status

**Source:** `F:\E156\hfref-union-ledger.jsonl`, 20 SOURCE records, schema 2.0, generated 2026-07-19
**Independent confirmation:** `oa68k/donor10_bench.py`, ten trials, `out/donor10_result.json`

---

## The claim

Evidence-synthesis methodology treats *open access* as though it settled whether a
number can be obtained. It does not. **A licence governs what you are permitted to
do with bytes you have. It says nothing about whether the bytes are served to a
machine.** Those are two different properties of a source and they have to be
measured separately.

## The measurement

Twenty donor sources, each recording how many trials it *states* it contains and how
many were actually *recovered* from it. **844 trials stated, 311 recovered — 36.8%.**

| licence | reachability | sources | trials recovered / stated |
|---|---|---|---|
| OPEN | RETRIEVED | 6 | **233 / 233 (100%)** |
| OPEN | BLOCKED | 8 | **77 / 316 (24%)** |
| OPEN | STRUCTURALLY-ABSENT | 1 | 0 / 0 |
| PAYWALLED | UNREACHABLE | 5 | 1 / 295 (0.3%) |

⇒ **Among sources with an OPEN licence, recovery is bimodal — 100% or 24%.** Being
open predicts nothing about yield. Being *served* predicts almost everything. Fifteen
of twenty sources are open; **nine of those fifteen yielded less than everything, and
eight of them are blocked outright.**

Reporting "15 of 20 sources were open access" would be true and would describe none
of this.

## Why each one failed — the table nobody publishes

The failures are not one thing. They are **four mechanisms with different fixes**, and
collapsing them into "not retrieved" destroys the only information that would tell you
what to do next.

### 1. The data is in a supplement the repository does not serve

```
Burnett H et al. Circ Heart Fail 2017;10(1):e003529      OPEN · BLOCKED · 30/57
  route    PMC5265698 main text RETRIEVED; Supplement Table II NOT retrieved
  barrier  Supplement Table II -- which holds the full 57-trial list and all
           arm-level event data -- is not in the PMC XML payload
           (no supplementary manifest)
```

The paper is open. The main text is served. **The arm-level counts live in a
supplement that is not in the payload.** This single source is the one holding the
per-arm counts for the ten trials in our benchmark.

### 2. The API returns a 200 with an empty body

```
Heran BS et al.    Cochrane 2012 CD003040   OPEN · BLOCKED · 0/24  (25,051 patients)
Hood WB et al.     Cochrane 2014 CD002901   OPEN · BLOCKED · 0/13  ( 7,896 patients)
Benstoem C et al.  Cochrane 2020 CD013004   OPEN · BLOCKED · 0/19  (19,628 patients)
  route    PMC record exists; get_full_text_article returns EMPTY STRING
  barrier  Cochrane PMC deposits carry NO BODY TEXT in this API's rendering
```

⚠ **56 trials across 52,575 patients, in three open-licence reviews with live PMC
records, returning nothing.** This is exactly the class that makes `EMPTY` a separate
outcome from `MISS`: **a ladder that scored an empty body as "no data exists" would
have manufactured 56 absences here** — not from a rate limiter this time, but from a
deposit convention.

### 3. The document does not exist, and that is a finding

```
Cleland JGF et al. Cochrane CD002131 (beta-blockers in HF)   OPEN · STRUCTURALLY-ABSENT
  barrier  SUBSTANTIVE FINDING, NOT A RETRIEVAL FAILURE. The record reads back
           verbatim: "This is the protocol for a review and there is no abstract."
```

**The flagship Cochrane beta-blocker heart-failure review is a protocol that was never
completed.** Nothing failed. There is nothing there. A retrieval log that could not
say this would report it identically to the three above, and the correct response is
opposite in each case.

### 4. Paywalled, and structurally so

```
Tromp J et al.      JACC Heart Fail 2022    PAYWALLED · UNREACHABLE · 0/75
Komajda M et al.    Eur J Heart Fail 2018   PAYWALLED · UNREACHABLE · 0/58
van Essen BJ et al. JACC 2025               PAYWALLED · UNREACHABLE · 1/89
  barrier  convert_article_ids returns NO PMCID -- the paper is not in PMC at all,
           so the repository route is a structural dead end, not a failed fetch
```

Note the wording. **"No PMCID exists" is a fact about deposition, not a failed
request** — and it is knowable *before* the request, which makes it a plan, not an
error.

## The independent confirmation

The ladder ran the ten trials whose counts the ledger records as carried from a donor
supplement, and recovered **0 of 10** — reaching the same wall, without being told it
was there:

```
rung                  hit  ret-no-val  miss empty  fail  skip   reached      KB
R1_PRIOR_META         0           8     0     0     2     0        10     6512
R3_LITERATURE         0          10     0     0     0     0        10    15540
```

**Ten of ten at rung 3 are `RETRIEVED_NO_VALUE`** — 15.5 MB of the trials' own
reports fetched, and no `events/N` in any of them. That is the mechanism behind the
ledger's provenance label, derived independently: **the 1990s abstracts report
mortality as percentages and hazard statements, not as per-arm counts.** It is why
those counts had to come from a donor supplement in the first place — and why, with
that supplement now unserved, they cannot be re-derived from the primary literature.

## What this changes

1. **`RETRIEVED_NO_VALUE` must be a first-class state.** "We could not get the paper"
   and "the paper does not contain the number" are different findings with different
   remedies, and almost every review conflates them into "not extractable".
2. **`EMPTY` must be separate from `MISS`.** Three Cochrane reviews, 56 trials,
   would otherwise have been recorded as absent.
3. **`STRUCTURALLY-ABSENT` must be separate from `BLOCKED`.** One is a finding about
   the world; the other is a finding about the network.
4. **Report reachability beside licence, per source, with the barrier named.** A
   review that says "we searched open-access sources" has told the reader nothing
   about which of these four it met.

⚠ **Scope.** Twenty sources in one clinical question, recorded by one team; the
recovery fractions are that team's, using the tools it had on the dates recorded. The
*taxonomy* is what generalises; **the percentages are one corpus and should not be
quoted as a rate for open-access literature at large.**
