"""Engine + benchmark reproducibility tests.

These pin the HONEST headline claim: the deterministic engine must keep beating
RobotReviewer's published Macro-F1 on the committed RoBBR RobotReviewer subset.
Truth-first: if the engine regresses below RobotReviewer, this test fails.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent  # F:/allmeta
SPEC = ROOT / "rob" / "tests" / "rob_core_spec.mjs"
BENCH = ROOT / "benchmark" / "run_rob_benchmark.mjs"
RESULTS = ROOT / "benchmark" / "data" / "rob" / "rob-benchmark-results.json"
RR_BASE = ROOT / "benchmark" / "data" / "rob" / "robotreviewer-baseline.json"


def _node(*args):
    return subprocess.run(["node", *map(str, args)], cwd=str(ROOT),
                          capture_output=True, text=True, timeout=180)


def test_engine_unit_spec_passes():
    r = _node(SPEC)
    assert r.returncode == 0, "rob_core_spec.mjs failed:\n" + r.stdout + r.stderr


def test_benchmark_reproduces_and_beats_robotreviewer(tmp_path):
    """Re-run the benchmark from the committed (gzipped) RR subset and assert
    allmeta's measured avg Macro-F1 still exceeds RobotReviewer's published 56.7."""
    out = tmp_path / "res.json"
    r = _node(BENCH, "--json", out)
    assert r.returncode == 0, r.stdout + r.stderr
    res = json.loads(out.read_text(encoding="utf-8"))
    h2h = res["head_to_head"]
    rr = json.loads(RR_BASE.read_text(encoding="utf-8"))["models"]["RobotReviewer"]["avg"]
    assert h2h["robotreviewer_avg"] == rr
    assert h2h["avgMacroF1"] > rr, (
        f"REGRESSION: allmeta {h2h['avgMacroF1']} no longer beats RobotReviewer {rr}")
    assert h2h["verdict"] == "BEATS RobotReviewer"


def test_committed_results_match_live_run(tmp_path):
    """The committed results JSON must equal a fresh run (no stale numbers)."""
    out = tmp_path / "live.json"
    _node(BENCH, "--json", out)
    live = json.loads(out.read_text(encoding="utf-8"))
    committed = json.loads(RESULTS.read_text(encoding="utf-8"))
    assert live["head_to_head"]["avgMacroF1"] == committed["head_to_head"]["avgMacroF1"]
    assert live["head_to_head"]["perDomain"].keys() == committed["head_to_head"]["perDomain"].keys()
