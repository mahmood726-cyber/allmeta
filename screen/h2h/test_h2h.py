"""Self-tests for the h2h core and analysis, on SYNTHETIC controls (namespaced __control_*), never real data.

  python -m pytest h2h/test_h2h.py -q
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import core  # noqa: E402

HERE = Path(__file__).resolve().parent
REG = json.loads((HERE / "sets" / "comparator_configs.json").read_text())
SCR = {"tool": "screen", "config": "__control_cfg", "rank_core_sha256": "__control_sha", "emb": None}


def ASR(ai):
    return {"tool": "asreview", "ai": ai, "environment": {"asreview": REG["asreview"], "ai_config": REG[ai]}}


def _make(tmp, n_reviews=6, N=200, R=12):
    data = tmp / "data"; data.mkdir()
    keys = [f"__control_{i}" for i in range(n_reviews)]
    for k in keys:
        y = np.zeros(N, int); y[np.random.default_rng(len(k) + ord(k[-1])).choice(N, R, replace=False)] = 1
        pd.DataFrame({"openalex_id": [f"W{k}{i}" for i in range(N)], "title": "t", "abstract": "a",
                      "label_included": y}).to_csv(data / f"{k}.csv", index=False)
    return data, keys


def _orders(data, keys, out, good, meta):
    out.mkdir(parents=True)
    for k in keys:
        _, y, sha = core.load_review(k, data)
        runs = {}
        for s in core.SEEDS:
            pri = core.prior_records(k, y, s)
            rest = [i for i in range(len(y)) if i not in pri]
            rng = np.random.default_rng(s)
            rest = list(rng.permutation(rest))
            if good:  # relevant first
                rest = sorted(rest, key=lambda i: -y[i])
            full = pri + [int(i) for i in rest]
            last = max(j for j, i in enumerate(full) if y[i] == 1)
            runs[str(s)] = {"order": full[: last + 1]}  # both tools stop at the last relevant record
        (out / f"{k}.json").write_text(json.dumps({**meta, "review": k, "ids_sha256": sha,
                                                   "dataset_sha256": core.dataset_digest(k, data), "runs": runs}))


def test_metrics_basic():
    y = np.array([1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1])
    m = core.metrics_from_order(list(range(12)), y)
    assert m["N"] == 12 and m["R"] == 4 and m["n100"] == 12 and m["n95"] == 12
    assert abs(m["wss95"] - (0.95 - 1)) < 1e-12
    with pytest.raises(ValueError):
        core.metrics_from_order([0, 1, 2], y)


def test_priors_deterministic_and_2plus2():
    y = np.array([1] * 5 + [0] * 50)
    a = core.prior_records("x", y, 101); b = core.prior_records("x", y, 101)
    assert a == b and sum(y[a]) == 2 and len(a) == 4
    assert core.prior_records("x", y, 202) != a or core.prior_records("z", y, 101) != a


@pytest.mark.parametrize("good,expect_h1", [(True, True), (False, False)])
def test_analysis_detects_planted_effect(tmp_path, good, expect_h1):
    data, keys = _make(tmp_path)
    core.write_priors(keys, tmp_path / "priors", data)
    _orders(data, keys, tmp_path / "screen", good, SCR)
    _orders(data, keys, tmp_path / "u4", False, ASR("elas_u4"))
    _orders(data, keys, tmp_path / "u3", False, ASR("elas_u3"))
    (tmp_path / "set.txt").write_text("\n".join(keys))
    (tmp_path / "cl.json").write_text(json.dumps({"clusters": [keys[:2]] + [[k] for k in keys[2:]]}))
    out = tmp_path / "a.json"
    subprocess.run([sys.executable, str(HERE / "analyze.py"), "--screen", str(tmp_path / "screen"), "--u4", str(tmp_path / "u4"),
                    "--u3", str(tmp_path / "u3"), "--set", str(tmp_path / "set.txt"), "--clusters", str(tmp_path / "cl.json"),
                    "--data-dir", str(data), "--out", str(out),
                    "--screen-config", "__control_cfg", "--screen-rank-sha256", "__control_sha", "--priors", str(tmp_path / "priors")], check=True, capture_output=True, stdin=subprocess.DEVNULL)
    r = json.loads(out.read_text())
    assert r["n_clusters"] == 5 and r["n_reviews"] == 6
    P = r["primary_wss95_vs_u4"]
    if good:
        assert P["mean"] > 0.3 and P["H1_accepted"] and P["H2_accepted"]
    else:  # identical orders -> every difference is exactly 0: within the margin, not superior
        assert abs(P["mean"]) < 1e-12 and P["H1_accepted"] and not P["H2_accepted"]


def test_order_validation_rejects_bad_orders():
    y = np.array([0, 0, 1, 1])
    for bad in ([-1, 2, 3], [0, 0, 2, 3], [2, 3, 0], [2.0, 3]):
        with pytest.raises(ValueError):
            core.metrics_from_order(bad, y)


def test_failed_seed_scored_worst_and_mismatched_priors_refused(tmp_path):
    data, keys = _make(tmp_path, n_reviews=3)
    core.write_priors(keys, tmp_path / "priors", data)
    _orders(data, keys, tmp_path / "screen", False, SCR)
    _orders(data, keys, tmp_path / "u4", False, ASR("elas_u4"))
    _orders(data, keys, tmp_path / "u3", False, ASR("elas_u3"))
    f = tmp_path / "screen" / f"{keys[0]}.json"; d = json.loads(f.read_text())
    d["runs"]["101"] = {"failed": True, "attempts": 2}; f.write_text(json.dumps(d))
    (tmp_path / "set.txt").write_text("\n".join(keys)); (tmp_path / "cl.json").write_text(json.dumps({"clusters": [[k] for k in keys]}))
    base = [sys.executable, str(HERE / "analyze.py"), "--screen", str(tmp_path / "screen"), "--u4", str(tmp_path / "u4"),
            "--u3", str(tmp_path / "u3"), "--set", str(tmp_path / "set.txt"), "--clusters", str(tmp_path / "cl.json"),
            "--data-dir", str(data), "--screen-config", "__control_cfg", "--screen-rank-sha256", "__control_sha", "--priors", str(tmp_path / "priors"), "--out", str(tmp_path / "a.json")]
    subprocess.run(base, check=True, capture_output=True, stdin=subprocess.DEVNULL)
    r = json.loads((tmp_path / "a.json").read_text())
    assert r["failed_seeds"]["screen"] == {keys[0]: ["101"]}
    assert r["per_review"][keys[0]]["screen"]["seed101"]["wss95"] == -0.05
    assert r["confirmatory_valid"]  # 1 failed run of 30 = 96.7% success
    # a comparator run from a different ASReview version is refused
    h = tmp_path / "u3" / f"{keys[2]}.json"; e3 = json.loads(h.read_text()); e3["environment"]["asreview"] = "2.2"; h.write_text(json.dumps(e3))
    assert subprocess.run(base, capture_output=True, stdin=subprocess.DEVNULL).returncode != 0
    e3["environment"]["asreview"] = REG["asreview"]; h.write_text(json.dumps(e3))
    g = tmp_path / "u4" / f"{keys[1]}.json"; e = json.loads(g.read_text())
    e["runs"]["202"]["order"] = e["runs"]["202"]["order"][1:] + e["runs"]["202"]["order"][:1]; g.write_text(json.dumps(e))
    assert subprocess.run(base, capture_output=True, stdin=subprocess.DEVNULL).returncode != 0
    (tmp_path / "cl.json").write_text(json.dumps({"clusters": [keys[:2]]}))  # not a partition
    assert subprocess.run(base, capture_output=True, stdin=subprocess.DEVNULL).returncode != 0


def test_universal_failure_withholds_confirmatory_claim(tmp_path):
    data, keys = _make(tmp_path, n_reviews=3)
    core.write_priors(keys, tmp_path / "priors", data)
    for name, meta in (("screen", SCR), ("u4", ASR("elas_u4")), ("u3", ASR("elas_u3"))):
        _orders(data, keys, tmp_path / name, False, meta)
        for k in keys:
            f = tmp_path / name / f"{k}.json"; d = json.loads(f.read_text())
            d["runs"] = {s: {"failed": True, "attempts": 2} for s in d["runs"]}; f.write_text(json.dumps(d))
    (tmp_path / "set.txt").write_text("\n".join(keys)); (tmp_path / "cl.json").write_text(json.dumps({"clusters": [[k] for k in keys]}))
    subprocess.run([sys.executable, str(HERE / "analyze.py"), "--screen", str(tmp_path / "screen"), "--u4", str(tmp_path / "u4"),
                    "--u3", str(tmp_path / "u3"), "--set", str(tmp_path / "set.txt"), "--clusters", str(tmp_path / "cl.json"),
                    "--data-dir", str(data), "--screen-config", "__control_cfg", "--screen-rank-sha256", "__control_sha",
                    "--priors", str(tmp_path / "priors"), "--out", str(tmp_path / "a.json")], check=True, capture_output=True, stdin=subprocess.DEVNULL)
    r = json.loads((tmp_path / "a.json").read_text())
    assert not r["confirmatory_valid"] and r["primary_wss95_vs_u4"]["H1_accepted"] is None


@pytest.mark.parametrize("tool,extra", [("asreview", ["--ai", "elas_u4"]), ("screen", ["--config", "u4"])])
def test_driver_set_guard_is_symmetric(tmp_path, tool, extra):
    """Held-out mode refuses a DEV review for BOTH tools, and --dev-smoke refuses a held-out review (fails before any run)."""
    read = lambda f: [x.strip() for x in (HERE / "sets" / f).read_text().splitlines() if x.strip() and not x.startswith("#")]
    dev_key, held_key = read("dev.txt")[0], read("primary.txt")[0]
    for key, mode, msg in ((dev_key, [], "not registered held-out reviews"), (held_key, ["--dev-smoke"], "not DEV reviews")):
        s = tmp_path / f"{key}.txt"; s.write_text(key + "\n")
        p = subprocess.run([sys.executable, str(HERE / "run_heldout.py"), "--tool", tool, *extra, "--set", str(s),
                            "--out", str(tmp_path / "out"), *mode], capture_output=True, text=True, stdin=subprocess.DEVNULL)
        assert p.returncode != 0 and msg in p.stderr, (key, mode, p.stderr)
        assert not (tmp_path / "out" / f"{key}.json").exists()
