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
# CCA = (9 - 8) / (8 * 2) = 0.0625 -> 6.25 %, an exact tie at the displayed 1 dp: the page (JS toFixed)
# shows 6.3 where R's sprintf would give 6.2. Plus labels/ids that try to close an R string and run code.
TIE = ('Rev "A"), cat("INJECTED\\n"), c("x: a"b, c\\d, e\n'
       "Rev B: f, g, h\n"
       "Rev C: i, j, a\"b")


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


@pytest.mark.parametrize("text", [EXAMPLE, PASTED, TIE], ids=["example", "pasted", "tie-and-hostile-labels"])
def test_script_matches_page_in_fresh_r(text, tmp_path):
    s = _script(text)
    out = _run_r(s, tmp_path)
    last = out.strip().splitlines()[-1]
    m = re.fullmatch(r"MATCH (\d+)/(\d+)", last)
    assert m and m.group(1) == m.group(2) and int(m.group(2)) >= 10, out
    # the hostile label is printed as data; an executed cat() would print INJECTED on a line of its own
    assert "INJECTED" not in [ln.strip() for ln in out.splitlines()], out


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


TOFIXED_JS = r"""
const R = require('./umbrella-overlap/umbrella-r.js');
const xs = [6.25, 0.5, 1.5, 2.5, -2.5, -6.25, 0.125, 2.0625, 99.5, 9.5, 0.0625, 1.005, 0.1, 33.33333333333333,
  21.21212121212121, -0.0001, 0, 1e-7, 123456.789, 0.9375, 7.75];
let s = 1;
for (let i = 0; i < 200; i++) { s = (s * 16807) % 2147483647; xs.push((s / 2147483647 - 0.3) * Math.pow(10, (i % 7) - 2)); }
const rows = [];
for (const x of xs) for (let d = 0; d <= 4; d++) rows.push(x.toPrecision(17) + ',' + d + ',' + x.toFixed(d));
process.stdout.write(JSON.stringify({ helper: R.R_JS_TO_FIXED, csv: 'x,d,js\n' + rows.join('\n') }));
"""


def test_r_rounds_like_the_page_tofixed(tmp_path):
    # The page displays (x).toFixed(d); R's sprintf rounds exact ties to even ((6.25).toFixed(1) = "6.3",
    # sprintf("%.1f", 6.25) = "6.2"). The script's js_to_fixed must reproduce toFixed on ties and non-ties.
    p = subprocess.run([NODE, "-e", TOFIXED_JS], capture_output=True, text=True, encoding="utf-8", timeout=30, cwd=str(ROOT))
    assert p.returncode == 0, p.stderr
    o = json.loads(p.stdout)
    (tmp_path / "rows.csv").write_text(o["csv"], encoding="utf-8")
    script = o["helper"] + "\n" + f"""
rows <- read.csv({json.dumps((tmp_path / "rows.csv").as_posix())}, colClasses = c("numeric", "integer", "character"))
bad <- 0
for (i in seq_len(nrow(rows))) {{
  r <- js_to_fixed(rows$x[i], rows$d[i])
  if (r != rows$js[i]) {{ bad <- bad + 1; cat("BAD", format(rows$x[i], digits = 17), rows$d[i], rows$js[i], r, "\\n") }}
}}
cat("checked", nrow(rows), "bad", bad, "\\n")
"""
    out = _run_r(script, tmp_path)
    m = re.search(r"checked (\d+) bad (\d+)", out)
    assert m and int(m.group(1)) >= 1000 and m.group(2) == "0", out
