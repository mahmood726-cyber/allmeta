"""transported-nma "Download R script" / "Verify in R": the generated script carries the page's
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

MIN_CHECKS = 21

GEN = r"""
globalThis.AlmMaCore = require('./shared/ma-core.js'); globalThis.AlmMultiplicativeNMA = require('./shared/multiplicative-nma.js');
const TN = require('./shared/transported-nma-v1.js'), R = require('./transported-nma/r-verify.js');
function mk(con, cov, target, trts, higher) { const labels = [], idx = {};
  const rows = con.map(([s, a, b, y, se]) => { if (idx[s] == null) { idx[s] = labels.length; labels.push(s); } return { trtA: a, trtB: b, yi: y, sei: se, study: idx[s], _label: s }; });
  const names = cov[0].slice(1);
  const studies = labels.map((l) => { const row = cov.find((r) => r[0] === l), c = {}; names.forEach((n, j) => (c[n] = row[j + 1])); return { label: l, cov: c }; });
  const input = { studies, rows, treatments: trts, target, higherIsBetter: higher };
  return { input, result: TN.run(input) }; }
const out = {
  default: R.buildScript(mk([["S1","A","B",0.20,0.10],["S2","A","C",0.55,0.12],["S3","B","C",0.30,0.11],["S4","A","C",0.62,0.13],["S5","B","C",0.18,0.12],["S6","A","B",0.34,0.10]],
    [["study","age"],["S1",52],["S2",55],["S3",58],["S4",71],["S5",74],["S6",76]], { age: 72 }, ["B","A","C"], true)),
  pasted: R.buildScript(mk([["T1","Placebo","Drug1",0.40,0.12],["T2","Placebo","Drug2",0.30,0.10],["T3","Drug1","Drug2",-0.08,0.14],["T4","Placebo","Drug1",0.52,0.15],
    ["T5","Placebo","Drug2",0.25,0.11],["T6","Drug1","Drug2",-0.15,0.13],["T7","Placebo","Drug1",0.35,0.10],["T8","Placebo","Drug2",0.9,0.12]],
    [["study","age","female"],["T1",60,0.4],["T2",63,0.5],["T3",58,0.45],["T4",67,0.55],["T5",70,0.6],["T6",61,0.5],["T7",55,0.35],["T8",64,0.52]],
    { age: 63, female: 0.5 }, ["Placebo","Drug1","Drug2"], false)),
};
console.log(JSON.stringify(out));
"""


def test_script_carries_the_current_inputs_not_the_example():
    s = _scripts()
    p = s["pasted"]
    assert '"Drug2"' in p and '"female"' in p and "higher_is_better <- FALSE" in p and "0.9)" in p
    assert '"S1"' not in p and "0.62" not in p
    # tau^2 must not come from rma(method = "PM") on this no-intercept contrast design: metafor
    # mean-centres yi for its Q/PM, valid only with an intercept (QE 11.32 vs the true 1.91 on the example)
    assert 'intercept = FALSE, method = "PM"' not in p and "uniroot(function(t) Qgen(t, X, y, sei) - df" in p
    for txt in s.values():
        assert "MATCH %d/%d" in txt and "MISMATCH" in txt and "MATCH 1" not in txt


def test_index_wires_the_r_controls():
    h = (ROOT / "transported-nma" / "index.html").read_text(encoding="utf-8")
    assert 'id="btn-rscript"' in h and 'id="btn-webr"' in h and 'id="r-out"' in h
    assert '<script src="../shared/webr-runner.js"></script>' in h and '<script src="r-verify.js"></script>' in h
    assert 'window.__lastTNMAInput = { studies: pcov.studies, rows: pc.rows, treatments: trts, target: target, higherIsBetter: $("f-higher").checked }' in h


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


# Entropy balancing that cannot converge: with a constant or a collinear covariate the Hessian is exactly
# singular, the page stops at the uniform weights (converged=false) and still shows a full result, so the
# R script must reproduce that result, not abort in solve() before printing any check (review of PR #628).
GEN_SINGULAR = GEN.split("const out = {")[0] + r"""
const con = [["S1","A","B",0.20,0.10],["S2","A","C",0.55,0.12],["S3","B","C",0.30,0.11],["S4","A","C",0.62,0.13],["S5","B","C",0.18,0.12],["S6","A","B",0.34,0.10]];
const res = {
  constant: mk(con, [["study","age","sex"],["S1",52,0.5],["S2",55,0.5],["S3",58,0.5],["S4",71,0.5],["S5",74,0.5],["S6",76,0.5]], { age: 65, sex: 0.5 }, ["B","A","C"], true),
  collinear: mk(con, [["study","age","age2"],["S1",52,104],["S2",55,110],["S3",58,116],["S4",71,142],["S5",74,148],["S6",76,152]], { age: 65, age2: 130 }, ["B","A","C"], true),
};
const out = {};
for (const k in res) { if (!res[k].result.ok || res[k].result.transport.converged) throw new Error(k + ": expected a page result that did not converge"); out[k] = R.buildScript(res[k]); }
console.log(JSON.stringify(out));
"""


@pytest.mark.skipif(not HAVE_R, reason="Rscript not found (set RSCRIPT)")
@pytest.mark.parametrize("case", ["constant", "collinear"])
def test_singular_entropy_balancing_reproduces_the_page_instead_of_crashing(case):
    if not _has_metafor():
        pytest.skip("metafor not installed for this Rscript (set R_LIBS)")
    r = subprocess.run([NODE, "-e", GEN_SINGULAR], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    assert r.returncode == 0, r.stdout + r.stderr
    s = json.loads(r.stdout.strip().splitlines()[-1])[case]
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "check.R"
        f.write_text(s, encoding="utf-8")
        rr = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=300)
    assert rr.returncode == 0, rr.stdout + rr.stderr
    assert "entropy balancing converged: FALSE" in rr.stdout
    last = [l for l in rr.stdout.splitlines() if l.startswith(("MATCH", "MISMATCH"))]
    assert last and re.fullmatch(r"MATCH (\d+)/\1", last[-1]), rr.stdout
