# The 68k Programme — Solid Plan
**Ingest & mine every open-access medical meta-analysis, then pre-extract its trials.**
pc1 · `F:\allmeta\oa68k` · plan written 2026-07-14 · **plan-first, then grind**

---

## 0. One-paragraph statement

There are **67,771** open-access medical meta-analyses reachable and redistributable
(Europe PMC, live query below). Each one is (a) a **check** that surfaces recurring
data-error classes we don't yet know we have, and (b) a **bundle of trials** whose
openly-available data we can pre-extract once, verify, and ship as a lookup. This
programme runs **one standing, sharded, checkpointed pipeline** across the three-node
fleet to do both, converging over days (Tier-1) to weeks (Tier-2), and never holding
the corpus in RAM. **A difference from a published review is not an error** — it is a
candidate for source adjudication. Fail-closed is absolute: the number that ships
carries its provenance and verification, or it does not ship.

**Live-reproducible corpus definition (the only source of the "68k"):**
```
(SRC:MED) AND (PUB_TYPE:"Meta-Analysis") AND (OPEN_ACCESS:y) AND (HAS_FT:y)
```
EPMC `hitCount` = 67,759 (probe 2026-07-14); full crawl = **67,771** (index drift is
recorded, not hidden). 99.7% carry a PMCID; per-paper licence captured at ingest.

---

## 1. Architecture (data flow, one merged ledger)

```
                       ┌─────────────────────── seed.jsonl (67,771 metas, shared, read-only) ───────────────────────┐
                       │                                                                                             │
  ┌────────────────────┴─────────────────────┐                            ┌─────────────────────────────────────────┴──┐
  │  pc1  (high memory)  shard 0 = hash%2==0  │                            │  LAPTOP  shard 1 = hash%2==1                │
  │  ── harvest (EPMC JATS → NCBI BioC, cache)│                            │  ── harvest (same cascade, its shard)       │
  │  ── detect (tables, NCTs, E1–E5 cands)    │                            │  ── detect (same)                           │
  │  ── ERROR-PATTERN MINING (Phase 2)        │                            │  ── TIER-2 model extraction (Phase 3)       │
  │      memory-heavy: cross-meta redundancy  │                            │      agy→Gemini panel over OA full text /   │
  │      graph + adjudication (Claude+agy)    │                            │      abstract for trials w/o registry 2×2   │
  │  ── TIER-1 registry pre-extract (AACT)    │◄── NCTs from laptop detect │  (AACT lives on pc1, so registry step is    │
  │      offline, deterministic, holds mirror │    ledger, shipped to pc1  │   centralised on pc1; laptop ships NCTs+prose│
  └────────────────────┬──────────────────────┘                           └─────────────────────────────────────────┬──┘
                       │  node-tagged ledgers: harvest.<node>.jsonl, detect.<node>.jsonl, tier2.<node>.jsonl        │
                       └──────────────────────────────► merge.py ◄──────────────────────────────────────────────────┘
                                                           │  union by PMCID (metas) / NCT (trials); disjoint shards ⇒ 0 double-count
                                                           ▼
                                         MERGED coverage ledger + mirror-usability index
                                                           │
                                    pc2 tournament answer key ◄── error-class ledger (registry-posted-vs-published proxy)
```

- **pc2 is untouched** by this pipeline: it keeps running the evolutionary methods
  tournament. The *only* coupling is one-directional: pc1's Phase-2 error-class ledger
  **feeds** pc2's answer key. No pc2 compute is borrowed.
- **Disjoint sharding by `sha256(pmcid) % N`** guarantees pc1 and the laptop never
  process the same meta ⇒ union merge cannot double-count. Trial-level dedup is by NCT
  at merge (a landmark trial cited in metas on both shards collapses to one node whose
  **redundancy count = union of citing metas** — that count is the training signal).

---

## 2. Phases, milestones, acceptance checks

| Phase | Node(s) | Work | Gate to advance (acceptance) |
|---|---|---|---|
| **0 Ingest** ✅ DONE | pc1 | seed list of all OA metas + per-paper licence | count ≈ EPMC hitCount (67,771 vs 67,759, drift logged); ≥99% PMCID; licences captured — **all met** |
| **1 Harvest + Structure + Tier-1 registry** | pc1 ∥ laptop | cache XML; detect tables/NCTs/error-candidates; registry-direct 2×2/AE for every linked NCT (AACT, offline) | ≥95% XML acquisition on PMCID-bearing metas (batch-actual 99.4%); every linked NCT resolved or marked absent-from-snapshot; **merge shows 0 pmcid seen by both shards** |
| **2 Error-pattern mining** | pc1 (mem-heavy) | run E1–E5/F1–F3 **table-scoped** (kills text-regex FPs); build corpus error-class ledger; adjudicate a sample with 2 families (Claude + agy-Gemini) | every flagged class has a **fail-closed gate + RED→GREEN trip test**; FP rate on a hand-checked ≥30-case sample reported per class; E5 text-regex FPs eliminated (table-scoping); output feeds pc2 answer key |
| **3 RCT pre-extraction — Tier-2 off-corpus** | laptop (agy-Gemini) | for trials with **no registry results**, extract 2×2 from OA full text / abstract via panel; ship a number **only if ≥2 families agree**, else flag | triangulation-flag reliability reported (false-refusal, recall on injected errors); per-stratum accuracy (registry/JATS/abstract); **0 single-vendor numbers shipped** |
| **4 Mirror-usability index** | pc1 | per-meta `usable_for_mirror` = table ∧ ≥1 linked trial ∧ all pooled cells present (registry ∪ Tier-2); redundancy graph (trial in N metas) | index **rebuilds byte-identical**; usable count reported by disease; redundancy distribution (≥2/≥5/≥10 metas) with cross-extraction agreement rate |
| **5 Standing / living update** | pc1 (+ laptop) | scheduled batches; **monthly EPMC delta** re-ingest; merge; re-gate | resume-after-kill verified (already proven); delta picks up new metas without re-harvesting old; ledger monotone |

**Rule at every phase:** never close on a green count. Report batch-actual and
extrapolation separately; unswept remainder is stated, not implied covered.

---

## 3. Throughput & time (measured rate, honest extrapolation)

| Quantity | Value | Basis |
|---|---|---|
| Harvest rate, single node | **~55–62 metas/min** (~3,500/hr) | batch-actual, n=169 |
| Harvest rate, pc1 ∥ laptop | **~7,000/hr** | 2× (network-bound, independent egress) |
| **Full 68k harvest (Phase 1)** | **~10 h wall-clock** two-node (~19 h single) | 67,771 / 7,000 |
| Detect (regex, CPU) | thousands/min | negligible vs harvest |
| Tier-1 registry pre-extract (AACT, offline) | ~instant/NCT chunk | duckdb over parquet |
| **Tier-2 model extraction (Phase 3)** | **the long pole — model-rate-limited** | agy-Gemini; ~tens of trials/hr per stream ⇒ **weeks** for the tail |

**Reading:** Tier-1 (structure + registry data) lands in **~1 day** two-node. Tier-2
(prose numbers for trials the registry doesn't cover) is a **continuous backlog**
measured in weeks — so it runs as a standing job on the laptop, not a sprint. The
mirror-usability index (Phase 4) is usable from Tier-1 alone and **improves** as Tier-2
fills in.

---

## 4. Checkpoint / resume design

- **Durable, atomic, fsync'd:** every stage appends to a JSONL ledger; ingest cursor +
  count written via temp-file + `os.replace` after each page. A kill mid-write cannot
  corrupt state.
- **Resume = set-difference:** each stage loads the set of already-done keys (pmcid /
  nct) from its ledger and skips them. Proven live (batch advanced 149→169, skipped the
  done 149). **No re-download, no double-processing.**
- **Node-tagged ledgers** (`harvest.pc1.jsonl`, `harvest.laptop.jsonl`, …) so two
  machines never contend on one file; `merge.py` unions them for the coverage ledger.
- **Idempotent driver:** `run_batch.py --shard-id S --shard-count N --batch B` is safe
  to re-invoke forever; scheduling it *is* the standing job.

---

## 5. Storage footprint

| Artefact | Size | Where |
|---|---|---|
| seed.jsonl (67,771 metas) | ~20 MB | shared/pc1 |
| Raw XML cache (122 KB/meta measured) | **~8.3 GB** total (~4.2 GB/node sharded) | **pc1 & laptop local disk — never shipped** |
| detect + tier2 + preextract ledgers | <500 MB | merged on pc1 |
| **Shippable distilled artefact** (2×2 + error flags + provenance) | **a few hundred MB** | the Tier-1/Tier-2 lookup for Kampala |

`.gitignore` excludes `data/` — the 8 GB cache never enters git. **Ship distilled, not
source** (the raw-corpus-multi-GB warning, respected).

---

## 6. Node allocation (the fleet) + fleet-auth reality

| Node | Role | Model seat used | Auth reality (from memory, 2026-07) |
|---|---|---|---|
| **pc1** (high memory, THIS host) | 68k **ingest + harvest shard 0 + error-pattern mining + Tier-1 registry pre-extract**; holds AACT mirror; runs the merge + redundancy graph | **Claude** (this session) + **agy→Gemini** as 2nd family for adjudication | Claude live; agy-Gemini live (settings.json = *Gemini 3.1 Pro (High)*, google, decorrelated) |
| **pc2** | evolutionary methods **tournament** (unchanged) — consumes pc1's error-class ledger as answer key | its own | untouched by this plan |
| **LAPTOP** (back online, under-used) | harvest **shard 1** + **Tier-2 off-corpus model extraction** (the true bottleneck): agy-Gemini panel over OA prose for trials lacking registry 2×2 | **agy→Gemini** (primary); **Codex** when re-credited | **Codex OUT OF CREDITS** (balance meter, no auto-refill) ⇒ do **not** depend on it; agy-Gemini is the alive non-Claude family — laptop's Tier-2 runs on it |

**Why this split (bottleneck-driven):** harvest is network-bound and trivially
shardable → both nodes halve it. Registry pre-extraction is offline/deterministic and
the AACT mirror physically lives on pc1 → centralise it there (fast). The **only
model-heavy, rate-limited work is Tier-2 prose extraction** → give it to the laptop's
agy-Gemini seat so it grinds in parallel without competing for pc1's memory or the
Claude seat. pc1 stays model-light on its spine (deterministic), spending its Claude/agy
budget on *adjudication* (Phase 2), not bulk extraction.

**Reconciliation (single ledger, no double-count):**
1. Partition: meta belongs to node `sha256(pmcid) % 2`. Disjoint by construction.
2. Each node writes `*.<node>.jsonl` locally.
3. Laptop ships its `detect.laptop.jsonl` (carries NCTs) + `tier2.laptop.jsonl` to pc1
   (F: drive or copy).
4. pc1 `merge.py`: union metas by PMCID (assert empty intersection across shards →
   guard), union trials by NCT (redundancy = count of distinct citing metas), run
   Tier-1 registry pre-extract over the **union** of NCTs.
5. Coverage ledger + mirror index computed on the merged view only.

**Laptop dispatch:** this pc1 session cannot exec on the physically-separate laptop (no
mapped drive). A ready-to-run package is produced at `oa68k/LAPTOP-SHARD.md` +
`run_batch.py --shard-id 1 --shard-count 2` with `OA68K_NODE=laptop`. Mahmood (or a
laptop-side session) starts it; it is self-contained (needs only the seed shard,
network, and the agy seat).

---

## 7. What is explicitly NOT claimed (honesty boundary)

- Detect is **high-recall candidates**, not gold primary-outcome 2×2 — table selection
  is the unsolved wall; text-regex E5 is FP-dominated (dosing ratios) and adjudicated,
  not counted as errors.
- NCT-link rate is a **floor** until the `label→PMID→NCT` layer (`C:\Projects\pico-map`)
  is attached (Phase 2 wiring).
- Pre-extract confidence = **copy-fidelity**, not truth of the registry value.
- Tier-2 ships a number only on **≥2-family agreement**; single-vendor numbers are
  flagged, never shipped.
- All totals in reports are **batch-actual**; any whole-corpus figure is labelled
  extrapolation from the stated n.

---

## 8. Order of execution (from here)

1. **Now:** make the pipeline shard-aware; produce the laptop package. *(this session)*
2. **Now:** start **pc1 shard 0** Phase-1 for real; report batch-actual counts.
3. **Mahmood:** launch the laptop package (shard 1) so both nodes grind in parallel.
4. **Next session:** Phase 2 table-scoped detectors + adjudication; wire pico-map link
   layer; build merge + redundancy graph once both shards have thousands of metas.
