"""benefit-risk "Download R script" / "Verify in R": the generated script carries the
page's CURRENT inputs, and running it in fresh R reproduces every displayed number
(MATCH n/n) for the default example and a user dataset.

The R run needs Rscript (RSCRIPT env var, else R 4.6.0's default path); base R only.
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

GEN = r"""
const BR = require('./shared/benefit-risk-v1.js'), R = require('./benefit-risk/r-verify.js');
function mk(crit, perf, iters, seed) {
  const treatments = [], m = {};
  for (const [t, c, mean, se] of perf) { if (!m[t]) { m[t] = { id: t, name: t, perf: {} }; treatments.push(m[t]); }
    m[t].perf[c] = se > 0 ? { mean, se } : { mean }; }
  const input = { criteria: crit.map(([id, name, type, weight]) => ({ id, name, type, weight })), treatments, iterations: iters, seed };
  return { input, result: BR.analyze(input) };
}
const cases = {
  default: mk([["wl","Weight loss (pp vs placebo)","benefit",0.6],["na","Nausea incidence (%)","harm",0.4]],
    [["Tirzepatide","wl",17.8,0.7],["Tirzepatide","na",24,2],["Semaglutide","wl",12.4,0.6],["Semaglutide","na",20,2],
     ["Liraglutide","wl",5.4,0.5],["Liraglutide","na",18,2]], 10000, 12345),
  pasted: mk([["hb","HbA1c reduction (%)","benefit",0.5],["hy","Hypoglycaemia (%)","harm",0.3],["wg","Weight gain (kg)","harm",0.2]],
    [["Insulin glargine","hb",1.4,0.1],["Insulin glargine","hy",12,1.5],["Insulin glargine","wg",2.1,0.3],
     ["Sitagliptin","hb",0.7,0.08],["Sitagliptin","hy",3,0.8],["Sitagliptin","wg",0.1,0.2],
     ["Gliclazide","hb",1.0,0.09],["Gliclazide","hy",9.25],["Gliclazide","wg",1.6,0.3]], 4000, 777),
};
const out = {};
for (const k in cases) out[k] = R.buildScript(cases[k]);
console.log(JSON.stringify(out));
"""


def _scripts():
    r = subprocess.run([NODE, "-e", GEN], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    assert r.returncode == 0, r.stdout + r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_script_carries_the_current_inputs_not_the_example():
    s = _scripts()
    p = s["pasted"]
    # the user's dataset, iterations and seed are in the script; the example's are not
    assert '"Insulin glargine"' in p and "9.25" in p and "iters <- 4000; seed <- 777" in p
    assert "Tirzepatide" not in p and "17.8" not in p and "12345" not in p
    assert '"Tirzepatide"' in s["default"] and "iters <- 10000; seed <- 12345" in s["default"]
    # the verdict is computed, never hard-coded
    for txt in s.values():
        assert "MATCH %d/%d" in txt and "MISMATCH" in txt and "MATCH 1" not in txt


def test_index_wires_the_r_controls():
    h = (ROOT / "benefit-risk" / "index.html").read_text(encoding="utf-8")
    assert 'id="btn-rscript"' in h and 'id="btn-webr"' in h and 'id="r-out"' in h
    assert '<script src="../shared/webr-runner.js"></script>' in h and '<script src="r-verify.js"></script>' in h
    assert "window.__lastBRInput = { criteria: criteria, treatments: treatments, iterations: iters, seed: seed }" in h


@pytest.mark.skipif(not HAVE_R, reason="Rscript not found (set RSCRIPT)")
@pytest.mark.parametrize("case", ["default", "pasted"])
def test_script_runs_in_fresh_r_and_matches(case):
    s = _scripts()[case]
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "check.R"
        f.write_text(s, encoding="utf-8")
        r = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stdout + r.stderr
    last = [l for l in r.stdout.splitlines() if l.startswith(("MATCH", "MISMATCH"))]
    assert last and re.fullmatch(r"MATCH (\d+)/\1", last[-1]), r.stdout
    assert int(last[-1].split()[1].split("/")[0]) >= 10


@pytest.mark.skipif(not HAVE_R, reason="Rscript not found (set RSCRIPT)")
def test_replayed_generator_stays_exact_beyond_2_pow_53_over_the_weyl_constant():
    # The script's vectorised mulberry32 must equal the page's generator for every draw a run can need.
    # (1:n) * 0x6D2B79F5 passes 2^53 at n = 4,917,759 (e.g. 100,000 iterations x 25 uncertain cells), where a
    # plain double product loses low bits and the replay silently diverges (review of PR #628).
    js = ("const r = require('./shared/benefit-risk-v1.js')._mulberry32(12345), want = [4917000, 4917759, 4999999, 5200000], o = {};"
          "for (let i = 1; i <= 5200000; i++) { const v = r(); if (want.includes(i)) o[i] = v; } console.log(JSON.stringify(o));")
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=120, cwd=str(ROOT))
    assert r.returncode == 0, r.stderr
    page = json.loads(r.stdout)
    src = _scripts()["default"].splitlines()
    a = next(i for i, l in enumerate(src) if l.startswith("M32 <- "))
    b = next(i for i, l in enumerate(src) if l.startswith("unc <- "))
    rcode = "\n".join(src[a:b]) + '\nu <- mulberry32(12345, 5200000); cat(sprintf("%.17g", u[c(4917000, 4917759, 4999999, 5200000)]), sep = "\\n")\n'
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "gen.R"
        f.write_text(rcode, encoding="utf-8")
        rr = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=300)
    assert rr.returncode == 0, rr.stdout + rr.stderr
    got = [float(x) for x in rr.stdout.split()]
    assert got == [page[k] for k in ("4917000", "4917759", "4999999", "5200000")]


@pytest.mark.skipif(not HAVE_R, reason="Rscript not found (set RSCRIPT)")
def test_labels_outside_the_bmp_round_trip_into_r():
    # rstr() escapes a non-BMP character as a UTF-16 surrogate pair ("\ud83d\udc8a"); R's parser (desktop 4.6.0
    # and WebR's 4.5.1) joins the pair into one code point, so the label survives and the script still runs.
    js = GEN.split("const out = {")[0] + r"""
const snap = mk([["wl","Weight loss","benefit",0.6],["na","Nausea","harm",0.4]],
  [["Drug \u{1F48A}","wl",17.8,0.7],["Drug \u{1F48A}","na",24,2],["Other","wl",12.4,0.6],["Other","na",20,2]], 2000, 1);
console.log(JSON.stringify({ s: R.buildScript(snap) }));
"""
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    assert r.returncode == 0, r.stdout + r.stderr
    s = json.loads(r.stdout.strip().splitlines()[-1])["s"]
    assert r'"Drug \ud83d\udc8a"' in s
    s += 'cat("LABEL", utf8ToInt(trt[1]), "\\n")\n'
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "check.R"
        f.write_text(s, encoding="utf-8")
        rr = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, timeout=300)
    assert rr.returncode == 0, rr.stdout + rr.stderr
    assert re.search(r"^MATCH (\d+)/\1$", rr.stdout, re.M), rr.stdout
    assert "LABEL 68 114 117 103 32 128138" in rr.stdout
