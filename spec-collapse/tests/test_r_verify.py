"""spec-collapse "Download R script" / "Verify in R": the generated script carries the page's
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

MIN_CHECKS = 190

GEN = r"""
globalThis.AlmMaCore = require('./shared/ma-core.js'); globalThis.AlmTrimFill = require('./shared/trimfill.js');
const SC = require('./shared/spec-collapse.js'), R = require('./spec-collapse/r-verify.js');
function mk(rows, scheme) { const studies = rows.map(([est, se, label]) => ({ est, se, label })); return { input: { studies, scheme }, result: SC.analyze(studies, { scheme }) }; }
const out = {
  default: R.buildScript(mk([[-0.25,0.22,"S1"],[-0.15,0.20,"S2"],[-0.40,0.30,"S3"],[0.00,0.18,"S4"],[-0.30,0.26,"S5"],[-0.05,0.17,"S6"],[-0.45,0.33,"S7"],[-0.12,0.19,"S8"]], "uniform")),
  pasted: R.buildScript(mk([[-0.31,0.14,"A"],[-0.12,0.10,"B"],[-0.45,0.21,"C"],[0.05,0.12,"D"],[-0.22,0.16,"E"],[-0.18,0.09,"F"],[-0.60,0.28,"G"],[-0.10,0.11,"H"],[-0.27,0.13,"I"],[-0.02,0.15,"J"]], "reml_only")),
};
console.log(JSON.stringify(out));
"""


def test_script_carries_the_current_inputs_not_the_example():
    s = _scripts()
    p = s["pasted"]
    assert "-0.31, -0.12, -0.45" in p and 'scheme <- "reml_only"' in p
    assert '"S1"' not in p and "-0.25, -0.15" not in p
    for txt in s.values():
        assert "MATCH %d/%d" in txt and "MISMATCH" in txt and "MATCH 1" not in txt


def test_index_wires_the_r_controls():
    h = (ROOT / "spec-collapse" / "index.html").read_text(encoding="utf-8")
    assert 'id="btn-rscript"' in h and 'id="btn-webr"' in h and 'id="r-out"' in h
    assert '<script src="../shared/webr-runner.js"></script>' in h and '<script src="r-verify.js"></script>' in h
    assert 'window.__lastSpec = { input: { studies: p.studies, scheme: scheme }, result: out }' in h


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
