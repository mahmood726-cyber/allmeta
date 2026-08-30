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

**Plants: 63 (`ladder.py`) + 14 (`ladder_store.py`) + 10 (`obtainability.py`) = 87**, each watched failing on the defect, passing on the clean case, restored, and the restoration asserted. All 87 pass. **Thirty of the 63 in `ladder.py` exist because a benchmark run produced a wrong number and the fix had to be pinned so it cannot come back.**

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

### Result — first-hit cascade, run 2026-08-29

| trial | human used | ladder verdict | rung | tier | ladder | hand |
|---|---|---|---|---|---|---|
| PARADIGM-HF | L2 abstract | MATCHED | R3 literature | trial_report | 0.84 | 0.84 |
| SOLVD | L2 abstract | MATCHED | R3 literature | trial_report | 0.84 | 0.84 |
| DAPA-HF | L1 registry | MATCHED | R2 registry | registry_results | 0.83 | 0.83 |
| EMPEROR-Reduced | L1 registry | MATCHED | R2 registry | registry_results | 0.92 | 0.92 |
| EMPHASIS-HF | L1 registry | MATCHED | R2 registry | registry_results | 0.761 | 0.761 |
| RALES | L2 abstract | MATCHED | R3 literature | trial_report | 0.70 | 0.70 |
| MERIT-HF | L2 abstract | MATCHED | R3 literature | trial_report | 0.66 | 0.66 |
| CIBIS-II | L2 abstract | MATCHED | R3 literature | trial_report | 0.66 | 0.66 |

```
MATCHED     8/8   of the 8 data a human obtained by hand from open sources
MISMATCHED  0/8
NOT_FOUND   0/8
```

**The ladder's routing agrees with the human's on all eight**: the three trials he took from the registry, the ladder took from the registry; the five he took from abstracts, it took from abstracts.

### Yield per rung — first-hit cascade

```
  rung                  hit  ret-no-val  miss  fail  skip   reached    sec     KB
  R1_PRIOR_META         0           8     0     0     0         8   165.5     64
  R2_REGISTRY           3           1     0     0     4         8     2.5   1508
  R3_LITERATURE         5           0     0     0     0         5    70.2  11838
  R4_REGULATORY         0           0     0     0     0         0     0.0      0
  R5_PROTOCOL           0           0     0     0     0         0     0.0      0
```

**`reached` is the denominator, and it is the denominator OF a different set for each rung**: the data still unfound when that rung ran. R3's 5/5 is 5 of the 5 data that reached it, not 5 of 8. R4 and R5 have `reached = 0` — **nothing reached them, so this run measures nothing at all about the regulatory rung.** A `0` in their `hit` column would be a lie; the honest statement is that they are unmeasured here, which is why the `--all-rungs` pass exists.

⚠ **Cost is not free and the cheap rung is not the first one.** R2 supplied 3 data in **2.5 seconds**; R1 supplied 0 in **165 seconds**, 66× the cost of the rung that actually worked. If the ladder's order were cost-optimal it would put the registry first.

### Yield per rung — every rung run on every datum (`--all-rungs`)

The cascade cannot measure a rung that nothing reaches. This pass runs all five on all eight, so each rung gets the same denominator and its **standalone** yield is visible.

```
  rung                  hit  ret-no-val  miss  fail  skip   reached    sec
  R1_PRIOR_META         0           8     0     0     0         8    96.7
  R2_REGISTRY           3           1     0     0     4         8     2.2
  R3_LITERATURE         8           0     0     0     0         8   100.3
  R4_REGULATORY         0           8     0     0     0         8    12.1
  R5_PROTOCOL           0           2     2     0     4         8     0.4
```

Read across:

- **R3 alone gets all eight.** The trial's own report, reached through Europe PMC + NCBI, is sufficient for this whole set on its own.
- **R2 gets 3 of the 4 that have an NCT** — the fourth is PARADIGM-HF, whose registry entry posts counts but no hazard ratio, exactly as the hand table records ("counts, **no HR**"). The other 4 are `SKIPPED`: they predate the registry. **`skip` is its own column precisely so those 4 never quietly enter a denominator.**
- **R4 reached all 8 and returned 8 × `RETRIEVED_NO_VALUE`.** It found FDA applications for every drug (5 each) and read a value from none. That is not "FDA has nothing" — see §5.
- **R5 found posted Protocol and SAP documents for 2 of the 4 NCT-bearing trials** and deliberately mined no value from them.

⚠ **`hit=0` for R1 and R4 is a measurement of OUR EXTRACTOR against those sources, not of those sources.** R4 returned documents and no number we could read. **R1 returned nothing at all** — see §5: its note in this table said "8 retrieved" when 0 were retrieved, and that note is now fixed. The `hit` and `reached` columns are unaffected; only R1's *reason* was mislabelled.

⚠ **And a live operational fact, recorded because it will recur:** after roughly ten benchmark runs against Europe PMC in two hours, its search endpoint began returning **503** to rung 1's query. The re-run started after the fix records those as `FAILED`, which is the correct label — a fact about our reach and the source's patience, not about the corpus. **The rung-1 finding below does not rest on that run**; it rests on `rung1_diagnose.py`, which retrieved all 8 metas successfully.

### It took six runs, and every fix came from a plant or a measurement

Reported in full because the intermediate numbers are the evidence that the final one is not luck:

| run | matched | what it found |
|---|---|---|
| 1 | 0/8 | hand-rolled HTTP with no rate gate → 503 on 8/8 rung-1 calls; `'Hazard Ratio (HR)'` scored an exact hit as a mismatch |
| 2 | 3/8 | citing papers mined as if they were the trial's report (PARADIGM-HF 1.82 from a Chagas cardiomyopathy paper) |
| 3 | 6/8 | secondary analyses outranking primary reports; `retmax` dropping the old papers |
| 4 | 6/8 | SOLVD's primary *rejected* — its title never names the trial; the name is in the collective author |
| 5 | 7/8 | `"/"` as a composite marker killed MERIT-HF's own sentence via "metoprolol CR/XL" |
| 6 | **8/8** | the 1997 design paper outranking the 1999 results paper |

---

## 5. What the ladder could not find, and why

**Nothing, on this set** — but that sentence is worth exactly one benchmark of eight data on one outcome in one disease, and no more. What it *did* fail at, and what remains genuinely out of reach:

### ⭐ Rung 1 returned 0 hits — and diagnosing that zero found a defect in MY OWN instrument, and then the real answer

Mahmood: *"best source is previous metas — and that data is peer reviewed so easy to use."* A zero against a stated premise gets diagnosed before it gets reported, so I wrote `rung1_diagnose.py` to separate three explanations: the metas do not carry it / they carry it as **pixels** / our reader missed it.

**The diagnostic immediately found a fourth explanation I had not enumerated, and it was mine.**

> Every one of the 8 full-text fetches was returning **404**, while rung 1's own note said *"8 OA meta full texts retrieved"*.

Two defects in one line, and the first is the exact error this module exists to prevent:

1. **It counted loop iterations as retrievals.** `tried += 1` sat *before* the fetch. **"RETRIEVED is not OBTAINED" — committed inside the module written to enforce it.** Every benchmark run so far had been reporting 8 retrievals of 0.
2. **It used a route this repo already documents as broken from this host.** `config.py`, verbatim: *"efetch serves TRUE JATS … and works from this host where EPMC sub-resources are proxy-404'd."* `harvest.fetch_fulltext()` implements that cascade and was sitting there unused. **The single most concrete argument for the reuse list in §6 is that I did not read it first.**

And under that sat a **third** defect, in shared code: `harvest._cache()` writes to `C.CACHE`, which does not exist in a fresh worktree. `open()` raised `FileNotFoundError`, `fetch_fulltext`'s own `except Exception: pass` swallowed it on all three tiers, and it returned `reason="no_free_fulltext"` — **a claim about the world manufactured by a missing local directory.** Fixed at the root with `os.makedirs(C.CACHE, exist_ok=True)`, which converts that sentinel from a lie into a truth for every caller, not just this one.

**With retrieval actually working, the diagnostic answers the question:**

```
8 OA meta-analyses naming DAPA-HF, retrieved (of hitCount 159)
  tables                  19
  scoped_tables            0     <- no table's caption/headers name all-cause mortality
  rows naming DAPA-HF      2     <- both in "Characteristics of included RCTs" tables
  rows with an effect+CI   1     <- and that one is a characteristics row, not an outcome
  figures                 32
  fig captions scoped      7     <- SEVEN figure captions DO name the outcome
```

⇒ **Route B, measured rather than assumed: in these meta-analyses the per-trial mortality numbers are in FOREST PLOTS, not tables.** Zero table captions scope to the outcome; seven figure captions do. Rung 1's ceiling is the **modality**, not the corpus — and `oa68k` already owns the layer that reads pixels (`forestvision.py`, `visionshard.py`, `answerkey.py`), whose own measurement points the same way (`SHARDA-ANSWER-KEY-YIELD.md`: 74.5% of 137 forest figures carry no per-arm data, and what does exist is in figures).

**Mahmood's premise is not refuted by rung 1's zero.** The data *is* there — it is just drawn rather than tabulated, and the ladder as built reads only text.

### CT.gov version history is unreachable **from this host** — and that is a retrieval fact, not an evidence one

`/api/int/studies/<NCT>/history` returns **403** here on every variant tried: with browser headers, with a `Referer`, with a session cookie from the study page, and on `classic.clinicaltrials.gov`. The v2 path returns **404**, as the brief said. Every probe is recorded as `FAILED`, and the note says so in words:

> *"history FAILED http 403 from this host — a fact about OUR REACH, not about whether the revisions exist"*

**This is not a claim that `originalData` is unavailable.** It reached the brief's author from somewhere else. The correct next step is a different egress, not a conclusion.

### Two capabilities the ladder does not have, named rather than approximated

1. **FDA review PDFs are addressed but not read.** Rung 4 reports where a review lives (`accessdata.fda.gov/drugsatfda_docs/nda/<year>/<applno>Orig1s000StatR.pdf`) and does not parse it. The reviews of the era we care about are **scans**: `regulatory/REGULATORY-SOURCE.md` §5 measured the text layer at **2%** for FDA's pre-2005 documents. At scale this is an **OCR problem, not a retrieval problem**, and there is no OCR engine in this environment. Saying "rung 4 yields 0" without saying that would be a claim about the evidence made out of a gap in our tooling.
2. **Protocols and SAPs are located, not mined.** Rung 5 records `documentSection.largeDocumentModule.largeDocs` and stops. A protocol says what *will be* measured; treating it as a results source is the "a data-extraction table is not a synthesis commitment" error, and it is deliberately not done.

### Non-US registries are out of reach by construction

The ladder is NCT-only. `oa68k/registry_ids.py` already extracts ISRCTN, PACTR, CTRI, ChiCTR and EudraCT accessions; the ladder does not call it yet. **Every trial registered only outside CT.gov currently skips rung 2 entirely** — visible in the benchmark as 4 `SKIPPED` at R2, all of them pre-registry trials, but the same hole applies to a live Chinese or Indian trial.

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
- ⚠ **There is no `metapipe`.** (see below) No local directory under `F:\`, `C:\Projects\`, or `C:\` matches, and `gh search repos metapipe --owner mahmood726-cyber` returns 0. (A later check settled a loose end in that sentence: **`mahmood726` is not a GitHub handle at all** — `gh repo list mahmood726` returns *"the owner handle was not recognized as either a GitHub user or an organization"*. So there is one account, `mahmood726-cyber`, and it has no `metapipe`.) The candidates above are what I take the intent to have meant; if `metapipe` is a real thing it is somewhere I have not been told about, and I am not going to guess which of these it is.

---

## 7. What to do next, in the order it is worth doing

1. **Delegate `_rank_reports` to `trial_key_audit.fetch_pubmed`** after adding
   `ArticleTitle` and `CollectiveName` to its return. It already batches 200 PMIDs and
   parses `<DataBank>` properly with ElementTree; the ladder re-derives that by regex.
   Cheapest reuse win in the list.
2. **Point rung 1 at the vision layer, not at more table regexes.** The measurement says
   the per-trial numbers in OA meta-analyses are pixels; `forestvision.py`,
   `visionshard.py` and `answerkey.py` already read pixels. Route rung 1 through the
   stored figure extractions and re-measure its yield against the same 8 data.
3. **Reorder the rungs by measured cost.** R2 supplies at 0.3 s/datum and R1 at 12 s/datum
   for nothing. The premise that prior metas are the cheapest source is not what the
   instrument measures; either the routing follows the measurement, or the measurement
   gets a stated reason why it should not.
4. **Give rung 2 the other registries.** `registry_ids.find_all()` already extracts
   ISRCTN/PACTR/CTRI/ChiCTR/EudraCT. Until it is called, every non-CT.gov trial skips
   rung 2 entirely.
5. **Find a working egress for CT.gov history.** 403 here on every variant; it works
   elsewhere. That is a network problem with a network answer, and `originalData` is the
   only route to what a sponsor changed after the fact.
6. **Widen the benchmark before trusting the 8/8.** One outcome, one disease, eight data,
   and the trials are famous. The number that would mean something is the same ladder on
   a set where the trials are obscure — and on a *second* field (per-arm N, or the harms
   count) where the extractor has no cue list tuned to it.

## 8. Two things this run should not be read as saying

**"8/8" is not a claim about the ladder's accuracy.** It is a claim about eight data on
one outcome in one disease, where the ground truth was a table one person built. The
honest reading is: *the ladder reproduces, unaided, the retrieval a domain expert did by
hand on his own best case, including choosing the same source layer for each trial.*
That is worth having and it is not a generalisation.

**"rung 4 yields 0" is not a claim about regulatory documents.** Rung 4 retrieved
something for all eight and parsed a value from none, because the reviews that carry
per-trial results are scanned PDFs and this environment has no OCR. `regulatory/`
already proved per-trial recovery from an FDA statistical review by hand
(oseltamivir, both pivotal trials, per-arm N + medians + 95% CIs). **The rung is
unimplemented, not empty**, and the distinction is exactly the one this whole design
exists to keep.

---

# ADDENDUM — after the sibling lane's findings (2026-08-30)

## A1. Its headline does not describe the artefact I can see, and the difference is the filename

The sibling reported: *"`HFREF_NMA_FULL_REVIEW.html` carries 44 NAMES AND NOTHING ELSE — every `nct` is a placeholder `HF-001`, no PMIDs, no DOIs, no counts."*

I could not find that file. What exists at `F:\rapidmeta-finerenone-hfref-wt\HFREF_NMA_AUTO_FULL_REVIEW.html` (1,135,362 bytes) — note **`_AUTO_`**, a different name — parses to a `trials[]` array of **28** entries, measured:

| field | present |
|---|---|
| `id` (e.g. `HF-001`) | 28/28 |
| `name` | 28/28 |
| **`pmid`** | **28/28** |
| `doi` | 26/28 |
| `nct` | 11/28 (incl. `ChiCTR1900021929`, `EudraCT 2013-005326-38`) |
| **arms with `events` + `n`** | **28/28** |
| `pmid_note` | 28/28 |

**`HF-001` is the internal `id` field, not the `nct`.** `nct` is explicitly `null` where absent, and every trial carries a PMID and a full 2×2.

I am not claiming the sibling is wrong about *its* file — I am claiming these are **two different artefacts and the report must name which**. This is this project's own rule arriving from the other direction: a page NAME is not an artefact identity. Both figures should be quoted with a path and a byte count, or neither.

## A2. Identity, measured — and the gap is much smaller than "names and nothing else"

`oa68k/identity.py` (rung 0, cost counted separately). It refuses to write an identifier it cannot demonstrate, and reuses `trial_key_audit.fetch_pubmed` — the top item on the reuse shortlist — rather than re-deriving `<DataBank>` parsing.

**Demonstration standard.** D1: the trial's own report declares its registration in PubMed `<DataBank><AccessionNumber>`. D2: CT.gov's own `acronym` equals the name. *"First hit for a text query" is a GUESS and is refused* — an unverified NCT does not fail loudly, it silently redirects every later rung to a different trial.

```
IDENTITY -- rung 0, over 28 trials
  denominator is OF: the trials carried in the corpus's own trials[] array
  PMID held by the corpus            28/28
  DEMONSTRATED registration (D1)     11/28
  held but UNVERIFIED                 0/28
  unresolved                         17/28
     of which reported pre-2005        16   <- absence EXPECTED, no mandate existed
     of which 2005 or later             1   <- the only real gap: Vizzardi 2014
  CONFLICTS (held != declared)          0
```

**Answer to "what would it take to give these trials real registrations": almost nothing, because almost none are missing one.** All 11 identifiers the corpus holds are confirmed by the papers' own declarations — none were guesses. Sixteen predate ICMJE-2005/FDAAA-2007 and correctly have no registration; recording those as `GENUINELY_UNOBTAINABLE` would be wrong, because "no mandate existed" is a structural argument, not a register's answer about that trial. **One trial is a real gap.**

This also confirms the sibling's *shape* while differing on its magnitude: **the registry rung's ceiling is set by ERA, not by our retrieval.** Here that ceiling is 11/28 (39%); they predicted ~13/44 (30%) on their set.

⚠ **Two defects in my own identity code, both caught before reporting.** (1) A raw string compare called `EudraCT 2013-005326-38` vs `2013-005326-38` a CONFLICT — two accusations of data disagreement manufactured by a registry *prefix*. (2) I scraped the publication year out of `pmid_note` prose, which carries the date the note was *verified*; it returned **2026 for US-Carvedilol (1996)** and inverted the era split, reporting 6 "real gaps" where there is 1. PubMed's `<PubDate><Year>` was already in hand. A date is a typed field; scraping one is how you invert your own headline.

## A3. The prose route was inventing values — and this is the real answer on rung 1

Once rung 1's retrieval worked (§5), it produced 4 values and **the benchmark fell from 8/8 to 5/8**. Three came from the prose window and all three were wrong; the fourth came from a post-hoc statin sub-analysis row. Full detail in the commit; the one-line mechanism is **a meta-analysis's prose names many trials, so proximity is not attribution** — the same thing this module already refuses at rung 3, permitted at rung 1 by inconsistency.

The prose route is **deleted**. With tables only:

```
R1_PRIOR_META  0 hits / 8 reached   64 OA meta full texts retrieved, 9.3 MB
```

and the note now says *"8 of 8 OA meta full texts RETRIEVED (0 unobtainable); none of the 8 retrieved yielded a scoped value"* — a true sentence, where before it said "8 retrieved" of zero.

**And SO 6b is now implemented rather than quoted.** `_reconcile()` runs the primary read behind every prior-meta hit, the primary wins on tier order, and the pair is stored either way. Measured on the four prose-era values: **the prior-meta cell reproduced the trial's own report once in four.** *"Peer-reviewed" describes the meta-analysis; it does not describe any single cell someone typed into its table.*

The write-path gate had already refused all four for lacking a `reconciliation` field — **it caught exactly the values that turned out to be wrong**, before the benchmark scored them.

## A4. Adopted from the sibling lane

- **`EMPTY` is now a separate `Outcome` from `MISS`.** A 200 with an empty body is a rate limiter, never an empty source. Their fetcher met two; a ladder scoring those as absence would have manufactured eleven. The family is now complete in one place: *200 is not a document · 000 is not a paywall · 404 is not absence · an empty 200 is not an empty source.*
- **Rung 0 identity, cost counted separately** so it can neither inflate nor deflate any rung's yield.
- **`SKIPPED` = "no plan: a required identifier is absent"**, which is their `EMPTY — no plan` case. I keep it distinct from `EMPTY` because conflating "we had nothing to ask" with "the source answered with nothing" loses the identity finding.

Their `states.py` refusal machinery (`Demonstration` / `ProbeFailure` / `declare_unobtainable`, with no converter between the first two) is stronger typing than my `obtainability.py`, which reaches the same refusals through validation rather than through the type system. **These are duplicates and one should go — theirs.** Mine should be reduced to what it uniquely has: the live EMA enumeration builder that produces the `Enumeration` + `PositiveControl` their `Demonstration` requires.

## A5. Plants

**63 in `ladder.py`, 14 in `ladder_store.py`, 10 in `obtainability.py` = 87.** All pass. Plant 18 exists because `_reconcile` — the rule that makes rung 1 safe — had **never once run** in a live benchmark; writing it exposed that `_reconcile` called rung 3 directly and so could not be stubbed, meaning its own check could only ever have run against the network.

---

# ADDENDUM 2 — the donor-supplement ten (2026-08-30)

## B1. The result: **0 of 10**

The ten trials in `F:\E156\hfref-trial-ledger-v3.jsonl` whose outcome provenance is
`counts_source: "donor supplement"` — i.e. whose per-arm counts were carried from a
prior meta-analysis rather than read from the trial's own report. Scored on **per-arm
event counts, exactly**: integers, no tolerance.

```
  id      trial                    identity     verdict      rung
  HF-005  Captopril-Digoxin 1988   -            NOT_FOUND    -
  HF-006  Beller 1995              -            NOT_FOUND    -
  HF-007  van Veldhuisen 1998      -            NOT_FOUND    -
  HF-008  SPICE                    39957733     NOT_FOUND    -
  HF-009  STRETCH                  42518831     NOT_FOUND    -
  HF-019  RESOLVD                  10477530     NOT_FOUND    -
  HF-052  Colucci 1996             -            NOT_FOUND    -
  HF-053  MOCHA                    4448900      NOT_FOUND    -
  HF-054  PRECISE                  42667216     NOT_FOUND    -
  HF-055  Cohn 1997                -            NOT_FOUND    -

  STAGE 0  identity DEMONSTRATED    5/10
  STAGE 1  counts MATCHED exactly   0/10
           counts MISMATCHED        0/10
           not found               10/10
```

### Yield per rung — and what each rung actually read

```
  rung                  hit  ret-no-val  miss empty  fail  skip   reached    sec
  R1_PRIOR_META         0           5     0     0     5     0        10   266.8
  R2_REGISTRY           0           0     0     0     0    10        10     0.0
  R3_LITERATURE         0           7     3     0     0     0        10   649.7
  R4_REGULATORY         0           0     0     0     0    10        10     0.0
  R5_PROTOCOL           0           0     0     0     0    10        10     0.0
```

- **R1** read **5 OA meta-analyses' full texts** (3.5 MB) and found no table row for these trials; the other 5 subjects hit Europe PMC **503** and are recorded `FAILED`, not `MISS`.
- **R2 and R5 never ran**: all ten lack an NCT, so there is **no plan**. `SKIPPED` is its own column exactly so those ten do not enter a retrieval denominator.
- **R3** read **17 MB across 10 subjects** — for PRECISE, 180 PubMed records of which 175 are the trial's own reports — and extracted no per-arm mortality counts from any abstract.
- ⚠ **R4 never ran either, and that is a defect in MY BENCH, not a measurement of FDA.** I did not pass a drug name, so `rung4_regulatory` returned `SKIPPED` ten times. **"Rung 4 yielded 0" would be a false claim here**; the correct statement is *0 of 0 attempted*. Passing the drug (recoverable from the `edge` field and from names like "Colucci 1996 (US Carvedilol program)") is the first thing to fix before this row means anything.

## B2. The ladder hits the same wall the ledger already documents — independently

This is the part worth keeping. The union ledger's SOURCE record for the donor that
holds these counts:

```
SRC-B17  Burnett H et al. Circ Heart Fail 2017;10(1):e003529
  access_tier  OPEN          reachability  BLOCKED
  recovered    30 of 57      shortfall     27
  taken_from_it  "30 trial names read from Fig 2/3/4 legends; ZERO arm-level counts"
  _barrier       Supplement Table II ... bot-mitigation on the publisher supplement
```

and the only core-set NMA that publishes denominators at all:

```
SRC-DM22  De Marzo V et al. J Intern Med 2022  —  69 of 69 trial names + ARM DENOMINATORS
          ... per-arm EVENT counts not recovered
```

⇒ **The route a human used to get these ten was a donor supplement that is now behind
bot-mitigation.** The ladder's 0/10 is not a different answer from the ledger's — it
is the same answer, reached without being told. `access_tier: OPEN` and
`reachability: BLOCKED` together are the whole finding: **the licence permits it and
the bytes are not served.**

## B3. Identity: an acronym match is not an identity either

The first corroborated-free run "demonstrated" identity for 5 of 10 — and at least
two are **acronym collisions**: `MOCHA -> PMID 4448900` and `PRECISE -> a 2026 paper`,
neither about heart failure. MOCHA, PRECISE, SPICE and STRETCH are ordinary English
words, and my `_is_primary_report` accepted "the title names the trial".

**This is the same lesson as the citing-paper defect, one level up.** Fixed by
requiring topic corroboration: where the caller supplies `topic_terms`, a title
acronym match must ALSO be about the topic. Plant 20 asserts the off-topic record is
refused, the on-topic one accepted, and — importantly — that with no topic terms the
old behaviour is unchanged, so this is opt-in rather than a silent default change.

**Three of the ten resolve to nothing at all** (`Captopril-Digoxin 1988`, `Colucci 1996`,
`Cohn 1997`): esearch returns candidates, none passes the primary-report test.
`Captopril-Digoxin[cn]` returns **0** — I checked, so the collective-author route that
found SOLVD does not reach it.

## B4. Corrected denominators

- **43 TRIALS, not 44 rows** — `HF-021b` is CARMEN's second contrast. Every figure
  above says which it counts.
- The earlier "31 of 44 pre-FDAAA so rung 2 caps near 13" needs re-deriving on 43
  trials. On the 28-trial artefact I measured directly (§A2) the registry ceiling is
  **11/28**, all 11 confirmed by the papers' own `<DataBank>` declarations.

## B5. Corroborated re-run — identity 9/10, counts still 0/10

With the particle fix and topic corroboration, the same ten:

```
  id      trial                    identity     verdict
  HF-005  Captopril-Digoxin 1988   -            NOT_FOUND
  HF-006  Beller 1995              8535917      NOT_FOUND
  HF-007  van Veldhuisen 1998      9857856      NOT_FOUND
  HF-008  SPICE                    8334878      NOT_FOUND
  HF-009  STRETCH                  1192554      NOT_FOUND
  HF-019  RESOLVD                  10477530     NOT_FOUND
  HF-052  Colucci 1996             8941105      NOT_FOUND
  HF-053  MOCHA                    8941106      NOT_FOUND
  HF-054  PRECISE                  8941104      NOT_FOUND
  HF-055  Cohn 1997                9389394      NOT_FOUND

  STAGE 0  identity DEMONSTRATED   9/10     (was 5/10, two of them collisions)
  STAGE 1  counts MATCHED exactly  0/10

  rung                  hit  ret-no-val  miss empty  fail  skip   reached    sec     KB
  R1_PRIOR_META         0           8     0     0     2     0        10   231.7   6512
  R2_REGISTRY           0           0     0     0     0    10        10     0.0      0
  R3_LITERATURE         0          10     0     0     0     0        10   323.2  15540
  R4_REGULATORY         0           0     0     0     0    10        10     0.0      0
  R5_PROTOCOL           0           0     0     0     0    10        10     0.0      0
```

**MOCHA and PRECISE now resolve to `8941106` and `8941104` — the real 1996
Circulation US Carvedilol Program papers**, where before they were a 1970s record
and a 2026 paper. `van Veldhuisen 1998 -> 9857856` came from the particle fix.
`Cohn 1997 -> 9389394`. **Identity went 5/10 to 9/10 on two rules**, both of which
say the same thing: a name match is a filter, and a filter is not an identity.

⚠ **Two of the nine remain era-implausible and I am flagging rather than counting
them clean: `SPICE -> 8334878` (1993) and `STRETCH -> 1192554` (1975).** Both pass
the stated standard — acronym in the title, on topic — and both look wrong for a
1990s HFrEF trial. **The check that would settle it is a publication year on the
ledger row, which `hfref-trial-ledger-v3.jsonl` does not carry.** That is a concrete
ask: a `year` field would let identity refuse an era-implausible match instead of
leaving me to eyeball it.

**R1 read 6.5 MB and R3 read 15.5 MB, and neither produced a single per-arm count.**
Ten of ten at R3 are `RETRIEVED_NO_VALUE` — documents fetched, no counts in them. The
1990s abstracts these trials published report mortality as percentages and hazard
statements, not as `events/N` per arm, which is exactly why the ledger records their
counts as donor-carried in the first place.

⚠ **R4 is still `SKIPPED` 10/10 in this run because the drug fix landed after it
started.** `substances_of()` + openFDA resolution is committed (`cf97a0a`) and
plant-covered, but **has not yet been measured on these ten.** Reporting it as
anything other than unmeasured would be the error I just corrected.


## B6. R4 measured on its own denominator — 0 of 10, and now it is a measurement

`donor10_bench.py --only 4`. Identity resolves first, `substances_of()` harvests the
record's own `<NameOfSubstance>` terms, and openFDA decides which is a drug.

```
  rung                  hit  ret-no-val  miss empty  fail  skip   reached    sec    KB
  R4_REGULATORY         0           4     2     0     0     4        10    27.2   482
```

| | n | what it means |
|---|---|---|
| SKIPPED | 4 | **no plan** — the record carries no substance annotation at all |
| MISS | 2 | candidates existed and **openFDA recognises none of them** as a generic_name (they are class terms: "Angiotensin-Converting Enzyme Inhibitors", "Benzimidazoles") |
| RETRIEVED_NO_VALUE | 4 | a drug resolved, applications were returned, **and the label carries no per-arm counts** |
| HIT | 0 | |

**The register decided, exactly as intended.** For Colucci 1996:

```
openFDA: 0 applications for Adrenergic beta-Antagonists
openFDA: 0 applications for Carbazoles
openFDA: 0 applications for Propanolamines
openFDA recognises generic_name=Carvedilol
  -> 5 applications ANDA078332, ANDA076649, ANDA076373, NDA022012, ANDA078165
  -> label clinical_studies 0 chars
```

Three class terms rejected, the drug accepted, **and no hand-written drug list
anywhere.** The applications are real and the per-arm counts are not in the *label* —
they would be in the statistical review PDF, which is the OCR-blocked path already
documented in `regulatory/REGULATORY-SOURCE.md` §5 (text layer 2% for pre-2005 FDA
documents). **So R4's zero here is a fact about openFDA's label endpoint, not about
FDA's holdings.**

### ⚠ And R4 caught an unverified identity propagating — the exact harm the rule predicts

```
HF-009 STRETCH -> PMID 1192554
  title       "Acetylcholine-induced reversal of canine and feline atrial
               myocardial depression"          (1975, cats and dogs)
  substances  ['Strophanthidin', 'Lidocaine', 'Acetylcholine']
  rung 4      openFDA recognises generic_name=Lidocaine -> 5 applications
```

**A 1990s heart-failure trial's regulatory rung went and asked the FDA about
lidocaine.** This is why `identity.py` refuses to write an identifier it cannot
demonstrate: *an unverified identifier does not fail loudly, it silently redirects
every later rung to a different subject*, and every number downstream then describes
that other subject. Here the redirection is visible because rung 4 prints what it
asked. It usually is not.

⇒ **It also vindicates flagging `SPICE` and `STRETCH` rather than counting them
clean.** The year field requested in §B5 would have refused PMID 1192554 outright.
