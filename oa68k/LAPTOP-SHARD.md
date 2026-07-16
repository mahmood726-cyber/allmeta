# LAPTOP shard — ready-to-run package

The laptop is node **shard 1 of 2**. It grinds the *other half* of the 68k in parallel
with pc1, and additionally runs **Tier-2 prose extraction** (the model-heavy bottleneck)
on its agy→Gemini seat. This pc1 session cannot exec on the laptop (separate machine, no
mapped drive), so start it there with the two commands below.

## Prereqs on the laptop
1. This `oa68k/` directory reachable (copy it, or the laptop reads the F: share).
2. `seed.jsonl` present in `data/` (copy `data/seed.jsonl` from pc1 — 67,771 rows, ~20 MB;
   the laptop does **not** re-ingest).
3. Python 3.11+, `requests`. AACT is **not** needed on the laptop (registry pre-extract is
   centralised on pc1).
4. agy (Antigravity) CLI logged in; model pinned to a Gemini pool in
   `~/.gemini/antigravity-cli/settings.json` (`"model": "Gemini 3.1 Pro (High)"`).

## Command 1 — harvest+detect the laptop's shard (parallel with pc1)
```bash
# Windows PowerShell:  $env:OA68K_NODE="laptop"
OA68K_NODE=laptop python run_batch.py --batch 2000 --shard-id 1 --shard-count 2 --skip-preextract
```
- Writes `data/harvest.laptop.jsonl`, `data/detect.laptop.jsonl` — disjoint from pc1 by
  `sha256(pmcid) % 2`. Re-invoke to advance; resumes on kill.
- `--skip-preextract` because pc1 (which holds the AACT mirror) does registry pre-extract
  over the union of NCTs at merge.

## Command 2 — Tier-2 prose extraction (the bottleneck job)
```bash
OA68K_NODE=laptop python tier2_extract.py --liveness-only   # confirm agy echoes "Gemini"
OA68K_NODE=laptop python tier2_extract.py --limit 200        # after wiring fetch_abstract (below)
```
`tier2_extract.py` needs one laptop-side wiring: a `fetch_abstract(nct_id) -> str` that
pulls the trial's abstract (EPMC/PubMed by NCT→PMID). It is left injectable so the module
unit-tests offline. Output `data/tier2.laptop.jsonl` carries **single-family candidates**
(`needs_second_family=true`) — never shipped until pc1/Claude supplies the 2nd vote.

## Merge back (on pc1)
Copy the laptop's `data/*.laptop.jsonl` into pc1's `data/`, then:
```bash
python merge.py        # asserts 0 pmcid seen by both shards, prints merged coverage
python preextract.py   # pc1 registry pre-extract over the UNION of NCTs (both shards)
```
`merge.py` fails loud if the shards overlap (they cannot, by construction — the guard is
belt-and-braces).

## Division of labour (why)
- **Harvest** is network-bound → both nodes halve it (~10 h full-corpus two-node vs ~19 h).
- **Registry pre-extract** is offline/deterministic and the AACT mirror lives on pc1 → pc1 only.
- **Tier-2 prose extraction** is model-rate-limited (weeks) → laptop's agy seat grinds it as a
  standing backlog without competing for pc1's memory or Claude budget.
- **Codex is OUT OF CREDITS** (both seats) → do not route Tier-2 to Codex; agy-Gemini is the
  alive non-Claude family. Second-family vote comes from Claude on pc1 (or Codex once re-credited).
