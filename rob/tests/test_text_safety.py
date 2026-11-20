"""/rob/: labels survive HTML attributes and CSV export (P39 limitation sweep L29).

Requirements: esc() must make any text safe inside the page's single-quoted attributes (an
apostrophe in "O'Brien 2019" ended title='...' early, so the tooltip read "O"); a CSV cell
containing a bare carriage return must be quoted. Formula protection stays =, +, @, tab, CR
(a leading minus is NOT prefixed: negative numbers must stay numbers).
Functions are taken verbatim from rob/index.html and run under Node.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

INDEX = Path(__file__).resolve().parents[1] / "index.html"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _fn(name):
    h = INDEX.read_text(encoding="utf-8")
    m = re.search(r"\n(\s*)function " + name + r"\(.*?\n", h)
    assert m, name + " not found"
    line = m.group(0)
    if line.rstrip().endswith("}"):
        return line
    m = re.search(r"\n(\s*)function " + name + r"\(.*?\n\1\}\n", h, re.S)
    return m.group(0)


def _run(expr, *fns):
    src = "".join(_fn(f) for f in fns) + "\nconsole.log(JSON.stringify(" + expr + "));"
    r = subprocess.run([NODE, "-e", src], capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_esc_apostrophe_in_single_quoted_attribute():
    out = _run("esc(\"O'Brien <2019> & \\\"x\\\"\")", "esc")
    assert "'" not in out
    assert out == "O&#39;Brien &lt;2019&gt; &amp; &quot;x&quot;"


def test_csv_cell_quotes_bare_cr_and_protects_formulas():
    out = _run("[csvCell('a\\rb'), csvCell('=1+1'), csvCell('-2.5'), csvCell('x,y'), csvCell(null)]", "csvCell")
    assert out == ['"a\rb"', "'=1+1", "-2.5", '"x,y"', ""]
