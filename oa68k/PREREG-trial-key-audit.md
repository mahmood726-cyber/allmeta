# PRE-REGISTRATION — trial-layer KEY-ABSENT vs DATA-ABSENT audit
**Written 2026-07-16 13:0x, BEFORE running the test. Frozen.**
Complies with METHODS-CONTRACT §1 (pre-specify then look) and §0 (do not report our
ceiling as the world's limit).

## Why the previous test does not count

`keyaudit.py` scanned the **meta-analysis's own prose** for registration IDs and
returned KEY-ABSENT 0.24% / DATA-ABSENT 95.52%. That measured the wrong layer: a
meta-analysis does not print its included trials' registration numbers. The result is
**void as evidence about the hypothesis** and is not reported as a limit.

## Hypothesis (Mahmood's, stated as his)

> The trials our NCT join misses are **KEY-ABSENT** (registered on PACTR/ISRCTN/CTRI/
> etc., with no NCT) rather than **DATA-ABSENT** (never registered anywhere). If so,
> our join predicate is defining African/LMIC trials out of the corpus and we would be
> reporting our own engineering limit as a property of the evidence base.

## Unit of analysis

**Cited trial papers**, reached via each OA meta's reference list (`ref PMIDs` from
JATS `<pub-id pub-id-type="pmid">`) — NOT the meta itself.

## Instrument (open-access only)

PubMed `efetch db=pubmed` (batched, ≤200 ids/request) for each cited PMID. Two fields:
- `<PublicationType>` — is this actually a trial (RCT / Clinical Trial)?
- `<DataBankList>` — PubMed's **structured** registration field:
  `<DataBankName>` ∈ {ClinicalTrials.gov, ISRCTN, PACTR, CTRI, ChiCTR, EudraCT,
  UMIN-CTR, IRCT, ANZCTR, ...} + `<AccessionNumber>`.
  This is a curated field, not a regex over prose — strictly better evidence.
Fallback layer: regex over the abstract text for any registry ID (`registry_ids.py`).

## Population

Cited PMIDs whose `PublicationType` marks them a trial AND which have **no NCT** via
AACT `study_references` (DERIVED/RESULT). These are exactly the records our join
currently discards.

## Outcome

Among that population, the proportion carrying **any non-NCT registration** in
DataBankList or abstract text.
- **KEY-ABSENT** = registered, not on CT.gov → recoverable by widening the key.
- **DATA-ABSENT** = no registration of any registry found in any layer.

## ⭐ PRE-SPECIFIED REFUTATION CRITERION (stated before looking)

- **≥30% KEY-ABSENT → hypothesis CONFIRMED** as a major lever; widening the key is the
  priority and the NCT-only join is understating the evidence base materially.
- **<10% KEY-ABSENT → hypothesis REFUTED** as a major lever. The misses are mostly
  genuinely unregistered (typically pre-2005, per the 30.2% pre-registration-era
  figure already measured), and key-widening buys little. **This result gets reported
  exactly as loudly as a confirmation would.**
- **10–29% → PARTIAL**; worth doing, not the main story.

## Sample

First **400** eligible cited trial PMIDs encountered while streaming the harvest
ledger in existing order (no selection on disease, registry, or outcome). Sample size
fixed here; it will not be extended after seeing the result.

## Reported separately regardless of result

malaria / TB / **NCD** (per standing order). Small-n cells will be labelled as such
and not interpreted.

## Known limits of this test (stated up front)

1. PubMed DataBankList is curated but **incomplete** — a trial registered on PACTR
   whose paper never declared it will read DATA-ABSENT here. So this measurement is a
   **lower bound on KEY-ABSENT**, and a REFUTATION is therefore the weaker inference
   of the two. Say so if it refutes.
2. The definitive cross-registry instrument is **WHO ICTRP bulk**, which requires a
   data-use agreement. **Not accepted on Mahmood's behalf; terms to be surfaced to
   him.** Until then this test cannot see trials registered ONLY on a non-indexed
   registry with no paper declaration.
3. Trials in **no meta at all** are outside this frame entirely (the oracle's blind
   spot).
