"""transportability "Download R script" / "Verify in R": the generated script carries the page's
CURRENT inputs, and running it in fresh R (metafor) reproduces every displayed number
(MATCH n/n) for the default example and a user dataset.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
RSCRIPT = os.environ.get("RSCRIPT") or shutil.which("Rscript") or "C:/Program Files/R/R-4.6.0/bin/Rscript.exe"
HAVE_R = Path(RSCRIPT).exists() or shutil.which(RSCRIPT) is not None
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

MIN_CHECKS = 14

GEN = r"""
globalThis.AlmMaCore = require('./shared/ma-core.js');
const T = require('./shared/transportability-v1.js'), R = require('./transportability/r-verify.js');
function mk(rows, target, log, name) { const studies = rows.map(([label, est, se, x]) => ({ label, est, se, x }));
  return { input: { studies, target, log, modname: name }, result: T.transport({ studies, target }) }; }
const out = {
  default: R.buildScript(mk([["STEP-1 semaglutide",-12.4,0.6,37.9],["STEP-3 semaglutide",-10.3,0.9,38.0],["SURMOUNT-1 tirzepatide",-17.8,0.7,38.0],
    ["SCALE liraglutide",-5.4,0.5,38.3],["PIONEER oral-sema",-4.2,0.6,32.9],["AWARD dulaglutide",-3.0,0.7,33.5],["Pilot low-BMI cohort",-2.1,1.0,30.5],
    ["Trial high-dose",-15.0,1.1,41.0]], 31, false, "baseline BMI")),
  pasted: R.buildScript(mk([["T1",-0.3011,0.08,28],["T2",-0.1985,0.07,33],["T3",-0.3567,0.10,25],["T4",-0.1054,0.09,40],["T5",-0.1508,0.06,36],
    ["T6",-0.0513,0.12,45]], 45.5, true, "LVEF %")),
};
console.log(JSON.stringify(out));
"""


def test_script_carries_the_current_inputs_not_the_example():
    s = _scripts()
    p = s["pasted"]
    assert "-0.3011" in p and "target <- 45.5" in p and "log_scale <- TRUE" in p
    assert "STEP-1" not in p and "-12.4" not in p and "target <- 31 " not in p
    for txt in s.values():
        assert "MATCH %d/%d" in txt and "MISMATCH" in txt and "MATCH 1" not in txt


def test_index_wires_the_r_controls():
    h = (ROOT / "transportability" / "index.html").read_text(encoding="utf-8")
    assert 'id="btn-rscript"' in h and 'id="btn-webr"' in h and 'id="r-out"' in h
    assert '<script src="../shared/webr-runner.js"></script>' in h and '<script src="r-verify.js"></script>' in h
    assert 'window.__lastTransportInput = { studies: rows.slice(), target: target, log: log, modname: modname }' in h


def _scripts():
    r = subprocess.run([NODE, "-e", GEN], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    assert r.returncode == 0, r.stdout + r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def _has_metafor():
    if not HAVE_R:
        return False
    r = subprocess.run([RSCRIPT, "--vanilla", "-e", "cat(requireNamespace('metafor', quietly=TRUE))"], capture_output=True, text=True, timeout=120)
    return r.stdout.strip().endswith("TRUE")


@pytest.mark.skipif(not HAVE_R, reason="Rscript not found (set RSCRIPT)")
@pytest.mark.parametrize("case", ["default", "pasted"])
def test_script_runs_in_fresh_r_and_matches(case):
    if not _has_metafor():
        pytest.skip("metafor not installed for this Rscript (set R_LIBS)")
    s = _scripts()[case]
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "check.R"
        f.write_text(s, encoding="utf-8")
        r = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stdout + r.stderr
    last = [l for l in r.stdout.splitlines() if l.startswith(("MATCH", "MISMATCH"))]
    assert last and re.fullmatch(r"MATCH (\d+)/\1", last[-1]), r.stdout
    assert int(last[-1].split()[1].split("/")[0]) >= MIN_CHECKS


@pytest.mark.skipif(not HAVE_R, reason="Rscript not found (set RSCRIPT)")
def test_back_transformed_checks_are_no_looser_than_the_displayed_3_decimals():
    # On the log scale the page shows exp(v).toFixed(3): a page value off by 6e-4 on that scale is a visible
    # error, so the check must flag it even when exp(v) > 500, where a relative 1e-6 tolerance would let it
    # through (review of PR #628). The analysis-scale shift here (9.7e-7) is inside the 1e-6 analysis check,
    # so only the back-transformed check can catch it.
    if not _has_metafor():
        pytest.skip("metafor not installed for this Rscript (set R_LIBS)")
    js = GEN.split("const out = {")[0] + r"""
const snap = mk([["a",5.2,0.3,10],["b",5.5,0.3,12],["c",5.9,0.35,14],["d",6.0,0.3,16],["e",6.3,0.4,18]], 15, true, "x");
const hi = snap.result.transported.ciHi;                       // exp(hi) = 619.2
snap.result = JSON.parse(JSON.stringify(snap.result));
snap.result.transported.ciHi = Math.log(Math.exp(hi) + 6e-4);  // 6e-4 off on the displayed scale
console.log(JSON.stringify({ s: R.buildScript(snap) }));
"""
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    assert r.returncode == 0, r.stdout + r.stderr
    s = json.loads(r.stdout.strip().splitlines()[-1])["s"]
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "check.R"
        f.write_text(s, encoding="utf-8")
        rr = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=300)
    assert rr.returncode == 0, rr.stdout + rr.stderr
    assert re.search(r"transported 95% CI upper .* ok", rr.stdout), rr.stdout          # analysis scale: within 1e-6
    assert re.search(r"exp\(transported CI upper\) .*MISMATCH", rr.stdout), rr.stdout
    assert rr.stdout.strip().splitlines()[-1].startswith("MISMATCH 1 of"), rr.stdout


# P58 F14 (lane lim8): on the log scale the page also shows exp() of the effect at the trials' mean modifier and
# its CI, but the script checked only their analysis-scale values, so a visible exp-scale error there was never
# flagged. Requirement: an error of 6e-4 on the displayed scale of that CI bound is a MISMATCH (same plant as above).
@pytest.mark.skipif(not HAVE_R, reason="Rscript not found (set RSCRIPT)")
def test_back_transformed_trial_mean_ci_is_checked():
    if not _has_metafor():
        pytest.skip("metafor not installed for this Rscript (set R_LIBS)")
    js = GEN.split("const out = {")[0] + r"""
const snap = mk([["a",5.5,0.3,10],["b",5.8,0.3,12],["c",6.2,0.35,14],["d",6.3,0.3,16],["e",6.6,0.4,18]], 15, true, "x");
const hi = snap.result.atTrialMean.ciHi;                     // exp(hi) = 652.1, so 6e-4 there is < 1e-6 on the log scale
snap.result = JSON.parse(JSON.stringify(snap.result));
snap.result.atTrialMean.ciHi = Math.log(Math.exp(hi) + 6e-4);  // 6e-4 off on the displayed scale
console.log(JSON.stringify({ s: R.buildScript(snap) }));
"""
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    assert r.returncode == 0, r.stdout + r.stderr
    s = json.loads(r.stdout.strip().splitlines()[-1])["s"]
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "check.R"
        f.write_text(s, encoding="utf-8")
        rr = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=300)
    assert rr.returncode == 0, rr.stdout + rr.stderr
    assert re.search(r"^  CI upper .* ok", rr.stdout, re.M), rr.stdout          # analysis scale: within 1e-6
    assert re.search(r"exp\(  CI upper\) .*MISMATCH", rr.stdout), rr.stdout
    assert rr.stdout.strip().splitlines()[-1].startswith("MISMATCH 1 of"), rr.stdout
