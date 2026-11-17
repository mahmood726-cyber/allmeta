"""The page's R check (umbrella-overlap/umbrella-r.js) must run in fresh R and agree with the page.

Requirement (user path): the downloadable / WebR script is generated from the page's CURRENT
input, recomputes every displayed number in base R (closed-form Pieper 2014 CCA, the P34 pack's
reference), and ends with an honest "MATCH n/n" -- and "MISMATCH" when the page is wrong.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
RSCRIPT = os.environ.get("RSCRIPT", "C:/Program Files/R/R-4.6.0/bin/Rscript.exe")
pytestmark = [
    pytest.mark.skipif(NODE is None, reason="node not installed"),
    pytest.mark.skipif(not Path(RSCRIPT).exists(), reason="Rscript not installed"),
]

EXAMPLE = ("# Review label: study ids (PMIDs etc.)\n"
           "Review A (2019): 101, 102, 103, 104, 105\n"
           "Review B (2021): 103, 104, 105, 106, 107\n"
           "Review C (2022): 104, 105, 106, 108\n"
           "Review D (2023): 105, 106, 107, 108, 109, 110")
PASTED = ("Smith 2019 SR: Jones 2001; Patel 2004; 12345678; NCT00000102; Lee 2010\n"
          "Ahmed 2020 SR: Patel 2004; Lee 2010; Kim  2012 ; 10.1000/xyz\u00e9\n"
          "Garcia 2021 SR: Jones 2001; Lee 2010; \"Quoted\" 2015; back\\slash 2016; Kim 2012\n"
          ": 12345678; Lee 2010")


def _script(text, tamper=None):
    js = ("const U=require('./shared/umbrella-overlap-v1.js'),R=require('./umbrella-overlap/umbrella-r.js');"
          "const t=JSON.parse(process.argv[1]);const r=U.overlap(U.parseReviews(t));"
          + (tamper or "") + "process.stdout.write(R.buildScript(t,r));")
    p = subprocess.run([NODE, "-e", js, json.dumps(text)], capture_output=True, text=True, encoding="utf-8",
                       timeout=30, cwd=str(ROOT))
    assert p.returncode == 0, p.stderr
    return p.stdout


def _run_r(script, tmp_path):
    f = tmp_path / "check.R"
    f.write_text(script, encoding="utf-8")
    env = dict(os.environ, R_ENVIRON_USER="C:/Users/mahmo/wt/empty.Renviron")
    p = subprocess.run([RSCRIPT, "--vanilla", str(f)], capture_output=True, text=True, encoding="utf-8",
                       timeout=120, env=env)
    assert p.returncode == 0, p.stdout + p.stderr
    return p.stdout


@pytest.mark.parametrize("text", [EXAMPLE, PASTED], ids=["example", "pasted"])
def test_script_matches_page_in_fresh_r(text, tmp_path):
    s = _script(text)
    out = _run_r(s, tmp_path)
    last = out.strip().splitlines()[-1]
    m = re.fullmatch(r"MATCH (\d+)/(\d+)", last)
    assert m and m.group(1) == m.group(2) and int(m.group(2)) >= 10, out


def test_script_carries_current_input():
    a, b = _script(EXAMPLE), _script(PASTED)
    assert "Review A (2019)" in a and "Review A (2019)" not in b
    assert "Smith 2019 SR" in b and "NCT00000102" in b


def test_inline_page_script_compiles():
    # A syntax error in the inline script silently disables every button on the page.
    html = (ROOT / "umbrella-overlap" / "index.html").read_text(encoding="utf-8")
    blocks = re.findall(r"<script>(.*?)</script>", html, flags=re.S)
    assert blocks
    p = subprocess.run([NODE, "-e", "for (const b of JSON.parse(process.argv[1])) new Function(b);", json.dumps(blocks)],
                       capture_output=True, text=True, timeout=30)
    assert p.returncode == 0, p.stderr


def test_wrong_page_value_is_reported_as_mismatch(tmp_path):
    # The check must be able to fail: a page CCA off by 1e-6 and a wrong matrix cell are caught.
    out = _run_r(_script(EXAMPLE, "r.cca+=1e-6;r.matrix[0][1]+=1;"), tmp_path)
    assert out.strip().splitlines()[-1].startswith("MISMATCH"), out
    assert out.count("DIFF") == 2, out
