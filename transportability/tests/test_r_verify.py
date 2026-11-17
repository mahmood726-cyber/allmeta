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
