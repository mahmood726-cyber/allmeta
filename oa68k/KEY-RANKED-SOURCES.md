# Open sources RE-RANKED BY JOIN KEY (not by data volume)
**2026-07-16 · oa68k join-key lane · supersedes the volume ranking in
`F:\ubcma\regpub_pilot\opendata_scan\INTEGRATION_ROADMAP.md` for THIS lane only**

The roadmap ranks by *poolable data gain*. Today's diagnosis says the bottleneck is
the **join key**. Those give different orders. Criterion here:

> **Does this source carry a trial identifier we can join on, and can Kampala reach it?**

A source that adds data we cannot attach to a trial adds to the unlinked pile.

---

## The re-ranked table

| rank | source | carries a KEY? | reachable? | verdict vs volume-rank |
|---|---|---|---|---|
| **1** | **WHO ICTRP bulk** | ⭐ **IT IS THE KEY** — the cross-registry index (PACTR/CTRI/ChiCTR/ISRCTN/EUCTR/REBEC/ANZCTR in one hub) | bulk CSV, free, **non-commercial + attribution**; ⛔ **needs a data-use agreement — NOT accepted on Mahmood's behalf** | **3 → 1.** Not "+25–33% registrations"; it is the only source that supplies the identifier our join lacks. **No results data** — key only. |
| **2** | **Crossref reference lists** | ⭐ asserts **which trials belong together** (expert-performed linkage), + DOIs | **CC0, unmetered, no key** | **new → 2.** Primary reference-list route. |
| **3** | **Europe PMC / PMC-OA JATS** | ✅ both: the trial's own registration declaration **and** the numbers | free, no key, CC-licensed, redistributable | **1 → 3.** Still essential — but see the correction below: **already wired, already measured, and the 2–4× is not real.** |
| 4 | PubMed `<DataBankList>` | ✅ curated registry+accession per paper | free E-utils | **new.** Already in use (`trial_key_audit.py`); incomplete ⇒ lower bound. |
| 5 | OpenAlex | ✅ DOI/PMID crosswalk | ⚠️ **METERED — $1/day free (2026 change)** | **2 → 5.** **Demoted**: cannot assume free at 68k scale. Supplement to Crossref, never primary. Do not exceed the free tier or route around metering. |
| 6 | Unpaywall | ⚠️ locates copies, no trial ID | free | data-locator, not a key. |
| **7** | **Bronze OA** | ⛔ **no key, and measured 0 verified datapoints** | readable, **not redistributable** | **falls hard.** Data without a handle. |
| — | ISRCTN direct | ✅ has keys | ⛔ **forbids database-population** | **reach via ICTRP ONLY.** |
| — | Conference abstracts | ⛔ | ⛔ Embase-only aggregator | **out of mission** (0 of 1,093 corpus pubs). |

---

## ⚠️ CORRECTION — the "unexploited 2–4×" is neither unexploited nor 2–4×

The instruction to fold in "the largest verified input-layer number we own (2–4×)" is
**contradicted by the roadmap's own header**, which I read before acting:

> *"PHASE 1 EXECUTED 2026-07-07 … poolable **T2D 39.6% → 46.0%**, **onc 24.0% → 32.7%**,
> **pooled 34.8% → 41.9% (+7.1 pts, +20% relative)** … The §0/§2 projection of
> '→55–61% / 45–60%' was **OPTIMISTIC**: it assumed a 70–90% full-text→poolable
> conversion; the real conversion on gap trials is ~**21–22%** … The entire lift came
> from Europe PMC JATS; bronze/green OA copies added **0 verified datapoints**."*

So: **2–4× was a projection; +7.1 pts (+20% relative) is the measurement.** Chasing the
2–4× would be chasing a number reality already cut. And it is **not unexploited** — this
lane's harvest **is** the Europe PMC/PMC-OA JATS route (`efetch db=pmc`), already running
at corpus scale with **35k+ JATS cached**. The idle lane's job is, in substance, done here.

**The genuinely useful part of that finding** is its *cause*, which explains my own 89%:
> *"most non-poolable trials are **structurally non-poolable** — single-arm / dose-finding /
> PK / safety / subgroup / median-only — **even at full text**."*
That is a real ceiling of the evidence, not of our pipeline — the one case §0 permits.

---

## ⭐ Independent corroboration of this lane's key measurement

| source | measurement | n |
|---|---|---|
| **this lane** (`trial_key_audit.py`, pre-registered) | **KEY-ABSENT 10.95%** — cited trials our NCT join misses that carry a non-NCT registration | 1,662 trials |
| **opendata_scan** (independent corpus, 2026-07-07) | **13.2% (T2D) / 8.0% (onc)** carry a non-CT.gov registry ID | 950 trials |

**Two independent corpora, two methods, ~8–13%.** The key-widening lever is real and it is
**~1 in 10** — consistent with my pre-registered **PARTIAL** verdict, and inconsistent with
key-absence being the dominant cause of the unlinked pile.

⚠️ Both are **lower bounds**: they see only registrations the *paper* declared. Both
scans also found **PACTR ≈ 0** (their ChiCTR 0 / PACTR 0; my PACTR 1 of 1,662). ICTRP
bulk is the only instrument that would settle it — and it is gated on the WHO agreement.

---

## What this re-ranking changes

1. **ICTRP is now the top ask** — and it is **blocked on a decision only Mahmood can make**
   (WHO data-use terms). That is the single highest-value unblock in this lane.
2. **Crossref replaces OpenAlex** as the reference-list route (metering).
3. **Bronze OA is dropped** from this lane — 0 verified datapoints, no key, no redistribution.
4. **Do not re-wire Europe PMC full text** — it is wired and running here.
5. The **89% DATA-ABSENT** population is now partly explained: a large share is
   *structurally non-poolable*, not merely unlinked. Quantifying that split is the next
   measurement, and it is a real-ceiling question, not a key question.
