"""Tests for shared/living-rob-pool.js — time-varying RoB living-evidence pooling."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "living-rob-pool.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> object:
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


def test_latestRobAsOf_picks_most_recent_before_asof():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const history = [
          {{ date: "2022-01-01", rob: "low" }},
          {{ date: "2023-06-15", rob: "some" }},
          {{ date: "2024-08-01", rob: "high" }},
        ];
        console.log(JSON.stringify({{
          before: M._latestRobAsOf(history, "2022-06-01"),
          during: M._latestRobAsOf(history, "2023-12-31"),
          after: M._latestRobAsOf(history, "2025-01-01"),
          way_before: M._latestRobAsOf(history, "2020-01-01"),
        }}));
    """)
    assert out["before"]["rob"] == "low"
    assert out["during"]["rob"] == "some"
    assert out["after"]["rob"] == "high"
    assert out["way_before"] is None


def test_poolSnapshot_excludes_future_studies():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.3, vi: 0.01, published_date: "2020-01-01", rob_history: [{{ date: "2020-01-01", rob: "low" }}] }},
          {{ yi: -0.25, vi: 0.012, published_date: "2022-06-01", rob_history: [{{ date: "2022-06-01", rob: "low" }}] }},
          {{ yi: -0.5, vi: 0.015, published_date: "2024-09-01", rob_history: [{{ date: "2024-09-01", rob: "low" }}] }},
        ];
        const snap2021 = M._poolSnapshot(rows, "2021-06-30");
        const snap2023 = M._poolSnapshot(rows, "2023-06-30");
        const snap2025 = M._poolSnapshot(rows, "2025-06-30");
        console.log(JSON.stringify({{
          k_2021: snap2021.k_eligible,
          k_2023: snap2023.k_eligible,
          k_2025: snap2025.k_eligible,
          mu_2025: snap2025.mu,
        }}));
    """)
    assert out["k_2021"] == 1
    assert out["k_2023"] == 2
    assert out["k_2025"] == 3
    assert isinstance(out["mu_2025"], (int, float))


def test_poolSnapshot_downweights_high_rob_studies():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.30, vi: 0.01, published_date: "2020-01-01",
             rob_history: [{{ date: "2020-01-01", rob: "low" }}] }},
          {{ yi:  0.40, vi: 0.01, published_date: "2020-06-01",
             rob_history: [{{ date: "2020-06-01", rob: "high" }}] }},
          {{ yi: -0.32, vi: 0.01, published_date: "2020-09-01",
             rob_history: [{{ date: "2020-09-01", rob: "low" }}] }},
        ];
        const snap = M._poolSnapshot(rows, "2021-01-01");
        console.log(JSON.stringify({{ mu: snap.mu, k: snap.k }}));
    """)
    # With the outlier (+0.40, high-RoB) downweighted by 50%, μ̂ should
    # land much closer to the two low-RoB studies (≈ -0.31).
    assert out["mu"] < -0.1
    assert out["k"] == 3


def test_poolOverTime_emits_drift_series():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.30, vi: 0.01, published_date: "2021-01-01", rob_history: [{{ date: "2021-01-01", rob: "low" }}] }},
          {{ yi: -0.40, vi: 0.01, published_date: "2022-01-01", rob_history: [{{ date: "2022-01-01", rob: "low" }}] }},
          {{ yi: -0.60, vi: 0.01, published_date: "2023-01-01", rob_history: [{{ date: "2023-01-01", rob: "low" }}] }},
          {{ yi: -0.70, vi: 0.01, published_date: "2024-01-01", rob_history: [{{ date: "2024-01-01", rob: "low" }}] }},
        ];
        const series = M.poolOverTime(rows, ["2021-06-30", "2022-06-30", "2023-06-30", "2024-06-30"]);
        console.log(JSON.stringify(series.map(s => ({{ date: s.date, mu: s.mu, drift: s.drift_vs_prev, k: s.k }}))));
    """)
    # μ should monotonically decrease as more (lower) studies enter.
    mus = [s["mu"] for s in out]
    assert mus[0] != mus[-1]
    # Drifts after the first snapshot should be non-zero.
    drifts = [s["drift"] for s in out[1:]]
    assert any(abs(d) > 0.01 for d in drifts)


def test_defaultSnapshots_spans_min_to_max():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ published_date: "2021-01-01", rob_history: [{{ date: "2021-01-01", rob: "low" }}] }},
          {{ published_date: "2024-06-15", rob_history: [{{ date: "2024-06-15", rob: "some" }}] }},
        ];
        const snaps = M.defaultSnapshots(rows, 365);
        console.log(JSON.stringify({{ first: snaps[0], last: snaps[snaps.length - 1], n: snaps.length }}));
    """)
    assert out["first"].startswith("2021")
    assert out["last"].startswith("2024")
    assert out["n"] >= 3


def test_rob_history_update_changes_pool_at_later_snapshots():
    # A study published 2020 was rated "low" in 2020 but re-rated "high"
    # in 2024. Pool at 2023 uses "low"; pool at 2025 uses "high".
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ yi: -0.30, vi: 0.01, published_date: "2020-01-01",
             rob_history: [
               {{ date: "2020-01-01", rob: "low" }},
               {{ date: "2024-01-01", rob: "high" }},
             ]
          }},
          {{ yi: -0.10, vi: 0.01, published_date: "2020-06-01",
             rob_history: [{{ date: "2020-06-01", rob: "low" }}] }},
        ];
        const a = M._poolSnapshot(rows, "2023-06-30");   // study 1 = low
        const b = M._poolSnapshot(rows, "2025-06-30");   // study 1 = high (50% downweight)
        console.log(JSON.stringify({{
          mu_pre_re_rating: a.mu, mu_post_re_rating: b.mu,
          rob_a: a.detail[0].rob, rob_b: b.detail[0].rob,
        }}));
    """)
    assert out["rob_a"] == "low"
    assert out["rob_b"] == "high"
    # Pool shifts toward the lighter-weighted (-0.10) study after re-rating.
    assert out["mu_post_re_rating"] > out["mu_pre_re_rating"]
