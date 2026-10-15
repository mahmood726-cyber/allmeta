"""Synthetic regression probes of the actual page script, not a formula mirror."""
import json
import os
from pathlib import Path
import subprocess

import pytest

HERE = Path(__file__).parent


@pytest.fixture(scope="module")
def probe():
    page = Path(os.environ.get("LIMIT_MA_PAGE", HERE.parent / "index.html")).resolve()
    proc = subprocess.run(["node", str(HERE / "page-probe.cjs"), str(page)],
                          capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(proc.stdout)


def test_zero_effect_preserves_fit_and_explicit_null(probe):
    state = probe["zero"]
    r = state["result"]
    assert r is not None, state["error"]
    assert r["limit_est"] == 0
    assert r["limit_se"] == pytest.approx(0.20380986614602722, abs=1e-12)
    assert r["G_squared"] is None
    assert state["gIsNull"]
    assert r["Q_small"] == 0
    assert r["Q_resid"] == 0
    assert state["table"].count("<tr") == 3
    assert "<circle" in state["plot"]
    assert "NaN" not in state["plot"] + state["table"]
    assert "undefined" in state["diagnostics"]
    assert "total sum of squares is zero" in state["diagnostics"]
    assert "null" in probe["html"] and "G_squared" in probe["html"]


@pytest.mark.parametrize("index", [0, 1], ids=["two-studies", "equal-SEs"])
def test_refusal_and_full_recovery(probe, index):
    states = probe["recovery"][index]
    assert states["before"]["result"] is not None
    refused = states["refused"]
    assert refused["result"] is None
    assert refused["table"] == refused["plot"] == refused["diagnostics"] == ""
    assert refused["error"]
    assert states["after"] == states["before"]
    assert states["zeroAfter"]["result"] is not None


def test_log_controls_have_visible_description():
    page = Path(os.environ.get("LIMIT_MA_PAGE", HERE.parent / "index.html")).resolve()
    proc = subprocess.run(
        ["node", str(HERE / "log-controls-browser.cjs"), str(page)],
        capture_output=True, text=True, encoding="utf-8", timeout=60,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr


def test_nonfinite_essential_fit_is_refused(probe):
    state = probe["overflow"]
    assert state["result"] is None
    assert state["table"] == state["plot"] == ""
    assert state["error"]


def test_effective_plot_ranges_in_chrome():
    page = Path(os.environ.get("LIMIT_MA_PAGE", HERE.parent / "index.html")).resolve()
    proc = subprocess.run(
        ["node", str(HERE / "range-browser.cjs"), str(page)],
        capture_output=True, text=True, encoding="utf-8", timeout=90,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr


def test_extreme_finite_plot_bounds_in_chrome():
    page = Path(os.environ.get("LIMIT_MA_PAGE", HERE.parent / "index.html")).resolve()
    proc = subprocess.run(
        ["node", str(HERE / "finite-plot-browser.cjs"), str(page)],
        capture_output=True, text=True, encoding="utf-8", timeout=180,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
