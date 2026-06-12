"""
Stage-3 extraction-validation harness for the GLP-1/GIP obesity dose-response NMA.

Holds the obesity arm-level extractor (rct-extractor-v2 `obesity_arm_data.py`) to
the credibility bar set by `registry-ipd/VALIDATION.md`:
  - held-out GOLD STANDARD of hand-verified, source-cited published values,
  - coverage + within-tolerance accuracy reported with **Wilson 95% CIs**,
  - a TIERED verdict (not a single number), and
  - brutal honesty: this is a small hand-verified ILLUSTRATION, not an automated
    portfolio result, and the gold set does NOT generalise beyond these arms.

NOTE (carried from SPEC.md): registry-ipd itself reconstructs *time-to-event*
pseudo-IPD from KM curves; we reuse its **validation discipline**, NOT its engine.
Our endpoint is continuous % body-weight change, so accuracy = |extracted - gold|
in percentage points, plus dose/agent identity match.

Run: python validate_extraction.py    (self-test on the bundled gold set)
"""
import math
import sys
from pathlib import Path

# Make the rct-extractor-v2 obesity extractor importable without installing it.
_RCT = Path(r"C:/Projects/rct-extractor-v2")
if _RCT.exists():
    sys.path.insert(0, str(_RCT))
try:
    from src.specialties.obesity_arm_data import extract_obesity_arms
except Exception:  # pragma: no cover
    extract_obesity_arms = None

# ---------------------------------------------------------------------------
# GOLD STANDARD — hand-verified, source-cited. ~68wk primary, % body-weight
# change (LS-mean, MMRM/treatment-policy estimand as published). HONESTY: these
# are transcribed by hand from the cited primary papers for VALIDATION ONLY; they
# are an illustration, not an automated extraction result, and do not generalise.
# ---------------------------------------------------------------------------
GOLD = [
    # STEP 1 — Wilding JPH et al. NEJM 2021;384:989-1002 (PMID 33567185), wk68
    {"study": "NCT03548935", "agent": "semaglutide", "dose": 2.4, "gold_pct": -14.9,
     "source": "Wilding 2021 NEJM 384:989 (STEP 1), wk68 treatment-policy"},
    {"study": "NCT03548935", "agent": "placebo", "dose": 0.0, "gold_pct": -2.4,
     "source": "Wilding 2021 NEJM 384:989 (STEP 1), wk68"},
    # SURMOUNT-1 — Jastreboff AM et al. NEJM 2022;387:205-216 (PMID 35658024), wk72
    {"study": "NCT04184622", "agent": "tirzepatide", "dose": 5.0, "gold_pct": -15.0,
     "source": "Jastreboff 2022 NEJM 387:205 (SURMOUNT-1), wk72"},
    {"study": "NCT04184622", "agent": "tirzepatide", "dose": 10.0, "gold_pct": -19.5,
     "source": "Jastreboff 2022 NEJM 387:205 (SURMOUNT-1), wk72"},
    {"study": "NCT04184622", "agent": "tirzepatide", "dose": 15.0, "gold_pct": -20.9,
     "source": "Jastreboff 2022 NEJM 387:205 (SURMOUNT-1), wk72"},
    {"study": "NCT04184622", "agent": "placebo", "dose": 0.0, "gold_pct": -3.1,
     "source": "Jastreboff 2022 NEJM 387:205 (SURMOUNT-1), wk72"},
]


def wilson_ci(k, n, z=1.959963984540054):
    """Wilson score 95% CI for a binomial proportion (registry-ipd discipline:
    never a bare point estimate for a rate)."""
    if n == 0:
        return (0.0, 0.0, 1.0)
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = (z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom
    return (round(p, 4), round(max(0.0, centre - half), 4), round(min(1.0, centre + half), 4))


def _match(extracted_arms, g, dose_tol=0.0):
    """Find the extracted arm matching a gold (study, agent, dose) key."""
    for a in extracted_arms:
        if (a.get("study_id") == g["study"] and a.get("agent") == g["agent"]
                and a.get("dose_mg") is not None
                and abs(a["dose_mg"] - g["dose"]) <= dose_tol):
            return a
    return None


def validate(extract_fn, gold=GOLD, snippets=None, within_pp=1.0):
    """Compare extractor output to the gold set.

    snippets: dict {study_id: text}. If None, the caller hasn't supplied source
    text yet -> coverage is 0 and the harness reports HONESTLY that it has not run
    (never invents agreement). within_pp: tolerance in percentage points.
    """
    snippets = snippets or {}
    rows, found, within = [], 0, 0
    for g in gold:
        arms = extract_fn(snippets.get(g["study"], ""), study_id=g["study"]) if snippets.get(g["study"]) else []
        a = _match(arms, g)
        if a is None:
            rows.append({**g, "extracted_pct": None, "abs_err": None,
                         "within": False, "status": "NOT_FOUND"})
            continue
        found += 1
        err = abs(a["response_pct"] - g["gold_pct"])
        ok = err <= within_pp
        within += int(ok)
        rows.append({**g, "extracted_pct": a["response_pct"], "abs_err": round(err, 2),
                     "within": ok, "status": "OK" if ok else "OUT_OF_TOL"})
    n = len(gold)
    cov = wilson_ci(found, n)
    acc = wilson_ci(within, found) if found else (0.0, 0.0, 1.0)
    # tiered verdict — never a single number
    if found == 0:
        tier = "NOT RUN (no source text supplied — coverage 0; harness honest-fails)"
    elif within == found and found == n:
        tier = "A: all gold arms found and within tolerance (illustration only)"
    elif acc[0] >= 0.9:
        tier = "B: high agreement on found arms; some arms missed"
    else:
        tier = "C: agreement below bar — do NOT trust extraction for these arms"
    return {
        "n_gold": n, "n_found": found, "n_within_tol": within,
        "coverage": {"p": cov[0], "ci95": [cov[1], cov[2]]},
        "within_tol_rate": {"p": acc[0], "ci95": [acc[1], acc[2]], "tol_pp": within_pp},
        "tier": tier,
        "honesty": ("Hand-verified illustration on 6 source-cited arms; NOT an "
                    "automated portfolio result and does NOT generalise. Targets "
                    "(coverage>=95%, within-1pp>=98%) are the ship bar, not yet met "
                    "until run on real extracted text from >=40 trials."),
        "rows": rows,
    }


def _selftest():
    # 1) honest-fail when no source text is supplied
    r0 = validate(extract_obesity_arms or (lambda t, study_id=None: []))
    assert r0["n_found"] == 0 and r0["tier"].startswith("NOT RUN"), r0["tier"]
    print("ok  honest-fail with no snippets:", r0["tier"])
    if extract_obesity_arms is None:
        print("!! rct-extractor-v2 not importable; skipping live extraction self-test")
        return
    # 2) feed faithful source text for two arms -> should match gold within tol
    snippets = {
        "NCT03548935": ("In STEP 1, the least-squares mean change in body weight "
                        "at week 68 was -14.9% (SE 0.4) with semaglutide 2.4 mg "
                        "(n=1306) versus -2.4% (SE 0.5) with placebo (n=655)."),
    }
    r = validate(extract_obesity_arms, snippets=snippets)
    assert r["n_found"] == 2, r
    assert r["n_within_tol"] == 2, r["rows"]
    print(f"ok  live extraction matched {r['n_found']}/2 gold arms; "
          f"coverage p={r['coverage']['p']} within-tol p={r['within_tol_rate']['p']}")
    print("    tier:", r["tier"])


if __name__ == "__main__":
    _selftest()
    print("\nself-test passed.")
