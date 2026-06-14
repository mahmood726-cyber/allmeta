# Mechanism-aware ensemble (frontier roadmap **P0**) — measured result

> _Truth-first report. This is the honest outcome of the §2a-item-4 / roadmap-P0
> "strongest single lever": a mechanism-aware ensemble routing/combining NPE,
> p-uniform\*, WLS/WAAP (+ Manski PartialID), with an OOD-widening gate. **It was
> built, tuned, and measured rigorously — and it does NOT beat the existing
> Unified estimator.** Numbers are read directly from `validation_ensemble.json`
> (A/B at **500 reps/cell**, exact harness seeding); nothing is hand-typed. The
> negative is the result._

## What was built

`mech_ensemble.py` — a drop-in `(y, v)` estimator:

* **Point** = the production **gated NPE** point (so it inherits the P1.1
  clean-data fix). The head-to-head's premise was that the corrector families have
  *disjoint winning regions by bias*; we route the point to the locally-best one.
* **Mechanism detection** (`detect_mechanism`) — soft scores for {clean, step,
  copas} from the permutation-invariant features (severity gate, p-step
  fingerprint + left-skew, precision–effect correlation).
* **Interval** = scaled NPE conformal interval (×1.15, matching Unified's frozen
  calibration), **widened to the union with the Manski PartialID bound** when a
  selection mechanism or out-of-distribution signature is detected. The OOD signal
  is the **component-point disagreement** (spread of {gated-NPE, DL, WLS,
  p-uniform\*} relative to the NPE half-width) — a model-agnostic "the correctors
  don't agree, so widen" trigger. Threshold `OOD_K` swept ∈ {0.7, 0.9, 1.1, 1.25}.

## Measured head-to-head (500 reps/cell, exact seeding)

`ME@K` = MechEnsemble at OOD trigger K. (p-uniform\*/WLS/WAAP/PartialID shown for
context; HenmiCopas measured separately in `validate_henmi.py`.)

| regime / metric | DL | WLS | WAAP | p-uni\* | PartialID | **NPE (gated)** | **Unified** | **ME@0.7** | **ME@1.25** |
|---|---|---|---|---|---|---|---|---|---|
| clean `|bias|` | 0.004 | 0.005 | 0.010 | 0.010 | 0.059 | **0.009** | 0.009 | 0.009 | 0.009 |
| under-sel `|bias|` | 0.107 | 0.090 | 0.077 | 0.075 | 0.037 | **0.059** | 0.059 | 0.059 | 0.059 |
| under-sel min cov | 0.000 | 0.006 | 0.182 | 0.442 | 0.868 | 0.958 | **0.978** | 0.980 | 0.978 |
| primary min cov | 0.000 | 0.006 | 0.182 | 0.442 | 0.868 | 0.952 | **0.976** | 0.976 | 0.976 |
| primary mean width | 0.325 | 0.341 | 0.815 | 0.594 | 0.659 | **0.537** | 0.617 | 0.639 | 0.620 |
| type-I mean reject0 | 0.286 | 0.280 | 0.264 | 0.150 | 0.025 | 0.035 | 0.018 | **0.016** | 0.017 |
| type-I max reject0 | 0.924 | 0.902 | 0.830 | 0.374 | 0.072 | 0.074 | 0.050 | **0.042** | 0.050 |
| stress min cov | 0.000 | 0.000 | 0.032 | 0.322 | 0.734 | 0.942 | 0.962 | **0.964** | 0.962 |
| stress mean width | 0.272 | 0.292 | 0.598 | 0.586 | 0.564 | **0.569** | 0.656 | 0.684 | 0.662 |

## Verdict — honest negative

**The mechanism-aware ensemble does not Pareto-improve over Unified.**

1. **Bias: nothing to gain.** MechEnsemble's bias is *identical* to NPE/Unified in
   every regime (clean 0.009, under-sel 0.059, stress 0.090) because it uses the
   gated-NPE point — and that is correct, because **NPE already wins bias under
   every selection mechanism** (under-sel: NPE 0.059 vs WLS 0.090, WAAP 0.077,
   p-uniform\* 0.075). The small-study/selection competitors are *strictly worse*
   on bias *and* carry catastrophic type-I (0.15–0.92) and min-coverage
   (0.000–0.44). Routing the point toward them can only hurt. The one method with
   lower bias, PartialID (0.037), pays for it with the widest intervals (0.659) —
   it is the conservative sibling Unified already unions in.

2. **The premise dissolved once P1.1 landed.** The roadmap motivated this ensemble
   with *disjoint winning regions*: small-study methods won the **clean** cell;
   NPE won under selection. But the **severity gate (P1.1)** already pulled NPE's
   clean-data `|bias|` from 0.055 down to **0.009** — into a dead heat with WLS's
   0.004. With the clean gap closed, gated-NPE is best-or-tied on bias *everywhere*
   and the disjoint regions collapse to a single region NPE owns. There is no
   territory left for an ensemble to capture.

3. **Interval-widening is redundant with Unified.** MechEnsemble matches Unified's
   coverage (primary min 0.976; stress 0.962) but at **equal-or-wider** intervals
   (+0.003 to +0.028). The component-disagreement OOD trigger fires on the *same*
   hard cells as Unified's PartialID-disagreement trigger, so it buys no coverage
   Unified didn't already have — it only adds width. As `OOD_K`→1.25 the trigger
   goes quiet and MechEnsemble converges to Unified (width +0.003 primary).

4. **The only flicker of an edge is noise.** `ME@0.7` shows stress min-cov 0.964 vs
   Unified 0.962 (+0.002, within Monte-Carlo error at 500 reps) and type-I max
   0.042 vs 0.050. Neither is a real improvement.

**Recommendation:** keep **Unified** as the headline estimator. The mechanism-aware
ensemble is committed as a registered, working method (`MechEnsemble`) and a
measured artifact, but it is **not** an upgrade. The lever that actually moved the
benchmark was P1.1 (the severity gate) — and, in doing so, it removed the very gap
this ensemble was designed to exploit. That is the honest story: a well-motivated
P0 superseded by the P1.1 result it was queued behind.

## Reproduce

```
python validate_ensemble.py --reps 500     # full head-to-head -> validation_ensemble.json
python mech_ensemble.py                     # smoke: per-scenario point/interval/OOD trigger
```
