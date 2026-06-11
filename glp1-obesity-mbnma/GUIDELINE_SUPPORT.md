# Guideline recommendation support — transparent, validated, human-in-the-loop

## The proposal (and my assessment)
Can this system help guideline panels make recommendations robustly? **Yes — as a transparent decision-
support tool, never an autonomous recommender.** The validated international standard is **GRADE** (with
**CINeMA** for the network confidence layer), used by WHO, NICE, and Cochrane. GRADE is deliberately *not*
a mechanical algorithm: certainty rating and the recommendation require human judgement (risk of bias,
values/preferences, resources, equity). So the system **pre-fills the computable GRADE domains — each
traceable to a data file the panel can re-run — and scaffolds the judgement domains for the panel.** That
respects GRADE *and* plays to the registry-native advantage: the panel can check every number itself.

## Why registry-native makes GRADE more robust (the genuine advance)
Several GRADE/CINeMA domains that are normally subjective or inferential become **data-driven and checkable**:

| GRADE domain | Usual practice | Registry-native here (traceable source) |
|---|---|---|
| Publication / reporting bias | *inferred* from funnel asymmetry (weak, k-limited) | **measured** — 6 posted-but-unpublished ghosts identified; pull quantified; Egger asymmetry shown to be heterogeneity, not suppression (`registry_pubbias.json`) |
| Indirectness / applicability | *judged* narratively | **quantified** — effects transported to the real target obese population; ranking survives (POTH 0.898) (`pymc_transport_v2.json`) |
| Imprecision | eyeballed vs a threshold | CrI vs a panel-set MID + information-size anchor from TSA (`grade_inputs.json`, `trial_sequential.json`) |
| Surrogate validity | often assumed | **tested** — weight loss is NOT a validated CV surrogate (I²_HR=0%), so any CV-benefit claim is blocked / downgraded (`extend_surrogate.json`) |

Each is a number the guideline writer re-runs from the cited file — transparency is the product.

## Worked example (`grade_recommendation.js`, driving allmeta/HTA's validated `GRADEAutomationEngine`)
**Question:** tirzepatide vs subcutaneous semaglutide for weight loss in obesity.
Effect: tirzepatide 17.5 vs semaglutide 14.6 pp; **difference 2.9 pp (95% CrI −0.17 to 5.97)**, k=19, N~17,401.

| Domain | Rating | Source |
|---|---|---|
| Risk of bias | **PANEL INPUT REQUIRED** | human (RoB-2) |
| Inconsistency | Serious (I²≈94%, may be explained by 44–104 wk follow-up) | `contrasts_full.csv` |
| Indirectness | Not serious (transport-quantified) | `pymc_transport_v2.json` |
| Imprecision | **Serious** (CrI crosses null + MID) — *binding* | `grade_inputs.json` |
| Publication/reporting bias | Not serious (directly measured) | `registry_pubbias.json` |

**Certainty: LOW** (validated engine independently agrees). **The teaching point:** tirzepatide *ranks
above* semaglutide, but the GRADE certainty of the *difference* is Low — so only a **CONDITIONAL**
recommendation is defensible. A naive "tirzepatide is best" ranking skips exactly this discipline.

**Draft recommendation (panel decides):** *Conditional (weak) — tirzepatide may be preferred where greater
weight loss is prioritised, but the additional benefit is uncertain; choice should weigh tolerability
(more nausea: 22% vs 16%) and cost.*

## Hard guardrails (encoded in the output)
1. **Never autonomous.** Computable domains pre-filled + traceable; panel completes RoB, values, resources,
   equity, acceptability, feasibility. Output is a DRAFT EtD, explicitly "panel to confirm".
2. **No CV-benefit claim from weight loss** — weight is not a validated CV surrogate (would be downgraded
   for indirectness). The system blocks the inference.
3. **k=1 apex agents (mazdutide, retatrutide) are INSUFFICIENT** for any recommendation (flagged upstream).
4. **Every rating re-runs from its cited data file** — the guideline writer checks, doesn't trust.

## Network-confidence layer — CINeMA (`cinema_confidence.py`)
GRADE rates a pairwise body of evidence; **CINeMA** (Nikolakopoulou/Salanti 2020) rates confidence in a
**network** estimate across six domains, and exposes what GRADE alone hides here: tirzepatide-vs-semaglutide
has **no head-to-head trial** — it is an *indirect* comparison anchored on placebo (≈50% tirz-vs-placebo +
50% sema-vs-placebo). Consequences CINeMA makes explicit:

| CINeMA domain | Rating | Basis |
|---|---|---|
| Within-study bias | Some (PANEL) | contribution-weighted RoB-2 — panel input |
| Reporting bias | **No concerns** | directly measured (6 ghosts, pull −0.12 pp) — our strongest domain |
| Indirectness | Some | population transported (POTH 0.898), but transitivity **incomplete** (baseline weight + HbA1c not posted for one node) |
| Imprecision | **Major** | indirect contrast CrI [−0.17, 5.97] crosses null |
| Heterogeneity | Some | I²≈94% but largely *explained* by follow-up (not downgraded to major) |
| Incoherence | **Not assessable** | star network — no direct evidence, no closed loop to test direct-vs-indirect agreement |

**CINeMA confidence: Low — consistent with the GRADE Low.** Two independent frameworks agree, and CINeMA
adds the decisive network message: **the evidence cannot self-check (no incoherence test) and rests on an
indirect, partially-unverifiable transitivity assumption → a head-to-head trial (e.g. SURMOUNT-5) is the
single highest-value evidence gap.** That is a concrete, defensible research-prioritisation output a
guideline panel can act on.

## Panel-ready export — GRADEpro/iEtD (`grade_export.py`)
The assessment exports into a guideline panel's existing workflow as a standard **Summary of Findings**
table + **Evidence-to-Decision** framework, in three formats:
- `grade_sof.md` — Markdown SoF + EtD (drops into a protocol/manuscript).
- `grade_export.html` — self-contained, **fully offline** (0 external refs), panel-openable.
- `grade_export.json` — machine-readable, GRADEpro/iEtD-style.

The SoF carries **three outcomes** with their certainty, modelling the real decision:
| Outcome | Certainty | Effect |
|---|---|---|
| Body-weight % change (≥36 wk), CRITICAL | Low ⊕⊕○○ | tirzepatide MD +2.9 pp [−0.2, 6.0] |
| MACE, CRITICAL | **Not estimable (contrast)** | no head-to-head; weight is not a CV surrogate → no inference |
| Nausea, IMPORTANT (harm) | Low ⊕⊕○○ | 16% → 22% (+6 pp with tirzepatide) |

The MACE row is the discipline in action: the system **refuses to manufacture a between-drug CV estimate**
from weight loss, and says so on the face of the table. GRADE certainty (Low) and CINeMA confidence (Low)
print in the header; the recommendation is Conditional; the guardrails travel with the export.

## Imprecision resolved against the exact joint posterior (`nma_contrast.py`)
The binding domain was imprecision, flagged as resting on a *conservative* (independent-marginals) contrast
CrI. I re-fit the full Bayesian NMA (NUTS/nutpie, Rhat 1.0000) and computed the **exact joint-posterior**
tirzepatide−semaglutide contrast: **+2.9 pp (95% CrI −0.14 to +5.98)** — essentially identical to the
conservative one. The posterior correlation between the two node effects is only **+0.08** (obesity) /
**+0.02** (target): in a star network with *disjoint* trials, the two placebo-anchored effects are
empirically near-independent, so hierarchical pooling barely narrows the contrast. **Imprecision is real,
not an approximation artifact — Low certainty stands.** This is an integrity check that passed: the shortcut
had not inflated the uncertainty. A useful nuance now carried to the panel: **P(tirzepatide > semaglutide) =
0.97**, P(difference > 2 pp MID) = 0.73 — directionally very likely better, magnitude genuinely uncertain.

## Full league table with per-comparison certainty (`nma_league.py` / `nma_league_export.py`)
The single recommendation generalises to the whole network: one NUTS re-fit saves the joint posterior
(`nma_draws.npz`), every pairwise contrast gets a proper CrI + P(superiority), and each cell carries a
computable certainty (imprecision from the contrast CrI + k=1 INSUFFICIENT flag + an indirect-star-network
baseline). 7 nodes, 42 ordered comparisons → `nma_league.html` (offline, colour-coded) + `.md` + `.json`.

**The headline the certainty layer exposes — and a naked SUCRA ranking hides:** the highest-*ranked* agents
(**mazdutide 21.3, retatrutide 20.2 pp**) have the **weakest** evidence (k=1, every comparison Very low /
Low). The **only Moderate-certainty conclusions in the entire network** are that the established injectables
beat the oral/weaker agents:
- tirzepatide > orforglipron +7.3 pp (P=1.00), > oral-semaglutide +7.8 (P=1.00)
- sc-semaglutide > orforglipron +4.4 (P=0.99), > oral-semaglutide +4.8 (P=1.00)

Certainty across 42 comparisons: 8 Moderate, 24 Low, 10 Very low. No comparison reaches High (indirect
star network, no incoherence check). This is the discipline of GRADE/CINeMA applied to *every* cell, not
just the headline contrast — telling a panel precisely which of the league-table claims it can lean on.

## External validation — concordance with published GRADE guidelines (`concordance_validation.py`)
The keystone question: does the automated, transparent pipeline **agree with human-adjudicated GRADE
panels**? Checked against published assessments (PubMed abstracts; data-policy compliant):

| Dimension | Published | Ours | Verdict |
|---|---|---|---|
| **Recommendation** (BMJ 2025 MAGIC living guideline, DOI 10.1136/bmj-2024-082071) | *weak recommendation in favour of tirzepatide in obesity* | Conditional (weak), favour tirzepatide | **MATCH** |
| **Ranking** (Shi 2024 Lancet 10.1016/S0140-6736(24)00351-9 / Xie 2024) | GLP-1 top; tirzepatide > semaglutide | tirzepatide > semaglutide | **MATCH** |
| **Certainty** (Shi 2024 / Iannone 2023, 10.1111/dom.15138) | moderate–high (vs placebo) | Low (head-to-head *difference*) | concordant in *logic* — different estimand |
| **Effect** | semaglutide −11.4% vs lifestyle | order-of-magnitude consistent; Xie tirzepatide 16.6 reproduced **exactly** | consistent |

**The automated pipeline reproduced the human guideline conclusion on the decision that matters** — a
weak/conditional recommendation favouring tirzepatide in obesity, matching a Guyatt/Vandvik/MAGIC GRADE
guideline. The certainty rows are *not* the same estimand (published rate each drug vs placebo; ours rates
the harder head-to-head *difference*), so they're concordant in logic, not cell-by-cell — an honesty the
abstract-only data policy enforces. This is genuine external validation: the transparent automation lands
where the experts did. *(Attribution: According to PubMed; DOIs above.)*

## One-command regeneration + dashboard
The entire chain — registry → NMA → wide-gap methods → HTA → exact contrast → league → GRADE/CINeMA →
exports — regenerates from the pinned AACT snapshot via **`python run_all.py`** (38 dependency-ordered
stages, output-cached; `--fast` skips the slow Bayesian/AACT-load stages; `--force` re-runs all; the runner
is interpreter-aware, using `node` for the `.js` stages). The final stage builds **`dashboard.html`** — a
single self-contained, fully-offline page that stitches the draft recommendation, Summary of Findings,
Evidence-to-Decision, the colour-coded league table, and the seven wide-gap/HTA result cards into one
panel-openable view. Every number on it re-runs from a cited data file, so a guideline writer can audit and
reproduce the whole assessment from one command.

## Honest scope
- This is a **decision-support scaffold**, not a guideline. The MID, the RoB, and all judgement domains are
  the panel's. The contrast is now the **exact joint-posterior** estimate (verified ≈ the conservative one);
  k and single-class limits apply as everywhere in this project.
- CINeMA's full 6-domain network confidence (`allmeta/cinema`) and a GRADEpro/EtD export
  (`gradepro`, `grade-sof-generator`) are the natural next integrations; this PoC reuses the validated
  `GRADEAutomationEngine` and demonstrates the principle end-to-end.
- It does not replace a guideline panel, a formal systematic review, or human RoB/GRADE adjudication — it
  makes them faster, more transparent, and reproducible.
