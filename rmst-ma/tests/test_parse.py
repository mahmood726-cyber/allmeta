"""rmst-ma input parsing (paper 37, limitation sweep L01-L04).

Requirement: a study row is used only when its label, RMST difference and SE are what the user typed.
A field that is not a complete decimal number ("1.2abc", "0.4e", "0x10") must never be read as a number
(parseFloat reads a numeric prefix). parse() is taken verbatim from rmst-ma/index.html and run under Node.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

PAGE = Path(__file__).resolve().parents[1] / "index.html"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _parse(text: str):
    html = PAGE.read_text(encoding="utf-8")
    m = re.search(r"\n(\s*)function parse\(text(?:, rejected)?\) \{.*?\n\1\}\n", html, re.S)
    assert m, "parse() not found in rmst-ma/index.html"
    script = m.group(0) + (
        f"\nvar rej = []; var rows = parse({json.dumps(text)}, rej);"
        "\nconsole.log(JSON.stringify({rows: rows, rejected: rej}));")
    res = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=30, check=False)
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout.strip().splitlines()[-1])


# L01: numeric prefixes and non-decimal notations
@pytest.mark.parametrize("line", ["T1, 1.2abc, 0.4", "T1, 1.2, 0.4e", "T1, 1.2, 0.4.1", "T1, --1.2, 0.4",
                                  "T1, 1.2, 0x10", "T1, 0x1, 0.4", "T1, 1.2, 0.4x", "T1, Infinity, 0.4"])
def test_malformed_number_excludes_row(line):
    assert _parse(line + "\nT2, 0.5, 0.3")["rows"] == [{"label": "T2", "diff": 0.5, "se": 0.3, "v": 0.09}]


def test_wellformed_numbers_accepted():
    rows = _parse("A, -1.5e-1, 2E1\nB, +3, .25\nC, 4., 1")["rows"]
    assert [(r["label"], r["diff"], r["se"]) for r in rows] == [("A", -0.15, 20.0), ("B", 3.0, 0.25), ("C", 4.0, 1.0)]


def test_default_example_rows_unchanged():
    html = PAGE.read_text(encoding="utf-8")
    ex = json.loads(re.search(r'var EXAMPLE = ("[^\n]*");', html).group(1))
    rows = _parse(ex)["rows"]
    assert [(r["label"], r["diff"], r["se"]) for r in rows] == [
        ("Trial A", 1.2, 0.4), ("Trial B", 0.8, 0.5), ("Trial C", 2.1, 0.6),
        ("Trial D", 0.5, 0.45), ("Trial E", 1.5, 0.55), ("Trial F", 1.0, 0.3)]
