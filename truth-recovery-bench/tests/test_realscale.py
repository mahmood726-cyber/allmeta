"""
test_realscale.py — regression tests for the SE-matched real-scale NPE retrain.

Covers: the model-specific diagnostics-path derivation (so a variant retrain
never clobbers the canonical model's committed diagnostics), the SE-based
model-selection helper, the frozen artifact's drop-in parity through sbi.py, and
the committed grid re-validation pass bar (>=0.90 coverage, <=0.07 type-I on all
55 cells, no regression vs canonical).
"""

import json
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import features as F
import train_sbi as T
import sbi

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REALSCALE_MODEL = os.path.join(HERE, "sbi_model_realscale.pkl")
VAL_CANON = os.path.join(HERE, "validation_canonical.json")
VAL_REAL = os.path.join(HERE, "validation_realscale.json")


# ---- diagnostics path derivation (no clobbering canonical) ----------------

def test_diag_path_for_canonical_and_realscale():
    assert os.path.basename(T.diag_path_for("sbi_model.pkl")) == "sbi_diagnostics.json"
    assert os.path.basename(T.diag_path_for("sbi_model_realscale.pkl")) \
        == "sbi_diagnostics_realscale.json"
    # a variant retrain must NOT resolve to the canonical diagnostics file
    assert T.diag_path_for("sbi_model_realscale.pkl") != T.diag_path_for("sbi_model.pkl")


# ---- SE-based model selection helper --------------------------------------

def test_recommended_model_path_in_support_is_canonical():
    p = sbi.recommended_model_path(0.4)   # within canonical [0.1, 0.7] support
    assert os.path.basename(p) == "sbi_model.pkl"


def test_recommended_model_path_handles_none_and_nan():
    for bad in (None, float("nan")):
        assert os.path.basename(sbi.recommended_model_path(bad)) == "sbi_model.pkl"


@pytest.mark.skipif(not os.path.exists(REALSCALE_MODEL),
                    reason="real-scale model not trained yet")
def test_recommended_model_path_ood_is_realscale():
    # Pairwise70 median study SE ~ 1.74 -> OOD for canonical -> real-scale.
    p = sbi.recommended_model_path(1.74)
    assert os.path.basename(p) == "sbi_model_realscale.pkl"


# ---- frozen artifact is a drop-in for sbi.py ------------------------------

@pytest.mark.skipif(not os.path.exists(REALSCALE_MODEL),
                    reason="real-scale model not trained yet")
def test_realscale_artifact_is_drop_in():
    import importlib
    os.environ["SBI_MODEL_PATH"] = REALSCALE_MODEL
    import sbi as _sbi
    importlib.reload(_sbi)
    try:
        art = _sbi._load()
        assert art is not None and _sbi._LOAD_ERR is None
        assert art["feature_names"] == F.FEATURE_NAMES
        assert art["meta"]["se_range"] == [0.1, 3.0]   # the widened prior
        import dgp
        rng = np.random.default_rng(3)
        for sc in dgp.SCENARIOS:
            y, v, _ = dgp.generate(0.3, 0.05, 20, sc, rng)
            r = _sbi.npe(y, v)
            assert r["ok"] and r["ci_lo"] <= r["mu"] <= r["ci_hi"]
    finally:
        os.environ.pop("SBI_MODEL_PATH", None)
        importlib.reload(_sbi)


# ---- committed grid re-validation: no regression --------------------------

@pytest.mark.skipif(not (os.path.exists(VAL_CANON) and os.path.exists(VAL_REAL)),
                    reason="validation artifacts not present")
def test_realscale_grid_no_regression():
    """The committed real-scale grid re-validation must clear the pass bar on the
    deployed Unified-frozen config AND not worsen the worst-case margins."""
    C = json.load(open(VAL_CANON))["configs"]["Unified-frozen"]
    R = json.load(open(VAL_REAL))["configs"]["Unified-frozen"]
    # pass bar: every cell >=0.90 coverage, <=0.07 type-I
    assert R["min_cov"] >= 0.90, R["min_cov"]
    assert R["worst_typeI"] <= 0.07, R["worst_typeI"]
    assert R["n_below90"] == 0 and R["n_typeI_over_0p07"] == 0
    assert R["feasible"]
    # no regression vs canonical worst-case margins
    assert R["min_cov"] >= C["min_cov"] - 1e-9, (R["min_cov"], C["min_cov"])
    assert R["worst_typeI"] <= C["worst_typeI"] + 1e-9
    # honest tradeoff: wider in-support intervals (the documented precision tax)
    assert R["mean_width"] > C["mean_width"]


@pytest.mark.skipif(not (os.path.exists(VAL_CANON) and os.path.exists(VAL_REAL)),
                    reason="validation artifacts not present")
def test_every_cell_passes_bar_realscale():
    R = json.load(open(VAL_REAL))["configs"]["Unified-frozen"]["percell"]
    for cid, c in R.items():
        assert c["coverage"] >= 0.90, (cid, c["coverage"])
        if c["is_null"]:
            assert c["reject0"] <= 0.07, (cid, c["reject0"])
