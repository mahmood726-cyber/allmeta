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
    res = subprocess.run([NODE, "-e", script], capture_output=True, text=True, encoding="utf-8", timeout=30, check=False)
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


# L03: a fourth column or decimal commas must not be re-read as other numbers. ("Smith, 2010, 1.2, 0.4" was
# listed here at first; review of PR #647: that is a legitimate comma label and is now in test_comma_labels_accepted.)
@pytest.mark.parametrize("line", ["T1, 12, 1.2, 0.4", "T1, 1,2, 0,4", "T1, 1.2"])
def test_not_three_fields_refused(line):
    out = _parse(line + "\nT2, 0.5, 0.3")
    assert out["rows"] == [{"label": "T2", "diff": 0.5, "se": 0.3, "v": 0.09}]
    assert [r["line"] for r in out["rejected"]] == [1]
    assert "label, RMST difference, SE" in out["rejected"][0]["reason"]


# Review of PR #647: labels with commas must still work, without re-admitting horizon columns or
# decimal commas. Rule: a double-quoted label is taken as one field (CSV, "" = quote) and then exactly
# 3 fields are required. An unquoted row with more than 3 fields is accepted only if the last two fields
# are decimal numbers AND no label field after the first is a bare number other than a 4-digit year
# 1900-2099 (a bare non-year number before the difference is what a horizon column or a decimal comma
# produces: "A, 12, 1.2, 0.4" -> "12"; "C, 1,2, 0,4" -> "1", "2").
@pytest.mark.parametrize("line,label", [
    ('"Smith, 2019", 1.2, 0.4', "Smith, 2019"),
    ('"Smith ""Jr"", 2019", 1.2, 0.4', 'Smith "Jr", 2019'),
    ("Smith et al., 2019, 1.2, 0.4", "Smith et al., 2019"),
    ("Smith, 2019, 1.2, 0.4", "Smith, 2019"),
    ("Smith, Jones, 1.2, 0.4", "Smith, Jones"),
])
def test_comma_labels_accepted(line, label):
    out = _parse(line)
    assert out["rejected"] == []
    assert out["rows"] == [{"label": label, "diff": 1.2, "se": 0.4, "v": 0.16000000000000003}]


@pytest.mark.parametrize("line", ["A, 12, 1.2, 0.4", "C, 1,2, 0,4", "Smith 2019, 1,2, 0,4", "Smith, 2019, 12, 1.2, 0.4",
                                  "1,2, 0,4", '"Smith, 2019", 12, 1.2, 0.4'])
def test_horizon_column_and_decimal_commas_still_refused(line):
    out = _parse(line + "\nT2, 0.5, 0.3")
    assert [r["label"] for r in out["rows"]] == ["T2"]
    assert [r["line"] for r in out["rejected"]] == [1]


@pytest.mark.parametrize("header", ["label, RMST difference, SE", "study,rmst_diff,se", '"Trial", "Diff (months)", "SE"'])
def test_header_row_ignored_not_counted(header):
    out = _parse(header + "\nT1, 0.4, 0.2\nT2, 0.5, 0.3")
    assert out["rejected"] == [] and [r["label"] for r in out["rows"]] == ["T1", "T2"]


def test_header_only_recognised_on_first_data_line():
    out = _parse("T1, 0.4, 0.2\nlabel, diff, se\nT2, 0.5, 0.3")
    assert [r["line"] for r in out["rejected"]] == [2]
