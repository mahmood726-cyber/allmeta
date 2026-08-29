# The data-finder ladder — built, wired into the harness, and measured

**Date:** 2026-08-29 · **Lane:** `lane/data-finder-ladder`, worktree `F:\tr-build\ladder`
**Modules:** `oa68k/ladder.py` · `oa68k/obtainability.py` · `oa68k/ladder_store.py` · `oa68k/ladder_bench.py`
**Standing orders:** `FIX-RUN-STANDING-ORDERS.md` §11 (the seven-layer map), §6b (search defines the set; open sources supply the values), §3 (plant every fix both ways).

---

## 0. What was built

Layer 3 of §11's map lists, under "what is missing": *"the retrieval LADDER (prior metas → CT.gov → OA full text → FDA/EMA → protocols) · the obtainability matrix · yield per rung."* That is what this is.

| module | what it is |
|---|---|
| `ladder.py` | the five rungs, the four states, the per-rung yield report |
| `obtainability.py` | the **only** thing that can grant `GENUINELY_UNOBTAINABLE` |
| `ladder_store.py` | the **write path** — a value enters the synthesis through here or not at all |
| `ladder_bench.py` | the HFrEF validation set, scored against a known answer |

**Plants: 28 + 10 + 14 = 52**, each watched failing on the defect, passing on the clean case, restored, and the restoration asserted. All pass.

---

## 1. The four states, and why the default is "not yet"

```
OBTAINED                the VALUE is in hand, with its provenance tier
NOT_YET_FOUND           the default. A statement about OUR SEARCH, never about the world
GENUINELY_UNOBTAINABLE  earned only through obtainability.earn_unobtainable()
NOT_YET_ATTEMPTED       no rung has run
```

Three counting rules live in the **types**, not in a convention someone must remember:

- **RETRIEVED is not OBTAINED.** A rung that fetches a document and extracts no value returns `RETRIEVED_NO_VALUE`, which does not advance the datum and is counted in its own column. This is the "317 of 317 retrieved / 31 primary reports" error made structurally impossible.
- **FAILED is not MISS.** A 403, a 504, a timeout is a fact about *our reach*. An empty result is a fact about the *source's index*. Separate columns, every rung, always.
- **Every rung's denominator is the data that REACHED that rung**, never `n` requested. The ladder stops at the first hit, so quoting `hits / n` would understate every lower rung.

---

## 2. `GENUINELY_UNOBTAINABLE` is earned — verified live against EMA

`earn_unobtainable()` refuses by default and requires all four:

1. **A named enumeration** — which register, and what one row means.
2. **Its retrieval date AND sha256** — a claim about a register is a claim about a *version*.
3. **A positive control found in the SAME BYTES, before any negative is accepted** — an enumeration that can only answer "absent" is not a check.
4. **Absence from the register's own rows.** `EvidenceKind.HTTP_STATUS` is rejected outright.

**Run live, 2026-08-29:**

```
EMA medicines register (medicines-output-medicines-report_en.xlsx)
  sha256  19c195990013616735091d1b57019fa43afb66a492002ab8a3a9a58d2f0954e7
  pulled  2026-08-29T21:09:04+00:00
  rows    5,285 distinct keys
  control positive control 'Entresto' FOUND among the 5,285 keys of sha256:19c19599
```

**Reconciliation of the denominator, because the number differs from the brief's and the difference matters:** the sheet has **2,741 rows** — exactly the brief's figure — of which **2,732 are data rows** after a 9-row preamble and header. My **5,285 keys** are larger than the row count because the enumeration harvests the *medicine name*, the *INN / common name* **and** the *active substance* columns, splitting multi-substance cells. That is deliberately the conservative direction: a wider key set makes absence **harder** to earn, not easier.

Four iron products — `Ferinject`, `Venofer`, `Monofer`, `CosmoFer`, and their INNs — are absent from all 5,285 keys. Verdict granted, with the licence stated on the verdict itself:

> *"Absence licenses exactly this: 'EMA has no centrally authorised product under this name, therefore no EPAR exists.' It licenses NOTHING about national authorisations, about FDA, or about the trial literature."*

The plants confirm it refuses a 404 as evidence, refuses a search miss, refuses a register whose control failed, refuses a register with no hash, and refuses when the register says the item *does* exist.

---

## 3. `ladder_store.emit()` — the write path, so this is a harness component

§11: *"every layer is invoked BY THE HARNESS ON THE WRITE PATH, and a review that skips one is not emitted. A check in a caller does not run when a different caller writes the file."*

`emit()` refuses, by name and with a reason:

| refusal | rule it enforces |
|---|---|
| `OBTAINED` with no estimate | RETRIEVED is not OBTAINED |
| `NOT_YET_FOUND` carrying a number | state and payload contradict |
| `GENUINELY_UNOBTAINABLE` with no granted verdict | absence must be earned |
| verdict resting on `http_status` | only a register's own rows can earn it |
| `prior_meta_table` value with no `reconciliation` field | §6b: attempt the primary read anyway and record the outcome — "not attempted" is allowed, silence is not |
| supplying attempt with no `retrieved_utc` / `payload_sha256` | a claim about a source is a claim about a version |

A refusal is **written to the ledger as its own kind** (`REFUSED_BY_WRITE_PATH`) rather than silently shrinking the denominator, and `report()` enumerates the kinds before printing the number.

---

## 4. The HFrEF benchmark

**Ground truth, established outside this codebase:** `C:\Projects\HFrEF-RUNIN-NMA.md`, 2026-07-16, §1.4 V1 — the table `trial | L1 registry | L2 abstract | used`. Eight HFrEF trials, all-cause mortality, all eight obtained by hand from open sources: three from the registry, five from abstracts.

**What the ladder is given:** the trial name, its aliases, the drug, and the NCT **where one exists**. Per §6b the included set is an input — a trial arrives from the search carrying its registry identifier.
**What is withheld:** the PMID, the DOI, the journal, the year, and the answer. Finding the trial's own report is part of the retrieval job.

**Three verdicts, never two:** `MATCHED` · `MISMATCHED` (obtained a value that is not the hand value — its own count, because folding it into "found" is exactly the retrieval-as-evidence error) · `NOT_FOUND`.

*(results table inserted below from the final run)*

---

## 5. What the ladder could not find, and why

*(inserted below)*

---

## 6. What already exists that we should be calling, not rebuilding

Two passes: a mechanical inventory of 822/822 worktree Python files and 78/78 `oa68k` modules (`out/REUSE-INVENTORY.md`), then a judged shortlist over 25 files opened one by one (`out/REUSE-SHORTLIST.md`).

⚠ **One instrument caveat, stated because the number is in the file.** The inventory's "Rung Reuse Map" counts a module as a rung-N implementation if it merely *contains a keyword*, which is a join measuring the join — it lists `dosehtml/dose-response-cli.py` as a rung-1 (prior meta-analysis) asset. **Its per-module table is sound; its rung-map counts are not, and are not quoted anywhere in this report.**

### Already reused — the ladder calls these today

| module | callable | what it saved |
|---|---|---|
| `oa68k/net.py` | `PoliteSession` | the rate gate, Retry-After, backoff. Hand-rolling this earned 503 on 8/8 rung-1 calls before it was delegated. |
| `oa68k/config.py` | `reqs_per_sec()` | the shared per-node NCBI budget |
| `oa68k/jats.py` | `parse_tables(xml_bytes)` | real `<thead>` handling, including the PLOS `<td>`-header case, for the rung-1 table reader |
| `rct-extractor-v2` | `rx.extract(text)` | 180+ effect patterns, SE derivation, per-effect consistency check. Loose-coupled by env var exactly as `extractor_bridge/extract_meta.py` already does it — **not vendored**. |

### Should be reused next — named, with the exact reason

| module | callable | what the ladder currently duplicates |
|---|---|---|
| `oa68k/trial_key_audit.py` | `fetch_pubmed(sess, pmids) -> {pmid: {pub_types, databanks, abstract, year}}` | **the closest duplication in the whole build.** It already batches ≤200 PMIDs and parses `<DataBank>` with ElementTree — the exact mechanism `_rank_reports` re-derives by regex. It is short two fields: `ArticleTitle` and `CollectiveName`. **Add those two and `_rank_reports` can delegate outright.** |
| `oa68k/refjoin.py` | `ref_entries_full(xml)`, `resolve(label, refs)` | acronym / surname-year / surname-only label resolution with explicit ambiguity rejection — the identity layer rung 1 needs to map a forest-plot row label to a trial |
| `oa68k/refmatch.py` | `match_label(label, refs, year_slack=1)` | same, resolving a study label to exactly one PMID |
| `oa68k/harvest.py` | `fetch_fulltext(sess, row)` | the efetch-JATS → EPMC → BioC cascade with caching, which rung 3's full-text step re-implements |
| `oa68k/fda.py` | `ingest()`, `harvest(limit)`, `extract_and_link(limit)` | FDA's **official** ApplicationDocs inventory, review-PDF fetching, and protocol-code → NCT linking via AACT `id_information`. Rung 4 currently only probes openFDA and records addresses. |
| `oa68k/net.py` | `append_jsonl`, `load_done_keys` | the ladder has no durable ledger or resume set yet; `ladder_store.emit()` writes but does not skip completed requests |
| `oa68k/registry_ids.py` | `find_all(text)` | NCT + ISRCTN + PACTR + CTRI + ChiCTR + EudraCT extraction. The ladder is NCT-only, which is a real coverage limit for non-US registries. |
| `oa68k/forestvision.py` | `check_extraction(doc)` | over-determined forest-row arithmetic checking |

### The repos worth pulling from, and one that does not exist

- **`rct-extractor-v2`** (v5.0.0, commit `6427e00`) — *the* V2 extractor. Clean public API, 17 specialties, arm-level 2×2 output. Already wired here.
- **`repro-checker`**, **`cardiosynth`**, **`registry-ipd`**, **`metaextract`**, **`ctgov-search-strategies`**, **`living-meta-engine`**, **`rapidmeta-kit`** — the closest things to a retrieval/extraction pipeline in the account.
- ⚠ **There is no `metapipe`.** No local directory under `F:\`, `C:\Projects\`, or `C:\` matches, and neither `mahmood726-cyber` nor `mahmood726` owns a repo of that name (`gh search repos metapipe --owner ...` → 0). The candidates above are what I take the intent to have meant; if `metapipe` is a real thing it is somewhere I have not been told about, and I am not going to guess which of these it is.
