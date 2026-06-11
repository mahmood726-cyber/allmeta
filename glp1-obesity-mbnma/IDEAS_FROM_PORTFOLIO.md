# New ideas for this project — registry-ipd + cross-repo experimental methods

Survey (2026-06-11) of `registry-ipd` and portfolio experimental methods for things that plug into the
glp1 generality engine + the RapidMeta conversion. Ordered by synergy / effort.

## 1. ⭐ registry-ipd → SGLT2 `kmAnchors` (highest synergy, uses existing assets)
The rapidmeta-kit config schema **already has a `kmAnchors` slot** ("registry KM anchors for survival/pseudo-IPD
reconstruction (registry-ipd engine)") and the glp1 project already has `build_survival.py` / `survival_nma.py`
/ `survival_hrs.csv` for the **SGLT2 survival class**. So when SGLT2 is converted to RapidMeta, feed it real
**pseudo-IPD KM curves** reconstructed by `registry-ipd` (`C:\Projects\registry-ipd`, engine: Guyot ·
censoring-informed · **Titman-2026 QP** default · Royston–Parmar · competing risks), validated against ~52
true-IPD datasets. This upgrades SGLT2 from a pooled HR to a Survival/Pseudo-IPD panel (KM curves, **RMST**
differences, time-varying HR / non-PH check — which the project's own advanced-stats rules flag as essential).
- **In-scope data path:** registry-ipd's QP engine needs per-arm `total_events`; sources allowed in production
  are (a) AACT participant-flow (`harvest/add_event_counts.py`) and (b) **PubMed abstract** "X of N" extractor
  (`harvest/abstract_events.py`, 100% precision on its 161-abstract cache). No figure/OCR data in production.
- **Why it matters:** non-PH is the #1 survival gotcha (advanced-stats.md); a single HR is misleading. RMST +
  reconstructed KM make the SGLT2 panel honest and far richer than the current pooled-HR repoint.

## 2. spec-collapse robustness check on every class ranking
`spec-collapse-atlas` (shipped: weighted-likelihood multiverse aggregator; across 473 Cochrane MAs naive
"robust" 88% → corrected 33%). Add a per-class "how robust is this ranking across analytic choices?" panel —
directly answers the reviewer-style question and matches the project's honesty brand. Pairs with the existing
heterogeneity flags (asthma I²=96%, RA proportional-odds RMSE=2.0).

## 3. PubMed-abstract event-count lever for the binary/rate classes
registry-ipd's `harvest/abstract_enrich.py::enrich_from_abstract` already extracts per-arm event fractions +
HR + median from abstracts (in-scope, fail-soft, never overwrites AACT). Reuse it to (a) fill missing per-arm N
in the RA/psoriasis harvest (the v2 harvest currently drops trials with no `outcome_counts` N — abstracts could
recover some), and (b) give asthma per-arm exacerbation counts.

## 4. allmeta R-verified method modules into the Analysis tab
`shared/` modules (trimfill, selmodel, permutest, **evalue**, RVE, rare-events; R-verified <1e-6) — surface
E-value (unmeasured-confounding sensitivity) and selection-model publication-bias on each class. Already built,
just wire.

## 5. TruthCert-sign each class's RapidMeta output
`evidence-integrity-observatory` / Ed25519 content-seal — emit a signed provenance bundle per class dashboard so
the AACT-native cohort + funnel + synthesis are tamper-evident. Fits the "checkable" goal directly.

## 6. INSPECT-SR trustworthiness pass (k≤5 classes)
advanced-stats.md: for MAs with k≤5 run INSPECT-SR authenticity checks (32% of RCTs raised concerns in the
validation set). The SGLT2 single-endpoint league (k small) is the candidate.

---
**Recommended next step:** do the SGLT2 RapidMeta conversion *with* the registry-ipd `kmAnchors` integration
(#1) as the second pilot — it converts a class AND demonstrates the registry-ipd tie-in in one move, on the
survival outcome type where it adds the most. Then psoriasis (binary, identical to RA), then PCSK9 (continuous),
then asthma (rate, + idea #3).
