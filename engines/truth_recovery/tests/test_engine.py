"""
Integration tests for the packaged truth_recovery engine.

These prove the *packaging* is faithful: the public estimate() interface reproduces the
validated harness numbers (golden_unified.json, captured from the validated
unified.unified() on seed-locked DGP draws), is deterministic, and honours its contract.

Run:  python -m pytest engines/truth_recovery/tests/test_engine.py -v
"""

import json
import os

import numpy as np
import pytest

# Import the package whether or not it is pip-installed: add the parent of the package
# dir (engines/) to sys.path.
import sys
_PKG_PARENT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _PKG_PARENT not in sys.path:
    sys.path.insert(0, _PKG_PARENT)

import truth_recovery as TR  # noqa: E402

_GOLDEN = os.path.join(os.path.dirname(__file__), "golden_unified.json")
with open(_GOLDEN) as f:
    GOLDEN = json.load(f)

TOL = 1e-9


@pytest.mark.skipif(not TR.info()["model_present"],
                    reason="trained sbi_model.pkl not vendored")
@pytest.mark.parametrize("g", GOLDEN, ids=[f"{g['scenario']}_k{g['k']}" for g in GOLDEN])
def test_reproduces_validated_golden(g):
    """Packaged estimate() == validated unified.unified() to 1e-9 on every golden cell."""
    r = TR.estimate(g["y"], g["v"])
    assert abs(r["point"] - g["mu"]) < TOL, "point estimate drift vs validated harness"
    assert abs(r["ci_lo"] - g["ci_lo"]) < TOL, "lower honest-CI drift"
    assert abs(r["ci_hi"] - g["ci_hi"]) < TOL, "upper honest-CI drift"
    assert abs(r["tau2"] - g["tau2"]) < TOL
    assert r["ok"] == g["ok"]


@pytest.mark.skipif(not TR.info()["model_present"], reason="no model")
def test_deterministic():
    g = GOLDEN[0]
    a = TR.estimate(g["y"], g["v"])
    b = TR.estimate(g["y"], g["v"])
    assert a["point"] == b["point"] and a["ci_lo"] == b["ci_lo"] and a["ci_hi"] == b["ci_hi"]


@pytest.mark.skipif(not TR.info()["model_present"], reason="no model")
def test_se_input_matches_v_input():
    g = GOLDEN[3]
    se = np.sqrt(np.asarray(g["v"], float)).tolist()
    rv = TR.estimate(g["y"], v=g["v"])
    rs = TR.estimate(g["y"], se=se)
    assert abs(rv["point"] - rs["point"]) < 1e-12
    assert abs(rv["ci_lo"] - rs["ci_lo"]) < 1e-12


@pytest.mark.skipif(not TR.info()["model_present"], reason="no model")
def test_honest_interval_contains_point_and_is_ordered():
    for g in GOLDEN:
        r = TR.estimate(g["y"], g["v"])
        assert r["ci_lo"] <= r["point"] <= r["ci_hi"]
        # honest interval is at least as wide as the bare NPE component interval
        if r["npe"]["ok"]:
            assert (r["ci_hi"] - r["ci_lo"]) >= (r["npe"]["ci_hi"] - r["npe"]["ci_lo"]) - 1e-9


@pytest.mark.skipif(not TR.info()["model_present"], reason="no model")
def test_components_and_gate_flag_present():
    g = GOLDEN[6]
    r = TR.estimate(g["y"], g["v"])
    assert set(["mu", "ci_lo", "ci_hi", "ok"]).issubset(r["partial_id"])
    assert set(["mu", "ci_lo", "ci_hi", "ok"]).issubset(r["npe"])
    assert isinstance(r["gate_fired"], bool)
    assert r["config"]["mode"] == "gated" and r["config"]["npe_scale"] == 1.15


def test_input_validation():
    with pytest.raises(ValueError):
        TR.estimate([0.1], [0.04])                      # k<2
    with pytest.raises(ValueError):
        TR.estimate([0.1, 0.2], [0.04, -1.0])           # nonpositive variance
    with pytest.raises(ValueError):
        TR.estimate([0.1, 0.2], v=None, se=None)        # no v or se
    with pytest.raises(ValueError):
        TR.estimate([0.1, 0.2, 0.3], [0.04, 0.05])      # length mismatch


def test_info_is_cheap_and_complete():
    i = TR.info()
    assert i["label"] == "Unified truth-recovery (honest coverage)"
    assert i["config"]["coverage_target"] == 0.90
    assert "model_path" in i
