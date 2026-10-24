# R2 — adversarial review of DEV results before FREEZE (2026-10-20)

Scope: read-only. Every number below was recomputed from the raw logs `~/offload/logs/remote-h2h-dev*.log`
(parsed: 61 config keys, 0 conflicting duplicate rows). Unit = review (18 DEV with priors); per-review value =
seed mean; d_r = config - u4 (3-seed configs vs `u4`, 10-seed vs `u4_10s`). Scripts in my session scratchpad only.

## 1. Recomputed DEV claims

| config | mean d | SD | t | wins | worst | q25 | median |
|---|---|---|---|---|---|---|---|
| specter2 w0.5, 10s | +0.0429 | .055 | 3.30 | **16**/18 (STATUS: 15) | -0.008 | +0.006 | +0.023 |
| pubmedbert w0.35, 10s | +0.0470 | .056 | 3.53 | 15 | -0.020 | +0.007 | +0.026 |
| pubmedbert w0.5, 10s | +0.0486 | .068 | 3.05 | **14** (STATUS: 13) | -0.027 | +0.000 | +0.023 |
| pubmedbert w0.25 / .35 / .5 / .7 / 1 / 2 (3s) | +.0428/.0424/.0442/.0476/.0396/.0242 | .058/.055/.067/.079/.093/.119 | | 16(STATUS 15)/14/13/11/9/10 | -.005/-.024/-.032/-.049/-.084/-.188 | | |
| specter2 w0.5 / 1 / 2 (3s) | +.0449/.0437/.0287 | .058/.075/.098 | | 16/12/8 | -.007/-.018/-.104 | | |
| minilm w0.5 (3s) | +0.0456 | .121 | 1.60 | 11 | **-0.168** | -0.021 | |
| medcpt w0.5 (3s) | +0.0206 | .047 | | 11 | -0.052 | | |
| nosub (TF-IDF best) | +0.0069 | .055 | | 7 | -0.058 | | |

- All means, SDs, t and worst values in STATUS reproduce to 4 dp. Only the win counts differ by one (STATUS
  apparently counts |d| < ~0.001 as not-a-win: specter2 10s has +0.0008 and +0.0018; pmb w0.5 10s has +0.0005).
  Harmless, but state the rule ("d > 0" vs "d > 0.001") in the report.
- "Plateau over w" is true **for the mean only**. The downside grows monotonically with w (pubmedbert worst
  -0.005 at w0.25 -> -0.049 at w0.7 -> -0.084 at w1; SD .058 -> .093). For SPECTER2 nothing below w0.5 was tried,
  so its plateau is bracketed on one side only.
- The "10-seed confirmation" is not an independent confirmation: seeds 101/202/303 of the 10s runs are
  byte-identical to the 3s rows (checked), and seed noise contributes only ~0.0035 SE to the 18-review mean
  (median within-review seed SD .006-.015; Wolters_2018 is bimodal, SD .14-.18, for every config). 3s vs 10s
  per-review deltas correlate 0.98-0.99. It removed seed noise; it could not test generalisation.
- The gain is concentrated: top 4 reviews (Menon, Muthu, van_der_Waal, Appenzeller-Herzog/Wolters) carry 65-67%
  of the total; without them specter2 w0.5 is +0.018 and pmb w0.35 +0.021.
- Own exports (the weights we would ship) are **incomplete**: 9/18 DEV reviews logged at 15:58, no SWEEP_EXIT.
  On those 9: specter2-own -0.0021 vs third-party (max per-review |diff| 0.027, Moran_2020), pubmedbert-own -0.0019
  (max 0.013). Not bit-equivalent; the frozen numbers must be the 18/18 own-export runs.
- `devsweep-emb` (02:47) contains 16 hyb_* configs that STATUS's recovered note calls "not evaluated yet"; they are
  exact duplicates of the later hy_* rows (same values), so they add no hidden multiplicity. Note it in STATUS.

## 2. Winner's curse / selection noise

- 37 distinct 3-seed configs (17 TF-IDF, 4 emb-only, 16 hybrid) + 3 ten-seed reruns + 2 own exports on 18 reviews.
- The leading hybrids are highly correlated across reviews (r 0.6-0.9 among pmb w0.25-0.7 and specter2 w0.5/1), so
  the selection is mostly among near-equivalent variants of one effect; specter2 w0.5 minus pmb w0.35 = +0.0025,
  SD .042 (indistinguishable). The shared effect itself is not a selection artefact (t ~3.3, 15-16/18 positive).
- Split-half (5000 random 9/9 splits, pick best mean on A, score on B), whole hybrid pool: in-sample best +0.063,
  out-of-sample +0.025 -> optimism ~0.038 at n=9 (roughly 0.025-0.03 at n=18). The mean rule keeps picking
  high-variance configs (minilm w0.5, pmb w0.7); P(out-of-sample mean < 0) = 0.13.
- Leave-one-review-out selection by mean: out-of-sample mean **-0.003** (picks pmb w0.7 11/18, minilm 4/18).
  The mean rule does not generalise even within DEV.
- Not captured by any within-DEV resampling: DEV->held-out population shift (held-out spans more non-biomedical
  fields: software engineering, education, EULAR series), u4 being in-sample on DEV (biases DEV deltas *against*
  Screen; may partly offset), the switch to own exports (~-0.002), and comparison against real ASReview instead of
  the JS port (22/24 identical orders; small extra noise).
- Honest held-out expectation for a conservatively chosen candidate: **central +0.02 (plausible -0.005 to +0.04)**.
- Protocol power formula (k=73, t crit 1.993), integrating over mu ~ N(0.02, 0.015): P(H1) **0.94** (SD .061) /
  0.90 (SD .075); P(H2) **0.64** / 0.56. Pessimistic mu ~ N(0.015, 0.02): H1 0.84/0.79, H2 0.51/0.45. Point values,
  SD .061: mu=0 -> H1 .79, H2 .02; mu=+0.01 -> H1 .99, H2 .28; mu=+0.02 -> H2 .79. The dev SD of the hybrids
  (.055-.068) is consistent with the registered .061; minilm-type SDs (.12-.15) would collapse power.
- Strategic note: the plain u4 port (rank-core.js, no embedding) differs from real u4 with SD ~0.005, so it passes
  H1 with probability ~1 and H2 with ~0. Adding embeddings trades ~5-15 points of H1 probability for a 0.5-0.65
  chance at H2. That trade is legitimate but should be stated in FREEZE.md as the reason for the choice.

## 3. Selection rule

The primary test is NI on a mean with a t-interval, so the relevant quantity is roughly (mu + 0.02)/SD, and
downside reviews matter for the secondary "reviews losing by > margin" count. Within DEV, conservative rules
generalise better than the mean rule:

| rule (pick on 9, score on other 9; hybrid pool) | OOS mean | OOS worst | P(OOS mean<0) | LOO mean |
|---|---|---|---|---|
| mean | +0.025 | -0.071 | 0.13 | -0.003 |
| lower CB (mean - t*SE) | +0.042 | -0.012 | 0.010 | +0.039 |
| q25 | +0.033 | -0.049 | 0.07 | +0.041 |
| worst review | +0.043 | -0.005 | 0.001 | +0.040 |

On the full 18, LCB ranks pmb w0.35 10s (+0.019) > specter2 w0.5 3s (+0.016) ≈ specter2 w0.5 10s (+0.016);
q25 ranks pmb w0.35 10s ≈ specter2 w0.5; worst ranks pmb w0.25 (-0.005) ≈ specter2 w0.5 (-0.007/-0.008). LOO with
LCB/q25 picks specter2 w0.5 13/18 times. (A pure (mu+0.02)/SD rule picks the TF-IDF clones of u4 — see the
strategic note.) Conclusion: the mean rule is the wrong rule; under the robust rules the evidence **does not
separate** specter2 w0.5 from pmb w0.25-0.35.

**Recommendation: SPECTER2-base (own export) w0.5**, conditional on its own-export 18/18 10-seed run. Reasons:
(a) top or co-top under every robust rule and the LOO-robust pick; (b) smallest downside among the 10-seed runs
(worst -0.008 vs -0.020) and 16/18 positive; (c) the only non-biomedical DEV review, Hall_2011 (software
engineering), is +0.002 for SPECTER2 but -0.020/-0.027 for PubMedBERT — a domain-shift tell that matters because
held-out has more non-biomedical reviews; (d) browser cost is a wash (both 768-d BERT-base; 2.7-4 vs 2-4 docs/s);
MiniLM's 5x speed does not compensate an SD of .12 and worst -0.168. Caveat to disclose: SPECTER2 was trained on
citation proximity, and included studies of published reviews are co-cited by those reviews; this is a
label-adjacent pretraining signal (equal for DEV and held-out, not tunable leakage, but it may not transfer to
new topics). PubMedBERT-embeddings (title-abstract pairs) has no such signal.
Pre-specify NOW, before the remaining own-export rows arrive, the fallback: if specter2-own w0.5 10s on 18/18
has mean < +0.02 or worst < -0.03, freeze pmb-own w0.35 instead; otherwise specter2-own w0.5. No further w tuning.

## 4. Leakage / contamination

- Embeddings: `own_onnx.cmd` -> `embed_many.mjs` (Transformers.js, q8, cpu, input `title + '. ' + abstract`,
  max-tokens 256, CLS for SPECTER2 / mean for PubMedBERT); no label column is passed. TF-IDF and embeddings are
  fitted on all records of a review, unlabelled — transductive but label-free and symmetric with ASReview's
  TF-IDF. Verify `embed_many.mjs` never reads `label_included` (it is outside the repo; not inspected here).
- `max-tokens 256` truncates long abstracts; it is a tuned-by-default setting and must be pinned.
- DEV sweeps passed `--emb-dir/--emb-w` but never `--emb-onnx-sha256`; provenance of DEV numbers rests on the
  `.f32.json` meta. Record each DEV emb file's `onnx_sha256` next to the frozen numbers.
- Held-out isolation: run_js refuses non-DEV keys without `--heldout-ok`; laptop had DEV CSVs only; own export
  embedded only `dev18.txt`. But desktop/baseimage hold all 119 CSVs; the "582-doc smoke" speed test does not name
  its dataset — confirm it was DEV. I found no held-out-derived choice; PRIMARY/cluster rules predate results.
- Quantization: q8 dynamic (per_channel False, reduce_range False); integer kernels can differ by CPU/SIMD and
  between onnxruntime-node and onnxruntime-web, so Node-computed held-out embeddings may not equal browser ones
  bit-for-bit. Either show equality on one review or disclose the tolerance.
- Licence switch resolved the shipping blocker; the third-party ONNX DEV results are now superseded and must not
  be quoted as the frozen candidate's numbers.

## 5. FREEZE.md must pin

1. allmeta commit SHA (the frozen tree), PROTOCOL sha256 58e581ab...6288, prereg commit 24f04f36...; the tag request.
2. `rank-core.js` sha256 (currently 15b24306...f252, unchanged — appendDense is in the registered file), plus
   sha256 of `run_js.mjs`, `run_heldout.py`, `core.py`, `analyze.py`, `extract.mjs` (parseCSV), `embed_many.mjs`.
3. Config name and the exact `--js-args`: `--emb-w 0.5 --emb-dir <dir> --emb-onnx-sha256 <sha>`, TF-IDF u4 defaults
   (1-2 grams, min_df 1, max_df 0.95, sublinear), C 0.11, ratio 9.8, retrain-every 1, warm start on, SVM rng seed 1,
   tol 1e-4, maxIter 1000; embedding block per-row L2-normalised then scaled by w.
4. Model: HF repo + revision hash of allenai/specter2_base (and NeuML fallback), sha256 of `model_quantized.onnx`,
   `model.onnx`, `config.json`, `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json`;
   `export_provenance.json` (torch/transformers/optimum 2.1.0/optimum-onnx 0.1.0/onnx 1.23.2/ort 1.31.0, opset 14,
   QARGS); licence (Apache-2.0) and attribution.
5. Embedding recipe: Transformers.js version, onnxruntime-node version, node version (v24.15.0), dtype q8, device
   cpu, pooling, prefix "", max-tokens 256, batch size, text template, float32 output layout; machine + CPU flags.
6. The browser path: onnxruntime-web/WASM version actually loaded by the app and a measured Node-vs-browser
   embedding agreement on one DEV review; retraining cadence of the UI (for S11).
7. The DEV evidence the choice rests on: grid JSONs, jsonl sha256s, the selection rule and fallback (Section 3),
   per-review own-export 10s table, and the note that the 10s rerun shares seeds 101-303 with the 3s sweep.
8. The order: held-out embeddings are computed after FREEZE.md is committed, with `--emb-onnx-sha256` enforced,
   and each held-out `.f32` sha256 is archived with the results.
