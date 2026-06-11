# Handoff — continue in a new session

**Repo/branch:** worktree `C:\Projects\glp1-doseresp-nma`, branch `glp1-obesity-doseresp-nma`, remote
`github.com/mahmood726-cyber/allmeta` (dedicated branch; do NOT merge to master without review). All work
lives in `glp1-obesity-mbnma/`. Data policy: AACT + PubMed abstracts + authoritative reference
distributions only; no IPD, no full text. rapidmeta repos untouched.

## Current state (complete + verified)
Registry-native synthesis → HTA → 6 wide-gap methods → GRADE/CINeMA guideline scaffold → exact joint-
posterior contrast → certainty league table → decision-sensitivity → external validation (**n=7** published
NMAs/guidelines concordant) → 2 portfolio-method integrations (Benford integrity, entropy-balancing
transport) → **5-class generality** (incretin/PCSK9/SGLT2/psoriasis/asthma = continuous-weight / continuous-
LDL / hard-outcome-HR / binary-responder / count-rate-IRR), with **three full-depth classes** — PCSK9
(continuous), SGLT2 (survival/HR), asthma (count/rate) — each carrying a **Bayesian-draw league** (CrI +
P(superiority), nutpie R̂=1.00) + GRADE + transport + offline dashboard, plus **complementary methods**
(UBCMA + GRMA, `COMPLEMENTARY_METHODS.md`). **All FIVE outcome types now have a full-depth class** — PCSK9
(continuous), SGLT2 (survival/HR), asthma (count/rate), psoriasis (binary/responder, PASI-90), and **RA
(ordinal, ACR20>50>70 ladder)** — each with a Bayesian-draw league + GRADE + transport + offline dashboard, and
**all five are now wired into `run_all.py`** (stages C2–C6, no longer standalone). One-command reproducible
(`python run_all.py`), **52-test** self-verifying. Key docs: `PAPER.md`, `GUIDELINE_SUPPORT.md`,
`WIDE_GAP_METHODS.md`, `GENERALITY_MATRIX.md`.

## Remaining frontiers (pick up here)
1. ~~**5th outcome type** — count/rate (exacerbation rate-ratio, IRR-NMA)~~ **DONE** (`class5_asthma/`):
   asthma anti-eosinophil/anti-TSLP biologics, annualised-exacerbation IRR. All 4 agents significantly reduce
   the rate (class IRR 0.70); engine flags the raw cross-agent ranking as baseline-rate/eosinophil effect
   modification (I²=96%), not a clean winner. Pinned by `test_generality_class5_asthma_rate`. Next count/rate
   extension if wanted: registry-ipd KM reconstruction on a class that *does* post KM curves.
2. ~~**Promote one class to the full 40-stage pipeline** — PCSK9~~ **DONE (all 4 named depth stages)**:
   - **league + GRADE** — `class2_pcsk9/pcsk9_league.py` → `pcsk9_league.json`: full pairwise LDL league with
     per-comparison GRADE/CINeMA certainty, *same* domains as `nma_league.py` (3 Moderate / 3 Low / 6 comps,
     bococizumab lead, no k=1). Pinned by `test_pcsk9_league_depth`.
   - **transport** — `pcsk9_transport.py` → `pcsk9_transport.json`: % LDL → absolute mg/dL & mmol/L in a real
     NHANES elevated-LDL US target (baseline 132 mg/dL; bococizumab −2.61 → inclisiran −1.99 mmol/L), *same*
     NHANES reference source as the incretin transport. Pinned by `test_pcsk9_transport_depth`. (Transport is
     of the LDL **surrogate**, explicitly NOT a CV claim.)
   - **dashboard** — `pcsk9_dashboard.py` → `pcsk9_dashboard.html`: single-file, fully-offline render of
     league + GRADE + transport. Pinned by `test_pcsk9_dashboard_offline`.
   Honest bounds: PCSK9 league uses the frequentist normal contrast (no Bayesian draw matrix for this class);
   transport assumes the % reduction is approximately population-transportable (carried modifier = target
   baseline LDL, not the %). Suite now **37 green**. Next depth idea if wanted: promote a *second* class, or
   give PCSK9 a Bayesian draw matrix for CrI-based contrasts.
3. **Data-policy-blocked methods (activate only if scope changes):** quantile MA (`ipd-qma`, needs IPD);
   umbrella CCA (`umbrellareview`, needs each review's included-study list) — would let the concordance
   battery test whether the 7 validators are *independent* or recycle trials.
4. ~~**Complementary methods (optional):** UBCMA + grey-relational MA~~ **DONE** (see
   `COMPLEMENTARY_METHODS.md`), both on the semaglutide-2.4mg node, both honest sensitivity/corroboration
   pairs (headline ranking unchanged):
   - **UBCMA** (`ubcma_reporting_bias.py` → `ubcma_reporting_bias.json`) = inferential pair to the
     ghost-measurement. Fit blind to the ghosts on the visible 13, infers μ 11.30 (vs DL 11.60) — a downward
     correction in the *same direction* the ghosts directly reveal. Pinned by
     `test_ubcma_reporting_bias_inferential_pair`. Deterministic (`restart_seed`); imports the portfolio
     package via `sys.path` to `C:/Projects/ubcma/src`.
   - **GRMA** (`grma_robust_pool.py` → `grma_robust_pool.json`) = robust-pooling sensitivity. μ 11.27 vs IV
     11.47 (Δ −0.20) → robust to the pooling rule. Pinned by `test_grma_robust_pool_sensitivity`. Faithful
     **Python port** of `C:/Projects/grma/grma_meta.R` (R unavailable; NOT in metafor so no 1e-6 cross-check —
     stated openly). Dissonance Field Synthesis kept OUT of the guideline layer (novel/unvalidated).
   Suite now **39 green**.

   **SECOND full-depth class — SGLT2 (`class3_sglt2/`), with a Bayesian-draw league:**
   - **league** — `sglt2_league_bayes.py` → `sglt2_league.json` + `sglt2_hf_draws.npz`: hierarchical RE on
     log-HR (nutpie, R̂=1.00), every pairwise contrast from a **posterior draw matrix** (CrI + P(superiority)),
     same GRADE/CINeMA domains as `nma_league.py`. Restricted to the **single HF-hospitalisation endpoint**,
     which *resolves the I²=87% composite artifact* the class-3 core repoint flagged. canagliflozin 0.67 lead;
     ertugliflozin k=1 → INSUFFICIENT; dapagliflozin drops out (posts only the CV-death/HF composite). Pinned
     by `test_sglt2_league_bayesian_depth`. (This is the answered "give the league a Bayesian draw" request.)
   - **transport** — `sglt2_transport.py` → `sglt2_transport.json`: HR draws → **ARR + NNT** across baseline-
     risk targets (NNT ~242 primary-prevention → ~45 HFrEF). Baseline rates are a reference distribution.
     Pinned by `test_sglt2_transport_nnt_depth`.
   - **dashboard** — `sglt2_dashboard.py` → `sglt2_dashboard.html` (offline). Pinned by `test_sglt2_dashboard_offline`.
   Note: `sglt2_results.json` (composite, flags heterogeneity) is KEPT as the core repoint; the Bayesian
   single-endpoint league is the depth promotion that *fixes* it.

   **PCSK9 Bayesian-league parity + asthma = THIRD full-depth class (both DONE this session):**
   - **PCSK9 Bayesian league** — `class2_pcsk9/pcsk9_league_bayes.py` → `pcsk9_league_bayes.json` (+ npz,
     gitignored): hierarchical one-way RE on per-trial %LDL with **heteroscedastic per-agent SD** (nutpie,
     R̂=1.00); draws → CrI + P(superiority). Same ranking as the frequentist league (bococizumab lead) but
     more conservative (5 Low / 1 Moderate) — it propagates the real cross-trial heterogeneity. The
     frequentist `pcsk9_league.json` is kept alongside. Pinned by `test_pcsk9_league_bayesian_parity`.
   - **Asthma full-depth (3rd class, count/rate)** — `class5_asthma/asthma_league_bayes.py` →
     `asthma_league.json` (Bayesian IRR league, nutpie R̂=1.00, tezepelumab 0.48 lead, class IRR 0.61),
     `asthma_transport.py` → `asthma_transport.json` (IRR → exacerbations averted/yr: ~0.32 moderate → ~1.38
     frequent-exacerbator — baseline rate IS the class-5 effect-modifier, made explicit), `asthma_dashboard.py`
     → `asthma_dashboard.html` (offline). `asthma_results.json` kept as the core repoint. Pinned by
     `test_asthma_league_bayesian_depth` / `_transport_averted_depth` / `_dashboard_offline`.
   Suite now **46 green**. Three full-depth classes now span continuous + survival + count/rate, each with a
   Bayesian-draw league.

   **FOURTH full-depth class — psoriasis (`class4_psoriasis/`), binary/responder path (DONE this session):**
   - **league** — `psoriasis_league_bayes.py` → `psoriasis_league.json` (+ `psoriasis_pasi_draws.npz`,
     gitignored): hierarchical Bayesian RE on the **logit of per-arm PASI-90 response** (nutpie, R̂=1.0000),
     per-agent mean + heteroscedastic per-agent SD; draws → response% with CrI, **risk-difference (pp)**
     contrasts + P(superiority), same GRADE/CINeMA domains as `nma_league.py` (29 Moderate / 16 Low over 45
     ordered comps). Lead **bimekizumab 89%**; reproduces the established **IL-17/IL-23 > TNF** hierarchy with
     posterior probability (57% vs 31%, **P=1.000**). Pinned by `test_psoriasis_league_bayesian_depth`.
   - **transport** — `psoriasis_transport.py` → `psoriasis_transport.json`: response draws → **responders
     gained/100 + NNT** vs placebo across documented placebo backgrounds (2/4/7%). Honest contrast with
     SGLT2/asthma: PASI-90 placebo is low/stable, so NNT is dominated by the large active response, not the
     baseline (lead NNT ~1.18; per-agent table NNT 1.18→5.94). Pinned by `test_psoriasis_transport_nnt_depth`.
   - **dashboard** — `psoriasis_dashboard.py` → `psoriasis_dashboard.html` (single-file, fully offline).
     Pinned by `test_psoriasis_dashboard_offline`.
   `psoriasis_results.json` kept as the core repoint. Logit hierarchical-means form (AACT posts the response %,
   not per-arm responder counts here; per-agent SD absorbs arm-size + between-arm spread). Star network.
   Suite now **49 green**.

   **FIFTH outcome type + FIFTH full-depth class — RA ordinal (`class6_ra/`), DONE this session:**
   - **league** — `ra_league_bayes.py` → `ra_league.json` (+ `ra_acr_draws.npz`, gitignored): the new outcome
     type is **ordinal / ordered-categorical** (the ACR20>ACR50>ACR70 response ladder). Honest model = a
     **Bayesian proportional-odds graded-response**: one latent efficacy θ_a per agent + three SHARED ordered
     cutpoints (logit P[reach L] = θ_a − τ_L), nutpie **R̂=1.0000**, 12 agents × 3 thresholds = 4275 arm-rows.
     Latent draw matrix → **log-OR** contrasts + P(superiority) + predicted ACR50%, same GRADE/CINeMA domains.
     Class-level advanced-MoA ≥ TNF holds (P(IL-6/JAK>TNF)=0.91) but the engine **flags** the cross-agent
     ranking as arm-level heterogeneity — proportional-odds residual RMSE=2.0, a TNF agent (etanercept) leads
     while the class-mean favours advanced-MoA → not a clean winner (the ordinal echo of the asthma I²=96%
     flag). `heterogeneity_flag=true` in the JSON. Pinned by `test_ra_league_bayesian_depth`.
   - **transport** — `ra_transport.py` → `ra_transport.json`: predicted-ACR50 draws → **responders gained/100
     + NNT** vs placebo across MTX-dependent placebo backgrounds (~5/10/15%). Unlike psoriasis, RA placebo
     ACR50 is non-trivial so the baseline moves the NNT. Pinned by `test_ra_transport_nnt_depth`.
   - **dashboard** — `ra_dashboard.py` → `ra_dashboard.html` (offline). Pinned by `test_ra_dashboard_offline`.
   `ra_results.json` written as the core repoint. Suite now **52 green**.

   **WIRING — class leagues into `run_all.py` (DONE this session):** all five classes' league + transport +
   dashboard are now STAGES `C2a…C6c` (17 new stages) in `run_all.py` (league stages slow=AACT/NUTS,
   transport/dashboard fast). They skip-on-output like every other stage; smoke-tested by deleting one fast
   output and confirming the orchestrator regenerates it. They are no longer standalone.

   **CLASS-LEVEL EXTERNAL VALIDATION (DONE this session):** `class_concordance.py` → `class_concordance.json`
   (+ `COMPARISON_PUBLISHED_CLASSES.md`) compares each of the 5 generality classes to a **PubMed-verified
   published NMA** (every DOI resolved 2026-06-11): PCSK9 = Jiang 2025 *Front Cardiovasc Med*; SGLT2 = Tsapas
   2020 *Ann Intern Med*; psoriasis = Sbidian 2022 *Cochrane*; asthma = Menzies-Gow 2022 *J Med Econ*; RA =
   Singh 2017 *Cochrane*. **5/5 concordant.** Engine lead/ranking is read programmatically from each league JSON
   (pinned: the concordance lead must equal the league JSON lead). Notably the engine's *self-flagging* is
   validated — in asthma and RA the published NMAs independently reach the same "no clean winner" hesitation
   (Menzies-Gow "no significant difference"; Singh "downgraded for inconsistency"). Wired into `run_all.py`
   (stage G4e). Pinned by `test_class_concordance_published`. Suite now **63 green**.

   **RAPIDMETA CONVERSION — RA pilot DONE (this session):** wrapped the RA class in the full RapidMeta workbench
   (protocol→search→screen→extract→synthesis→paper) so every stage is auditable like the incretin flagship.
   `class6_ra/ra_rapidmeta_harvest.py` → `ra_trials.json` (per-trial ACR responder table from AACT: 4346 search
   → 207 ACR-reporting → **66 trials** with active-vs-control events `= round(ACR%×N)`, all 12 agents);
   `build_ra_rapidmeta_config.py` → `ra_rapidmeta_config.json` (kit config: PICO, 66 trials tE/tN/cE/cN, honest
   AACT-provenance note); then `python clone.py class6_ra/ra_rapidmeta_config.json --out ra_review.html` in
   `C:/Projects/rapidmeta-kit` → 1.24 MB workbench (all 7 tabs, 0 placeholder tokens). HTML+assets gitignored
   (CDN/regenerable, like `incretin_obesity_dashboard.html`); source committed + pinned by
   `test_ra_rapidmeta_conversion`. Wired run_all C6d/C6e. See `RAPIDMETA_CONVERSION.md`. **Roll out next:** same
   3 steps (harvester + config builder + clone) for psoriasis (PASI-90 %×N, identical to RA), PCSK9 (continuous
   md/se), SGLT2 (HR/events), asthma (IRR). Suite now **64 green**.

   Next depth idea: a 6th outcome family (e.g. proportion / single-arm incidence, or DTA Se/Sp), or give the
   RA league a true placebo-anchored ordinal NMA (needs per-arm responder counts → currently AACT posts %s).

## Honesty guardrails to carry forward
- Decision-support scaffold, NOT a guideline; judgement domains (RoB/values) stay with the human panel.
- No CV-benefit claim from weight loss (not a validated surrogate). k=1 apex agents = INSUFFICIENT.
- Classes 3–5 are *core repoints*, not full pipelines — state that (PCSK9/class 2 is the full-depth
  exception). Concordance is logic-level (abstracts). Complementary methods (UBCMA/GRMA) are sensitivity
  pairs, not headline claims; GRMA has no metafor cross-check (not in metafor).
- Run `python run_all.py` (self-verifies) before citing any headline number; update `tests/baselines.json`
  only with a recorded reason.
