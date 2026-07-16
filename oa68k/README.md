# oa68k — the standing pipeline over the ~68,000 open-access medical meta-analyses

**One dedicated, resumable, checkpointed job on pc1 that ingests every open-access
meta-analysis and does two things with it** (the delivery architecture's two jobs):

1. **Error-pattern mining** — sweep each meta for recurring defect classes (E1
   `events==denominator`, E5 `events>N`, …) → feeds the detector library and the
   registry-posted-vs-published answer-key proxy.
2. **RCT pre-extraction** — for the trials cited inside those metas, copy the openly
   available registry data (AACT, offline) into a structured store → raw material for
   Tier-2 (off-corpus) synthesis and the Tier-1 mirror index (which metas are usable
   → instantly Kampala-ready).

This is memory-aware and **grinds through the corpus in batches** — it never holds
the corpus in RAM, and a kill at any point resumes from durable, fsync'd ledgers.

## The corpus (live-reproducible provenance)

```
(SRC:MED) AND (PUB_TYPE:"Meta-Analysis") AND (OPEN_ACCESS:y) AND (HAS_FT:y)
```
Europe PMC `hitCount` = **67,759** (probed 2026-07-14); a full crawl on the same day
returned **67,771** rows (the live index drifts by a few between calls — the seed
ledger records the exact count crawled, not a frozen constant).

## Stages (each a module, each resumable)

| Stage | File | Does | Ledger |
|---|---|---|---|
| 1 Ingest | `ingest.py` | page EPMC → one row per meta (pmid/pmcid/doi/year/**licence**) | `data/seed.jsonl` + `ingest_state.json` |
| 2 Harvest | `harvest.py` | XML-first full text (EPMC JATS → NCBI BioC), cache + resume | `data/harvest.jsonl`, `data/cache/*.xml` |
| 3 Parse+Detect | `parse_detect.py` | tables, cited NCTs, E1/E5 candidates, mirror-usability | `data/detect.jsonl` |
| 4 Pre-extract | `preextract.py` | registry-direct 2×2/AE for each linked NCT (AACT, **offline**) | `data/preextract.jsonl` |
| — Ledger | `ledger.py` | coverage scoreboard (real counts, no extrapolation) | stdout |
| — Driver | `run_batch.py` | one standing batch: harvest→detect→preextract→ledger | — |

## Run

```bash
python ingest.py                 # once — build the full 67k seed ledger (resumable)
python run_batch.py --batch 2000 # one standing batch; re-invoke to advance the corpus
python ledger.py                 # coverage at any time
python -m pytest tests/ -q       # 8 offline unit tests (detector + resume)
```

## Standing-job cadence (pc1)

Measured throughput: **~55–62 metas/min** (XML is ~122 KB each). The full 68k is
therefore ~19 h of continuous harvest, or a few unattended `--batch 2000` runs/day.
Raw XML cache projects to **~8.5 GB** — it stays on pc1 (the high-memory node); only
the **distilled** ledgers (2×2 + error flags + provenance, a few MB) are the shippable
Tier-1/Tier-2 artefact. Schedule `run_batch.py` (e.g. hourly) and it converges; every
run is idempotent and resumes from the ledgers.

## Honesty boundary (do not overclaim)

- **Detect is conservative by design.** It records structure (tables), trial links
  (NCT accessions), and **high-recall error CANDIDATES** — it does **not** claim gold
  primary-outcome 2×2 extraction. Table selection is the named wall across the prior
  art; E5/E1 text-regex candidates include false positives (e.g. `400/100 mg` dosing)
  and are for **adjudication against source**, not verdicts. *A difference is not an
  error* (OA-META-AUDIT calibration).
- **`usable_for_mirror`** = meta has ≥1 table AND cites ≥1 NCT by accession. Many OA
  metas cite trials by author-year, not NCT, so the direct rate is a floor; wiring the
  `label→PMID→NCT` link layer (`C:\Projects\pico-map`) raises it.
- **Pre-extract confidence = copy-fidelity**, not a claim the registry value is true
  (registry data carries human error; we carry it faithfully and flag only the
  arithmetically impossible).

## Reuse (not rebuilt)

Acquisition cascade design ← `C:\Projects\oa-acquisition`; JATS table parsing ←
`C:\Projects\jats-parser`; registry pre-extraction pattern ← `preextracted-data-layer`;
error taxonomy (E1–E5/F1–F3) ← `C:\Projects\OA-META-AUDIT-2026-07-14.md`; NCT↔PMID
index ← `C:\Projects\pico-map`. This pipeline is the **standing consolidation** those
one-off prototypes were missing.
