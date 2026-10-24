"""AMENDMENT 2 self-tests on SYNTHETIC controls (__control_*), never real data.

  python -m pytest h2h/test_u5.py -q
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import core  # noqa: E402
from test_h2h import _make, _orders  # noqa: E402

HERE = Path(__file__).resolve().parent
REG4 = json.loads((HERE / "sets" / "comparator_configs.json").read_text())
REG5 = json.loads((HERE / "sets" / "comparator_configs_u5.json").read_text())
CFG = {"C": 0.11, "ratio": 9.8, "retrainEvery": 1}
SCR = {"tool": "screen", "config": "__control_cfg", "rank_core_sha256": "__control_sha", "cfg": CFG, "emb": {"model": "m"}}
U5 = {"tool": "asreview", "ai": "elas_u5", "environment": {"asreview": REG5["asreview"], "ai_config": REG5["elas_u5"]}}
U4 = {"tool": "asreview", "ai": "elas_u4", "environment": {"asreview": REG4["asreview"], "ai_config": REG4["elas_u4"]}}


def _setup(tmp_path, screen_good):
    data, keys = _make(tmp_path, n_reviews=8)
    core.write_priors(keys, tmp_path / "priors", data)
    _orders(data, keys, tmp_path / "screen", screen_good, SCR)
    _orders(data, keys, tmp_path / "u5", False, U5)
    _orders(data, keys, tmp_path / "u4", False, U4)
    (tmp_path / "prim.txt").write_text("\n".join(keys)); (tmp_path / "conf.txt").write_text("\n".join(keys[:5]))
    (tmp_path / "cl.json").write_text(json.dumps({"clusters": [[k] for k in keys]}))
    fz = tmp_path / "fz.json"
    fz.write_text(json.dumps({"config": "__control_cfg", "rank_core_sha256": "__control_sha", "cfg": CFG, "emb": {"model": "m"}}))
    cmd = [sys.executable, str(HERE / "analyze_u5.py"), "--screen", str(tmp_path / "screen"), "--u5", str(tmp_path / "u5"),
           "--u4", str(tmp_path / "u4"), "--screen-freeze-json", str(fz), "--confirm-set", str(tmp_path / "conf.txt"),
           "--primary-set", str(tmp_path / "prim.txt"), "--clusters", str(tmp_path / "cl.json"),
           "--priors", str(tmp_path / "priors"), "--data-dir", str(data), "--out", str(tmp_path / "a.json")]
    return keys, cmd, fz


@pytest.mark.parametrize("good", [True, False])
def test_u5_family_detects_planted_effect(tmp_path, good):
    keys, cmd, _ = _setup(tmp_path, good)
    p = subprocess.run(cmd, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    assert p.returncode == 0, p.stderr
    r = json.loads((tmp_path / "a.json").read_text())
    P = r["confirmatory_screen_vs_u5_test15"]
    assert P["k"] == 5 and r["descriptive_screen_vs_u5_u5_in_sample"]["k"] == 3
    if good:
        assert P["mean"] > 0.3 and P["H1_accepted"] and P["H2_accepted"]
    else:  # identical orders: every difference 0 -> within the margin, not superior
        assert abs(P["mean"]) < 1e-12 and P["H1_accepted"] and not P["H2_accepted"]


def test_u5_failure_is_scored_best_case_and_wrong_version_refused(tmp_path):
    keys, cmd, fz = _setup(tmp_path, False)
    f = tmp_path / "u5" / f"{keys[0]}.json"; d = json.loads(f.read_text())
    d["runs"]["101"] = {"failed": True, "attempts": 2}; f.write_text(json.dumps(d))
    assert subprocess.run(cmd, capture_output=True, stdin=subprocess.DEVNULL).returncode == 0
    r = json.loads((tmp_path / "a.json").read_text())
    assert r["confirmatory_screen_vs_u5_test15"]["mean"] <= 1e-12  # a u5 failure never helps Screen
    d["environment"]["asreview"] = "3.0.8"; f.write_text(json.dumps(d))  # a u5 file from the released version
    p = subprocess.run(cmd, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    assert p.returncode != 0 and "registered" in p.stderr
    d["environment"]["asreview"] = REG5["asreview"]; f.write_text(json.dumps(d))
    fz.write_text(json.dumps({"config": "__control_cfg", "rank_core_sha256": "__control_sha", "cfg": {**CFG, "C": 1}, "emb": {"model": "m"}}))
    p = subprocess.run(cmd, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    assert p.returncode != 0 and "FREEZE" in p.stderr


def test_u5_runner_guard_refuses_other_asreview_builds():
    import asreview
    if asreview.__version__ == REG5["asreview"]:
        pytest.skip("running inside the registered u5 environment")
    import run_asreview_u5
    with pytest.raises(SystemExit, match="registered"):
        run_asreview_u5.comparator_guard_u5()


def test_u5_driver_set_guard(tmp_path):
    dev = [x.strip() for x in (HERE / "sets" / "dev.txt").read_text().splitlines() if x.strip() and not x.startswith("#")][0]
    s = tmp_path / "s.txt"; s.write_text(dev + "\n")
    p = subprocess.run([sys.executable, str(HERE / "run_heldout_u5.py"), "--set", str(s), "--out", str(tmp_path / "o")],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL)
    assert p.returncode != 0 and "not registered held-out reviews" in p.stderr
