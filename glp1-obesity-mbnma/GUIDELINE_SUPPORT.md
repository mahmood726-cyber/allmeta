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

## Honest scope
- This is a **decision-support scaffold**, not a guideline. The MID, the RoB, and all judgement domains are
  the panel's; the contrast CrI here is conservative (independent marginals — the exact NMA contrast needs
  the joint posterior and is narrower). k and single-class limits apply as everywhere in this project.
- CINeMA's full 6-domain network confidence (`allmeta/cinema`) and a GRADEpro/EtD export
  (`gradepro`, `grade-sof-generator`) are the natural next integrations; this PoC reuses the validated
  `GRADEAutomationEngine` and demonstrates the principle end-to-end.
- It does not replace a guideline panel, a formal systematic review, or human RoB/GRADE adjudication — it
  makes them faster, more transparent, and reproducible.
