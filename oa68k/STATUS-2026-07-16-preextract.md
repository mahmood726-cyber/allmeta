# Pre-extraction layer — status 2026-07-16 (pc1)

The Tier-2 data foundation: **all** openly-available trial data, pre-extracted
once, so a synthesist can answer a topic the 68k meta corpus never covered.
Extends the 68k programme's spine (same config roots, ledgers, snapshot, cache)
— it does not fork it.

**Every number below is batch-actual, counted from the store on disk.** Anything
projected is labelled PLANNING-ONLY and is never a result.

---

## 1. Tier-1 registry — COMPLETE

AACT snapshot **2026-04-12**, offline, deterministic. 59/59 batches, **0 errors**,
471 MB. Universe = `study_type='INTERVENTIONAL' AND allocation='RANDOMIZED'`.

| Quantity | Batch-actual |
|---|---|
| RCT records (all distinct — the unit is the trial) | **290,724** |
| …with posted results | **46,347** (15.9%) |
| …with a structured adverse-event table | **18,055** |
| …with an African site | **16,664** |
| malaria/TB/HIV priority cohort | **5,555** |
| outcome-measurement rows | **3,308,734** |
| adverse-event rows (the harms layer) | **3,587,405** |
| registered outcomes (incl. trials with no results) | **2,071,193** |
| sites / arms / interventions | 2,235,517 / 691,600 / 618,976 |
| NCT→PMID reference rows | 586,607 |

Per-field fill: title/phase/status/allocation/sponsor/conditions 100%,
enrolment 99.5%, primary completion 97.0%, countries 90.3%,
results_first_posted 15.9%, why_stopped 7.6%.

**Arm identity — the load-bearing decision.** `ctgov_group_code` is scoped
**per-outcome**, not per-trial: 157,837 of 185,624 `(nct_id, group_code)` pairs
map to >1 `result_group_id`. Every result/AE row is therefore keyed on
`result_group_id`, with the arm title **copied** from `result_groups`; the code
is kept as a display label only. Arm resolution **99.967%** — the 1,094
unresolved rows are marked `group_resolved=false`, never dropped or guessed.

**Verified against the extracted store, not asserted:**

| Check | Result |
|---|---|
| NCT01626079 `OG000` in our store | correctly held as **3 distinct arms** — "MitraClip System" (242 result groups), "Device Group" (74), "Randomized Group" (3) |
| Same, had we keyed on `(nct_id, group_code)` | 3 real arms fused into **1 pseudo-arm** |
| Store-wide `(nct, code)` pairs hiding >1 real arm title | **23,419** |
| **Distinct trials that would have been corrupted** | **9,915** = **21.4% of the 46,347 trials with posted results** |

That is the concrete cost of the obvious shortcut: a fifth of every trial with
results would have carried fabricated arms into any synthesis built on it.

## 2. Layers 2–3 — IN PROGRESS (floors, they only rise)

- **Crosswalk** (NCT↔PMID↔DOI↔PMCID + OA/abstract flags, Europe PMC): target
  **178,236** DERIVED/RESULT PMIDs, ~3,900/min.
  Of 448,231 distinct linked PMIDs, only 178,236 are DERIVED/RESULT — **269,995
  (60.2%) are BACKGROUND-only** and can never serve the three-layer rule. This
  independently reproduces the 68k lane's `linkmap.py` finding (68% of AACT's
  crosswalk is BACKGROUND; worst fan-out 301 NCTs for one famous citation).
- Measured on ~70,600 resolved paper nodes: **96.1% carry an abstract**,
  **15.8% are open-access AND in PMC**. (An early probe read 40% OA because it
  walked the recent priority cohort first; the corpus-wide rate is lower because
  older papers predate OA. Neither is the final number.)
- **OA full text** (`fulltext.py`, NCBI efetch JATS): candidate pool **18,035**
  and growing as the crosswalk resolves more. ~40/min throttled.

## 3. Beyond the registry — corpora CT.gov cannot see

- **DTA**: `MESH:"Sensitivity and Specificity"` + OA + full text → **11,757**
  crawled (hitCount 11,755; drift recorded), 11,756 with a PMCID, **749**
  malaria/TB/HIV. DTA studies are typically not registered RCTs at all.
- **OA RCT**: 105,402 probed — the remainder that carries no NCT (unregistered
  trials), invisible to the registry layer. Seeded next.

## 4. Honesty boundary

1. **The DTA corpus is a CANDIDATE set, not a DTA set.** That MeSH term indexes
   anything touching accuracy concepts; harvested tables include VirGen genome
   statistics, JEV/DEN-2 binding pockets and MEDLINE search strategies.
   `dta_detect.py` flags only on positive column evidence and is built to MISS
   rather than cry wolf. **Harvest count ≠ 2×2 count.** Flags are labelled
   `candidate — NOT an extracted 2x2` and need adjudication.
2. **Registry confidence = copy-fidelity**, not truth of the registry value.
   A registry number can itself be wrong; we copy it faithfully and say so.
3. **Layers 2/3 are floors**, rising as the crosswalk/harvest grind. No corpus
   total is projected from them.
4. `has_african_site` is a **site** flag from `facilities`, not a claim about
   where the participants came from; 90.3% of trials have any country data.
5. Nothing is pushed. Commits only.

## 5. Bugs found and fixed while building (each cost real data)

| Bug | Effect | Fix |
|---|---|---|
| duckdb `/` is true division | `CAST(x/n AS INT)` **rounds** → batch 0 held 2,501 of 5,000 trials | explicit `FLOOR` |
| `/guinea/` regex for African sites | matched **Papua New Guinea** | curated allowlist, accent/apostrophe-normalised, SQL↔Python agreement tested over all 225 country strings |
| PLOS `<thead>` uses `<td>` not `<th>` | **39 of 40 tables** parsed header-less → column semantics impossible → detector silently blind | any `<thead>` row is a header row; 37/40 after |
| ledger appended before tables flushed | 521 papers marked done, **~1,500 tables lost**; resume skips them forever | commit tables **then** ledger every 100 papers |
| two harvesters on one corpus | 427 papers re-fetched, double NCBI rate; hidden because Git Bash `ps` shows no args | O_EXCL lock per (corpus,node) |
| `epmc_seed`/`ingest` empty-page break | `complete` never set → 67,771 rows crawled but state read `complete=False` forever | checkpoint the empty page as complete |
| `MESH_TERMS:` not an EPMC field | returns **hitCount=0 silently** → an empty corpus reads as "no such papers" | fail loud on hitCount=0 |

## 6. Fleet etiquette

NCBI eutils allows ~3 req/s per IP **without a key, shared across lanes**. The
68k lane's `harvest.py` runs its own stream from this host. This lane throttles to
~1.4 req/s (`OA68K_NCBI_INTERVAL=0.7`) and reuses the shared PMCID-keyed XML
cache before any request — a 25-paper verification run served 25/25 from cache
with zero network calls. `standing.py` serialises the corpora for the same
reason. Do **not** parallelise the full-text corpora.

## 7. Resume

`python standing.py --loop` is the one driver (crosswalk → linked_rct → dta →
oa_rct → dta_detect), every stage idempotent and resumable.
`python coverage.py --fields` prints the ledger. 76 tests passing.
