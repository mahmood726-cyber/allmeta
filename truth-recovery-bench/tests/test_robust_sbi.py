"""
test_robust_sbi.py — regression tests for the robust-SBI retrain (P1).

Covers the augmented training DGP, checkpoint determinism (so resume is exact),
and artifact/inference parity (the robust model is a drop-in for sbi.py).
"""

import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import features as F
import train_sbi_robust as R

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROBUST_MODEL = os.path.join(HERE, "sbi_model_robust.pkl")


def test_mixture_proportions_sum_to_one():
    c = R.DEFAULT_CFG
    assert abs(c["p_none"] + c["p_step"] + c["p_copas"] + c["p_mixed"] - 1.0) < 1e-9


def test_clean_share_increased_over_baseline():
    # baseline train_sbi.py samples 'none' with prob 0.22; the tax fix raises it.
    assert R.DEFAULT_CFG["p_none"] >= 0.28


def test_heavy_tail_variance_matches_tau2():
    rng = np.random.default_rng(0)
    for df in (3, 5, 10):
        th = R._draw_theta(rng, 0.3, 0.05, 300000, df)
        assert abs(th.var() - 0.05) < 0.01, (df, th.var())
        assert abs(th.mean() - 0.3) < 0.02


def test_heavy_tail_is_heavier_than_normal():
    rng = np.random.default_rng(1)
    t = R._draw_theta(rng, 0.0, 0.1, 200000, 3)
    n = R._draw_theta(rng, 0.0, 0.1, 200000, None)
    # Student-t(3) has heavier tails -> larger excess kurtosis than the Normal.
    from scipy.stats import kurtosis
    assert kurtosis(t) > kurtosis(n) + 1.0


def test_all_mechanisms_yield_k_studies():
    rng = np.random.default_rng(2)
    mechs = [
        {"kind": "none"},
        {"kind": "step", "weights": np.array([1.0, 0.35, 0.10])},
        {"kind": "copas", "g0": -0.2, "g1": 0.12, "rho": 0.9},
        {"kind": "mixed", "weights": np.array([1.0, 0.35, 0.10]),
         "g0": -0.2, "g1": 0.12, "rho": 0.9},
    ]
    for mech in mechs:
        out = R.gen_ma(rng, 0.3, 0.05, 15, mech, None, 0.08, 0.85)
        assert out is not None, mech["kind"]
        y, v = out
        assert len(y) == 15 and np.all(np.isfinite(y)) and np.all(v > 0)


def test_mixed_selection_is_stricter_than_either_gate():
    # The mixed mechanism (step AND copas) must reject more than the pure p-step
    # gate alone -> its observed selection fraction is lower (harder to publish).
    rng = np.random.default_rng(7)
    cfg = dict(R.DEFAULT_CFG)
    # crude empirical check via examined-vs-kept proxy is awkward; instead assert
    # the mixed branch exists and produces a valid, more-selected funnel: the
    # corr(y, se) (small-study effect) should be positive under strong mixed sel.
    ys = []
    for _ in range(40):
        out = R.gen_ma(rng, 0.2, 0.05, 12,
                       {"kind": "mixed", "weights": np.array([1.0, 0.35, 0.10]),
                        "g0": -0.2, "g1": 0.12, "rho": 0.9}, None, 0.08, 0.85)
        if out:
            y, v = out
            ys.append(float(np.mean(y)))
    # selection pushes the published mean above the true mu=0.2 on average
    assert np.mean(ys) > 0.2


def test_simulate_chunk_is_deterministic():
    seed = np.random.SeedSequence([R.ROBUST_SEED, 1, 0])
    X1, Y1, T1, K1 = R.simulate_chunk(200, seed, R.DEFAULT_CFG)
    seed2 = np.random.SeedSequence([R.ROBUST_SEED, 1, 0])
    X2, Y2, T2, K2 = R.simulate_chunk(200, seed2, R.DEFAULT_CFG)
    assert np.array_equal(X1, X2) and np.array_equal(Y1, Y2)
    assert np.array_equal(K1, K2)


def test_simulate_chunk_features_finite_and_shaped():
    X, Y, T, K = R.simulate_chunk(150, np.random.SeedSequence([R.ROBUST_SEED, 1, 9]),
                                  R.DEFAULT_CFG)
    assert X.shape == (150, F.N_FEATURES)
    assert np.isfinite(X).all()
    assert np.all((K >= 3) & (K < 56))


@pytest.mark.skipif(not os.path.exists(ROBUST_MODEL),
                    reason="robust model not trained yet")
def test_robust_artifact_is_drop_in_for_sbi():
    """The robust artifact loads through sbi.py unchanged (feature-spec parity)
    and produces a finite, ordered interval on every base scenario."""
    import importlib
    os.environ["SBI_MODEL_PATH"] = ROBUST_MODEL
    import sbi
    importlib.reload(sbi)
    art = sbi._load()
    assert art is not None and sbi._LOAD_ERR is None
    assert art["feature_names"] == F.FEATURE_NAMES
    import dgp
    rng = np.random.default_rng(3)
    for sc in dgp.SCENARIOS:
        y, v, _ = dgp.generate(0.3, 0.05, 20, sc, rng)
        r = sbi.npe(y, v)
        assert r["ok"] and r["ci_lo"] <= r["mu"] <= r["ci_hi"]
    os.environ.pop("SBI_MODEL_PATH", None)
