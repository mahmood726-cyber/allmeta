"""Tests for shared/registry-pubbias-v1.js — registry-aware publication bias.

Runs in Node (reuses ma-core PM pool + egger). Pins the measure-vs-infer
disambiguation: spurious-asymmetry (Egger flags but observed ghosts barely
move the pool), measured-bias (ghosts shift the pool beyond published
precision), and inference-only (no ghosts supplied).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = ("require('./shared/ma-core.js');require('./shared/egger.js');"
           "const R=require('./shared/registry-pubbias-v1.js');")
PUB = ("[{label:'A',est:-12,se:0.3},{label:'B',est:-11.5,se:0.35},{label:'C',est:-13,se:0.4},"
       "{label:'D',est:-9,se:0.8},{label:'E',est:-8,se:0.9},{label:'F',est:-7.5,se:1.0}]")


def _run(body: str):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_spurious_asymmetry_when_ghost_contribution_is_negligible():
    o = _run(f"const r=R.assess({{published:{PUB},ghosts:[{{est:-10.5,se:0.7}}]}});"
             "console.log(JSON.stringify({cls:r.classification,shift:r.measuredShift,"
             "egAsym:r.eggerAsymmetry,meaningful:r.meaningfulShift}));")
    assert o["cls"] == "spurious-asymmetry"
    assert o["egAsym"] is True and o["meaningful"] is False
    assert abs(o["shift"]) < 0.5


def test_measured_bias_when_ghosts_move_the_pool():
    o = _run(f"const r=R.assess({{published:{PUB},ghosts:[{{est:-2,se:0.3}},{{est:-1,se:0.3}}]}});"
             "console.log(JSON.stringify({cls:r.classification,meaningful:r.meaningfulShift,"
             "pub:r.published.mu,complete:r.complete.mu}));")
    assert o["cls"] == "measured-bias" and o["meaningful"] is True
    assert o["complete"] > o["pub"]          # less weight loss when the ghosts are included


def test_inference_only_without_ghosts():
    o = _run(f"const r=R.assess({{published:{PUB}}});"
             "console.log(JSON.stringify({cls:r.classification,hasGhost:r.hasGhostData,eg:!!r.egger}));")
    assert o["cls"] == "inference-only" and o["hasGhost"] is False and o["eg"] is True


def test_pools_reuse_pm_engine_and_report_k():
    o = _run(f"const r=R.assess({{published:{PUB},ghosts:[{{est:-10,se:0.5}}]}});"
             "console.log(JSON.stringify({pk:r.published.k,ck:r.complete.k,t2:r.published.tau2>=0}));")
    assert o["pk"] == 6 and o["ck"] == 7 and o["t2"] is True


def test_fail_closed_with_too_few_published():
    o = _run("console.log(JSON.stringify({ok:R.assess({published:[{est:-1,se:0.5}]}).ok}));")
    assert o["ok"] is False
