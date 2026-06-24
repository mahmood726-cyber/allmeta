# RapidMeta numerical validation vs published benchmarks

Every RapidMeta engine touched by this work is checked against the reference R
implementations (`netmeta`, `metafor`) on **published** datasets, routed through
the **real bus path** the apps use (canonical-datasets → `ma-comparisons-v1`
`buildEnvelope`/`toContrasts` → `nma-multiarm-v1` / `ma-core`). Reproduce with:

```
node benchmark/rapidmeta-validation/hasselblad_rapidmeta.mjs
Rscript benchmark/rapidmeta-validation/hasselblad_netmeta.R
node benchmark/rapidmeta-validation/macore_bcg.mjs && Rscript benchmark/rapidmeta-validation/macore_bcg.R
node benchmark/rapidmeta-validation/smd_check.mjs && Rscript benchmark/rapidmeta-validation/smd_check.R
```

## 1. Hasselblad (1998) smoking cessation — NMA, 24 trials, 4 treatments

Reference treatment **No contact**; OR (log scale). Source:
Hasselblad 1998; Lu & Ades 2004; Dias et al. NICE DSU TSD 2.

| contrast (vs No contact) | model | RapidMeta logOR (se) | netmeta logOR (se) | Δ |
|---|---|---|---|---|
| Self-help | FE | −0.129211 (0.076935) | −0.129211 (0.076935) | 0 |
| Individual | FE | 0.697146 (0.076820) | 0.697146 (0.076820) | 0 |
| Group | FE | 0.481227 (0.095079) | 0.481227 (0.095079) | 0 |
| Self-help | RE | 0.154781 (0.273334) | 0.154781 (0.273334) | <1e-6 |
| Individual | RE | 0.895469 (0.281174) | 0.895469 (0.281174) | <1e-6 |
| Group | RE | 0.608117 (0.353324) | 0.608117 (0.353324) | <1e-6 |

Heterogeneity (RE): RapidMeta **τ²=0.580333, Q=209.6591, df=21** = netmeta exactly.
RE OR for Individual counselling vs No contact = exp(0.8955)=**2.45**, matching the
canonical gemtc/netmeta result.

## 2. Multi-arm correction unit test (synthetic, netmeta-gated)

`shared/tests/nma-multiarm-v1.spec.mjs` — FE point/SE **and** RE τ²/Q/df/point/SE
match `netmeta::netmeta()` to **1e-6** on a 3-arm-containing network, including a
genuinely heterogeneous fixture (τ²=0.8921998). Incomplete multi-arm cliques are
reported, never silently mis-fit.

## 3. BCG vaccine (Berkey 1995) — pairwise RR meta-analysis

ma-core pooling vs `metafor::rma`, 13 trials, log-RR.

| method | RapidMeta μ (se), τ² | metafor μ (se), τ² |
|---|---|---|
| DL   | −0.758157 (0.179513), 0.336609 | −0.758157 (0.179513), 0.336609 |
| REML | −0.758221 (0.180982), 0.343160 | −0.758221 (0.180982), 0.343160 |
| PM   | −0.758280 (0.182505), 0.350021 | −0.758280 (0.182507), 0.350031 |
| REML+HK | −0.758221 (0.182404) | −0.758221 (0.182404) |

Exact to ≤1e-6 (PM τ² to 1e-5, bisection tolerance). I²=93.1%. Pooled RR =
exp(−0.758)=**0.47** — the textbook ~53% TB-risk reduction.

## 4. SMD (Hedges g) contrasts — vs metafor escalc

`ma-comparisons-v1.toContrasts` continuous path, 4 studies, exact gamma bias
correction. g and se match `metafor::escalc(measure="SMD")` to **1e-6** on all 4.

## Independent cross-check

The reference engines above (R `netmeta` / `metafor`) are themselves the
independent oracle. A **Codex** round-robin recomputation of the multi-arm GLS
fixture (no R, its own node REPL, building S6 as a 2×2 shared-A covariance
block) returned **d_B=0.5926 (se 0.2043), d_C=0.4841 (se 0.2155)** — matching
RapidMeta and netmeta to 4 dp. Triple, implementation-independent confirmation
(RapidMeta = netmeta = Codex). Prompt: `codex_verify.txt`.

**Status: all four published/benchmark comparisons match the reference R
implementations to ≤1e-6.**

---

## ⚠️ CORRECTION ADDENDUM (2026-06-24 data-integrity audit) — supersedes claims above

The validation above proves the **engines** match R — but it ran R on the
**embedded** data, so it only proves engine==engine, not data==published. A
separate data-integrity audit (see `../../qa_error_patterns.md`,
`../../qa_master_correction_log.csv`) compared the embedded numbers against the
published sources and found errors the engine-validation could not have caught:

1. **§1 Smoking is INVALID as a "matches published" claim.** The embedded
   `smoking` arms are **not** `netmeta::smokingcessation`. Embedded: 24 two-arm
   contrasts, df=21, τ²=0.580. Published: 24 studies incl **2 three-arm**, 28
   contrasts, df=23, τ²=0.599. Treatment labels are scrambled — the
   "Individual vs No contact RE OR = 2.45" reported here actually equals the
   **Group** effect (pub 2.465); true published Individual = 2.082, Self-help
   1.516, Group 2.465. So §1's "= netmeta exactly / matching canonical gemtc"
   is engine==engine on corrupted data, **not** a published match. Corrected
   data staged at `smoking_corrected_arms.json` (regenerated from
   `netmeta::smokingcessation`); merge pending coordination with the NMA-render
   session.

2. **§3 BCG fixtures had two wrong sampling variances** (Ferguson vi
   0.0786→**0.1946**, Rosenthal-1960 vi 0.0408→**0.4154**) and one wrong year
   (Comstock&Webster 1956→**1969**). These are **now fixed** in
   `shared/canonical-datasets.js` and in `bcg_data.json`. The DL/REML/PM μ in §3
   was pooled on the wrong vi; with corrected vi the REML pooled RR moves
   0.4685 → **0.4894** (Rosenthal had been ~10× over-weighted). Re-run
   `qa_bcg_impact.R` to reproduce.

§2 (multi-arm GLS unit test) and §4 (SMD escalc) used synthetic/derived inputs
and remain valid. Net: the **math is sound; some embedded data was not.**
