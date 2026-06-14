"""
test_severity_gate.py — Contract + invariant tests for the P1.1 inference-time
severity-gated correction in sbi.py.

The gate is a POINT-ONLY transform of the committed artifact. Its defining
invariant — the one that makes it safe — is that it leaves the conformal
INTERVAL (and tau2, se) byte-identical to the ungated NPE, so coverage / width /
type-I cannot regress. These tests pin that invariant, the gate shape, the
clean-data de-biasing direction, and the SBI_GATE=0 reproducibility switch.

Run: python -m pytest tests/test_severity_gate.py -q   (from truth-recovery-bench/)
"""

import importlib
import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import dgp
import methods as M
import train_sbi as T
import features as F

MODEL_PATH = os.path.join(ROOT, "sbi_model.pkl")
pytestmark = pytest.mark.skipif(not os.path.exists(MODEL_PATH),
                                reason="sbi_model.pkl not trained")


def _ma(scenario="none", k=15, seed=0, mu=0.3, tau2=0.05):
    rng = np.random.default_rng(seed)
    y, v, _ = dgp.generate(mu, tau2, k, scenario, rng)
    return y, v


def _fresh_sbi(env):
    """Reimport sbi with a given env so module-level gate config is re-read."""
    for k in ("SBI_GATE", "SBI_GATE_S0", "SBI_GATE_S1"):
        os.environ.pop(k, None)
    os.environ.update(env)
    import sbi
    importlib.reload(sbi)
    return sbi


def test_gate_shape_monotone_bounded():
    sbi = _fresh_sbi({})
    xs = np.linspace(-2, 12, 200)
    g = np.array([sbi.severity_gate(x, 2.0, 6.0) for x in xs])
    assert np.all((g >= 0.0) & (g <= 1.0))
    assert np.all(np.diff(g) >= -1e-12), "gate must be non-decreasing in severity"
    assert sbi.severity_gate(1.0, 2.0, 6.0) == 0.0       # below S0 -> fully DL
    assert sbi.severity_gate(7.0, 2.0, 6.0) == 1.0       # above S1 -> fully NPE
    assert 0.0 < sbi.severity_gate(4.0, 2.0, 6.0) < 1.0  # midpoint -> partial
    # degenerate band -> keep full NPE (never silently zero the estimator)
    assert sbi.severity_gate(0.0, 6.0, 2.0) == 1.0


def test_interval_identical_to_ungated():
    """THE core invariant: gating changes only the point; ci/tau2/se unchanged.

    Collect the full (scenario, k, seed) sweep once with the gate ON, once OFF
    (two artifact loads total), then compare — never reload inside the loop.
    """
    cases = [(sc, k, s)
             for sc in dgp.SCENARIOS + dgp.STRESS_SCENARIOS
             for k in (5, 15, 50)
             for s in range(15)]
    on = _fresh_sbi({"SBI_GATE": "1"})
    res_on = [on.npe(*_ma(sc, k=k, seed=s, mu=0.3)) for sc, k, s in cases]
    off = _fresh_sbi({"SBI_GATE": "0"})
    res_off = [off.npe(*_ma(sc, k=k, seed=s, mu=0.3)) for sc, k, s in cases]
    for (sc, k, s), ron, roff in zip(cases, res_on, res_off):
        tag = f"{sc} k={k} seed={s}"
        assert ron["ci_lo"] == roff["ci_lo"], tag
        assert ron["ci_hi"] == roff["ci_hi"], tag
        assert ron["tau2"] == roff["tau2"], tag
        assert ron["se"] == roff["se"], tag
        assert ron["ci_lo"] <= ron["mu"] <= ron["ci_hi"], tag


def test_gate_off_reproduces_ungated_point_exactly():
    off = _fresh_sbi({"SBI_GATE": "0"})
    # Recompute the raw conditional median straight from the artifact.
    import pickle
    art = pickle.load(open(MODEL_PATH, "rb"))
    for sc in dgp.SCENARIOS:
        y, v = _ma(sc, k=15, seed=7)
        x = F.featurize(y, v).reshape(1, -1)
        P = T.predict_grid(art["models"], art["q_grid"], x)[0]
        d = T.conformal_d(art["conformal"], x[0])
        lo = float(P[art["conformal"]["lo_idx"]] - d)
        hi = float(P[art["conformal"]["hi_idx"]] + d)
        raw = min(max(float(P[art["q_grid"].index(0.5)]), lo), hi)
        assert abs(off.npe(y, v)["mu"] - raw) < 1e-12


def test_clean_data_point_moves_toward_dl():
    """On clean (none) data the gate should pull the NPE point toward DL on
    average (cutting the documented clean-data tax). Measured over seeds."""
    # NB: sbi is a singleton module; importlib.reload mutates it in place, so we
    # must finish all gate-ON calls before reloading to gate-OFF (cannot hold two
    # live configs simultaneously).
    mu_true = 0.3
    data = [_ma("none", k=15, seed=1000 + s, mu=mu_true) for s in range(300)]
    on = _fresh_sbi({"SBI_GATE": "1"})
    bias_on = [on.npe(y, v)["mu"] - mu_true for y, v in data]
    off = _fresh_sbi({"SBI_GATE": "0"})
    bias_off = [off.npe(y, v)["mu"] - mu_true for y, v in data]
    dl_bias = [M.dersimonian_laird(y, v)["mu"] - mu_true for y, v in data]
    ab_on = abs(np.mean(bias_on)); ab_off = abs(np.mean(bias_off)); ab_dl = abs(np.mean(dl_bias))
    assert ab_on < ab_off, f"gate did not cut clean bias: on={ab_on:.4f} off={ab_off:.4f}"
    # the gated bias should land much closer to DL's (the unbiased reference)
    assert ab_on - ab_dl < (ab_off - ab_dl) * 0.6


def test_gate_preserves_determinism_and_permutation_invariance():
    on = _fresh_sbi({"SBI_GATE": "1"})
    y, v = _ma("copas_strong", k=15, seed=5)
    r1 = on.npe(y, v); r2 = on.npe(y, v)
    assert r1["mu"] == r2["mu"]
    perm = np.random.default_rng(0).permutation(len(y))
    r3 = on.npe(y[perm], v[perm])
    assert abs(r1["mu"] - r3["mu"]) < 1e-9
    assert abs(r1["ci_lo"] - r3["ci_lo"]) < 1e-9


def teardown_module(module):
    """Leave the process with the default (gate ON) config so other test modules
    that import sbi see production behaviour."""
    _fresh_sbi({})
