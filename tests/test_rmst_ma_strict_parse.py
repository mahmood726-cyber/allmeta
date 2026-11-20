"""rmst-ma input parser must reject malformed numbers (paper 37, RMST validation, probe P4).

parseFloat() reads the longest numeric prefix, so a row "Trial, 1.2abc, 0.4" was pooled as diff = 1.2 and "Trial, 1.2, 0.4e"
as SE = 0.4. A malformed field must exclude the row (as an empty or non-numeric field already does). The parse() function
is taken verbatim from rmst-ma/index.html and run under Node. Skipped if Node is not installed.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "rmst-ma" / "index.html"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _parse(text: str):
    html = PAGE.read_text(encoding="utf-8")
    m = re.search(r"\n(\s*)function parse\(text\) \{.*?\n\1\}\n", html, re.S)
    assert m, "parse() not found in rmst-ma/index.html"
    script = m.group(0) + f"\nconsole.log(JSON.stringify(parse({json.dumps(text)})));"
    res = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=30, check=False)
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("line", ["T1, 1.2abc, 0.4", "T1, 1.2, 0.4e", "T1, 1.2, 0.4.1", "T1, --1.2, 0.4", "T1, 1.2, 0x10", "T1, 1,2, 0.4x"])
def test_malformed_number_excludes_row(line):
    assert _parse(line + "\nT2, 0.5, 0.3") == [{"label": "T2", "diff": 0.5, "se": 0.3, "v": 0.09}]


def test_wellformed_numbers_accepted():
    rows = _parse("A, -1.5e-1, 2E1\nB, +3, .25\nC, 4., 1")
    assert [(r["label"], r["diff"], r["se"]) for r in rows] == [("A", -0.15, 20.0), ("B", 3.0, 0.25), ("C", 4.0, 1.0)]
