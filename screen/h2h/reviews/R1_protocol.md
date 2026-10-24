# R1 — Adversarial methods review of the Screen vs ASReview pre-registration

Reviewer: Claude (read-only review, 2026-10-20). What I reviewed: allmeta commit `24f04f3` (`screen/h2h/**`, clean
working tree), `REVIEW_OF_ARUN.md` section 6, and `STATUS.md`. I ran no network calls, R, Node or Playwright. Python was
used only to read the set files.
Classes: **P0** = amend before the held-out run (dated and justified, under the protocol's own amendment rule).
**P1** = disclose in the results, or fix cheaply now. **P2** = nice to have.

## A. Findings

| ID | Class | Finding |
|---|---|---|
| P0-1 | P0 | Worst-case scoring of failures is **anti-conservative when the comparator fails**. When u4 fails, its score becomes -0.05, and that pushes d_r toward Screen. The 95% minimum-success gate still allows up to 5% of u4 runs to fail. At DEV-like u4 WSS (about 0.6), each failed u4 seed adds about +0.065/10 to d_r, so failures confined to the 5% bound can add up to about +0.03, which is more than the 0.02 margin. |
| P0-2 | P0 | A review whose 10 seeds **all fail** stops `analyze.py` instead of being scored worst-case. The protocol (section 8) says it should be scored worst-case. |
| P0-3 | P0 | An order that **`metrics_from_order` rejects** in a Screen run is not caught by the driver. It reaches `analyze.py` as an uncaught ValueError and the analysis crashes. The protocol says such an order is a failure: retry, then worst-case. |
| P0-4 | P0 | The frozen Screen **parameters are not checked**. `analyze.py` checks only the config *name*, the rank-core sha and the self-declared ONNX sha. C, ratio, n-gram range, min/max df, sublinear, emb-w and retrain-every can all be overridden on the command line and are not verified. |
| P0-5 | P0 | FREEZE.md content is under-specified for an **embedding candidate**, and DEV leaders are all embedding hybrids. Only "model-file sha256s" are named. Not named: tokenizer/config files, Transformers.js and onnxruntime versions and backend, dtype/quantisation, pooling and normalisation, truncation length, and the sha of the embedding script. |
| P1-1 | P1 | The margin justification uses in-sample numbers and one claim with no source. Details in section E. |
| P1-2 | P1 | Unit of inference: cluster (protocol) vs review (brief). Defensible, but it must be disclosed. Details in section D. |
| P1-3 | P1 | The non-inferiority result needs an **assay-sensitivity / ceiling check**. Both tools should be reported against a random baseline, and the S6 (R>=20) result given equal prominence. 40 of 84 reviews have R<20, and at R=5 two of the five relevant records are given as priors. This compresses differences toward 0, which favours non-inferiority. |
| P1-4 | P1 | Nothing in the code **enforces "frozen before held-out, run once"**. `--heldout-ok` is just a flag. `run_heldout.py` does not require a committed FREEZE.md or matching hashes, and it resumes over existing outputs. The tag `h2h-prereg-v1` does not exist yet (STATUS.md:35), but PROTOCOL.md:3 says it is made before any run. |
| P1-5 | P1 | **Code provenance is not recorded in outputs.** Result files carry no git HEAD and no clean-tree flag, and `run_js.mjs` itself is not hashed. STATUS.md:5-7 shows the runs have been made from copied trees (`C:\h2h\h2h\`), not from a git checkout. |
| P1-6 | P1 | The protocol says the browser runs "the exact file the browser loads", but **`screen/index.html` does not load `rank-core.js` yet**: it has its own NB/LR `mlTrainOn` path (index.html:1788-1979, and Codex task 4 is pending). The UI also retrains on demand, so S11 will apply. DEV embeddings were made with Python onnxruntime (STATUS.md:94-102), while the protocol requires Transformers.js (PROTOCOL.md:50-51). Before FREEZE, check that the browser and the Node runner produce the same embeddings and the same order on a DEV review. |
| P1-7 | P1 | Seeds are not like-for-like. Screen's SVM RNG is fixed at `seed: 1` for every seed (run_js.mjs:82; rank-core.js:90,151), while u4 reseeds liblinear per seed. Screen's seed-to-seed spread therefore comes from the priors only. |
| P1-8 | P1 | The ONNX hash check trusts a **self-declared** `onnx_sha256` in the `.f32.json` written by the embedding script (run_js.mjs:68). The weights actually loaded are not verified at run time. |
| P2-1 | P2 | Retries are in two layers: inside the process (run_asreview_h2h.py:195; run_js.mjs:79) and again in the driver (run_heldout.py:69). That is up to 4 attempts, but the record says `attempts: 2`. It is symmetric, but it is not what section 8 says. |
| P2-2 | P2 | The Hodges-Lehmann CI uses 0-based `w[c]`, which is one order statistic narrower than the textbook W_(C), on each side (analyze.py:106-108). Negligible at k=73. |
| P2-3 | P2 | Per-tool seed SDs and per-tool cluster-weighted means are not output (Arun 6.6). They can be computed from the archived orders. |
| P2-4 | P2 | For `prop_last`, lower is better, so a negative d favours Screen. The report must state the direction. |
| P2-5 | P2 | Arun 6.13 asked for cadences 1, 10 and 50. Only the UI cadence (S11) is planned. Adding 10 and 50 descriptively costs nothing. |
| P2-6 | P2 | Pretraining corpora of the embedding models (SPECTER2, PubMedBERT) may contain the held-out papers' text. They contain no labels, so this is not tuning, but one sentence of disclosure is due. Two PRIMARY reviews have unclear licences (Mejean_2024 unknown; Verdugo-Castro_2022 "other-open"). They are already disclosed in section 3.5. |
| P2-7 | P2 | The file name `official_test16.txt` holds 15 reviews. Make sure the results say 15. |

## B. Evidence for the P0 findings

- **P0-1.** The worst-case values are set at analyze.py:30 and applied to every tool at analyze.py:62. The success gate
  is at analyze.py:32 and 183 (>= 0.95 per tool). PROTOCOL.md:255-260 says "applies equally to both tools". Applying it
  equally is not neutral for a one-sided non-inferiority test: a failed comparator run helps Screen.
  *Amendment:* use asymmetric imputation. A failed Screen run gets worst-case (as now). A failed u4 or u3 run gets
  that comparator's **best** observed value on the review (best successful seed), or **+0.95** if every seed failed.
  Also report H1 with comparator-failed reviews excluded, as a sensitivity analysis. Alternatively, require 100% u4
  completion for H1 to be assessable.
- **P0-2.** For an all-failed review, run_heldout.py:87-91 writes a head with no `environment` (ASReview) and no
  `rank_core_sha256` (Screen). `asr_check` then fails at analyze.py:146-147 (`None != "3.0.8"`), and `screen_check`
  fails at analyze.py:154. Both raise SystemExit. Halting fails closed, which is safe, but it would force a decision
  after the held-out results exist. That is exactly what pre-registration forbids. test_h2h.py:136 sets every seed to
  failed but keeps a valid head, so this path is untested.
  *Fix:* the driver writes the tool's environment/sha head even when every seed fails (it can probe the version without
  running). Add a test that drives the real `run_heldout.py` all-failed branch into `analyze.py`.
- **P0-3.** run_heldout.py:78 checks only `rc == 0`, that the file exists and that `failed` is not set. run_js.mjs:82-84
  checks only the prefix. analyze.py:66 calls `core.metrics_from_order` unguarded, and core.py:323-326 raises.
  run_asreview_h2h.py:203 does validate inside its try block, so the two tools are not handled the same way.
  *Fix:* validate with `metrics_from_order` in run_js.mjs or in the driver (`ok = False` on ValueError).
- **P0-4.** run_js.mjs:54-58 and 71-72 take `--C`, `--ratio`, `--ngram-max`, `--min-df`, `--max-df`, `--sublinear`,
  `--emb-w` and `--retrain-every` from the command line and write them to `cfg` (line 91). analyze.py:167 checks only
  `config`, and analyze.py:153-159 checks only the rank and ONNX hashes. A held-out run with the wrong `--js-args`
  would pass every check. *Fix:* FREEZE.md records the full `cfg` dict and the embedding-file directory digest, and
  `analyze.py --screen-cfg-json` requires `d["cfg"] ==` that dict and `d["emb"]` fields equal the frozen ones.
- **P0-5.** PROTOCOL.md:5 lists what FREEZE.md must contain. PROTOCOL.md:41-46 and 50-52 describe the embedding
  requirements. *Fix (dated amendment, before FREEZE):* FREEZE.md lists sha256s for **every** model file (onnx,
  tokenizer.json, tokenizer_config, config, special tokens), the Transformers.js and onnxruntime(-web/-node) versions,
  the dtype, pooling, normalisation and max length, the embedding-script sha, and the Node version. The embedding
  `.f32.json` records these, and analyze checks them.

## C. Brief and Arun-17 compliance

| Requirement | Verdict | Evidence / gap |
|---|---|---|
| Held-out reviews neither tool tuned on | Met | PROTOCOL 3.2-3.3; sets checked: PRIMARY 84, no DEV overlap. Caveat: van_de_Schoot_2018 overlap unchecked (3.4, disclosed). |
| De-duplication across datasets | Partly | Records are not removed. Overlap is handled by clusters plus excluding reviews with >= 10% DEV overlap (3.4). Justified, and disclosed. |
| Licences per file | Met | sets/licences.csv (119 rows). 2 PRIMARY reviews are unknown/other (P2-6). |
| WSS@95, recall@effort, records to last relevant | Met | core.py:305-335. `prop_last` is a proportion; n100 is also computed. |
| Identical starts per seed, 2+2, 10 seeds | Met | core.py:259-302. Checked in both runners and in analyze.py:64. The UI gate is confirmed at index.html:1792. |
| Exact ASReview version and settings | Met | comparator_configs.json; guard at run_asreview_h2h.py:149-159; re-checked at analyze.py:143-151. |
| Primary NI vs SVM default, justified margin fixed in advance | Partly | Fixed: yes. Justified: weakly (P1-1). The scoring asymmetry (P0-1) threatens the NI test itself. |
| Secondary superiority | Met | H2 fixed-sequence (analyze.py:188-189). Note that the protocol puts it in the primary sequence, not in the secondary family. |
| Review as unit | Partly | Refined to cluster (P1-2). S3 gives the review-level analysis. |
| Multiplicity fixed | Met | Holm over 4 tests (analyze.py:92-98, 198-201). The implementation is correct. |
| Report either way | Met | PROTOCOL.md:266-267. |
| A6.1 Hold-out | Met | As above. |
| A6.2 Freeze by commit hash | Partly | FREEZE.md not yet written. Enforcement and pins are incomplete (P0-4, P0-5, P1-4, P1-5). |
| A6.3 Same priors | Met | |
| A6.4 No deterministic forced record | Met | |
| A6.5 UI training gate | Met | |
| A6.6 10 seeds, SDs for both | Partly | 10 seeds yes. SD per tool not output (P2-3). Seeds not like-for-like (P1-7). |
| A6.7 Review the independent unit, no seed-pooled CI | Met | Seeds are averaged within each review (analyze.py:67). |
| A6.8 Pre-specified primary contrast vs u4 | Met | |
| A6.9 Superiority vs equivalence | Met | NI (one-sided, two-sided 95% CI lower bound) plus fixed-sequence superiority. This is consistent with Arun's point; TOST is not needed for NI. |
| A6.10 Multiplicity | Met | |
| A6.11 Mean diff, 95% CI, exact test, Wilcoxon estimand | Met | analyze.py:73-89, 205-212 (HL pseudo-median stated). |
| A6.12 Metric caveats, recall at depths, chronological stop | Met | PROTOCOL.md:163-166. No stopping claim is made. |
| A6.13 Retraining cadence 1/10/50 | Partly | UI cadence only (S11). P2-5. |
| A6.14 Pinned files, licences, overlaps, reference standard | Met | 3.1, 3.4, 3.5. Label = full-text inclusion. |
| A6.15 Comparator unmodified / reseed disclosed | Partly | ASReview is unmodified and the reseed is disclosed (PROTOCOL.md:37). Its *effect* cannot be quantified (u4 is non-deterministic without it); say so explicitly. |
| A6.16 Archive raw outputs, LORO, single seed | Partly | Archive, LOCO/LORO and S5 are in place (analyze.py:217-224). There are no figure scripts yet. |
| A6.17 External LLM | Met | Excluded from the candidate (PROTOCOL.md:52-54). |

## D. Does analyze.py implement the protocol? (point 2) — mostly yes

- **Estimand.** Seed mean, then review d_r, then cluster mean, then an equal-weight mean over clusters
  (analyze.py:67, 172-174, 120-121). Matches section 1.
- **CI, alpha and H1/H2.** Two-sided 95% t-interval with df = k-1 (77). H1 is accepted when the lower limit exceeds
  -0.02, which is one-sided alpha 0.025 (187). H2 requires H1 and a lower limit above 0 (189). The one-sided p-values
  are correct (85-89).
- **Holm.** Correct, with step-down monotonicity (95-98). Clusters are an exact partition (111-117, 140).
- **Zero variance.** Handled in `summarize` (81), in `p_one_sided_gt` (89) and in the Wilcoxon all-zero branch
  (206-209).
- **Failures.** This is the weak point: P0-1, P0-2 and P0-3.
- **Minimum success.** Implemented (180-192), but it is anti-conservative for the comparator (P0-1).
- **Cluster vs review (point 4).** Treating the cluster as the unit of inference is a **defensible refinement**. It is
  more conservative (k=73 instead of 84), and it is the honest response to shared-search review families. But it
  changes the *estimand weights*: each of the 7 multi-review clusters counts once. The brief said "review", so the
  results must state it as a deliberate departure from the brief's wording (not from the protocol), with S3 shown
  alongside.

## E. Can a held-out result influence choices? (point 3) — not through the data so far

- Sets, clusters, priors and dataset digests are committed, and clusters are built from record identity only.
- The DEV scripts refuse held-out keys (dev_sweep.py:27-31; dev_bench.py:32, 146-149; parity_dev.py:25-32;
  run_js.mjs:27-28). The laptop holds DEV CSVs only.
- `--dev-smoke` narrows the run to DEV only (run_heldout.py:42-46). It cannot reach held-out reviews.
- The remaining risk is procedural. Baseimage and desktop hold all 119 CSVs, and nothing in the code stops an early
  "peek" run or a selective rerun (P1-4).
- Recommendation: `run_heldout.py` refuses to start unless FREEZE.md is committed, HEAD equals the FREEZE commit, the
  tree is clean, the rank sha and cfg match FREEZE, and the output directory is empty. The first entry in
  `_attempts.jsonl` must be timestamped after the FREEZE commit.
- Many DEV variants are being searched (grids A and B, the pmb2 bracket, Codex tasks 1-3). That is allowed. The DEV
  gain (+0.043 to +0.049) is inflated by winner's-curse selection and must not be quoted as a predicted effect.

## F. Could a non-inferiority claim mislead? (point 5)

- **Margin (P1-1).** The "about 4% of u4" figure uses in-sample screen-reproducible v1.0.1 (WSS 0.468, full files).
  DEV built-subset u4 is 0.617, and held-out WSS may be different again.
- **Unsourced claim.** "The difference ASReview treated as large enough to change its default" (PROTOCOL.md:193-194)
  needs a citation or must be dropped.
- **User terms.** Add the margin in records. 0.02 of a 7,573-record review is about 150 extra records.
- **Power.** The SD (0.061) is a review-level, in-sample SD applied at cluster level. The DEV paired SDs (0.055-0.068)
  agree with it, and I re-derived the power figures (0.79 / 0.28 / 0.79) as correct.
- **Exclusions.** The DEV-overlap exclusion (3 reviews) and the R<5 exclusion (10 reviews) are fixed on data
  properties, not on outcomes, and both are disclosed. They are acceptable. Report S9 next to the primary result.
- **Oracle stopping.** WSS@95 is an oracle quantity. The claim must say "retrospective work saved at 95% recall", never
  "users stop earlier". Section 5 already says this; carry it into the abstract.
- **Ceiling compression (P1-3).** Small-R reviews and failure imputation (P0-1) both pull d toward 0 or toward
  Screen. Either can manufacture non-inferiority.
