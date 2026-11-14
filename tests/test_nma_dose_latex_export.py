r"""nma-dose-response-app "Export LaTeX (.tex)" (#exportLatex -> exportLatexDocument in
js/utils/exports.js) must be a valid LaTeX document whose heterogeneity values are the ones the
Diagnostics panel shows (re-review lane rrev61, fixed in lane nmaexp2, 2026-11-14).

Defects pinned here (each failed before the fix):
  * F1: I^2 arrived as a fraction (state.globalI2 = 0.931) and was printed as "0.931\%" while
    Diagnostics shows 93.1%;
  * F2: the source wrote '\\n' (backslash + n) where a newline was meant, so the file was ONE line
    holding ~32 literal "\n" sequences; with no statistics the table helper returned
    '% No data available\\n', a comment that swallowed the rest of that single line, including
    \begin{document} ... \end{document};
  * F3: the exported Q was NaN ("N/A") although Diagnostics shows a Global Q with its df.
No TeX engine is installed on the validation machine, so validity is checked structurally: real
newlines, no literal "\n", every \begin{x} closed by \end{x} in order, and the document still
complete after every unescaped % comment is removed.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
RUNNER = ROOT / "tests" / "fixtures" / "nma_dose_latex_runner.cjs"
NODE = shutil.which("node")

STATS = [
    {"treatment": "Drug_A", "modelDetail": "Emax", "emax": 1.2345, "ed50": 10.5, "aicc": -3.2, "sucra": 0.81, "pbest": 0.6},
    {"treatment": "B & C 50%", "modelDetail": "Linear", "emax": None, "ed50": None, "aicc": 4.0, "sucra": 0.19, "pbest": 0.4},
]
GM = {"Q": 8.148, "df": 9, "Qp": 0.5196, "I2": 0.931, "tau2": 0.0123}
# NaN cannot travel through JSON; null stands in for it (the page passes NaN, and both must print N/A).
CASES = {
    "full": {"stats": STATS, "globalMetrics": GM},
    "nostats": {"stats": [], "globalMetrics": GM},
    "nometrics": {"stats": STATS, "globalMetrics": None},
    "missing": {"stats": STATS, "globalMetrics": {**GM, "I2": None, "Q": None, "df": None, "Qp": None}},
}


@pytest.fixture(scope="module")
def tex():
    if NODE is None:
        pytest.skip("node not installed")
    res = subprocess.run([NODE, str(RUNNER)], input=json.dumps(CASES), capture_output=True, text=True,
                         timeout=60, check=False)
    assert res.returncode == 0, res.stderr[-2000:]
    return json.loads(res.stdout)


def strip_comments(s: str) -> str:
    # an unescaped % starts a comment that runs to the end of the line
    return "\n".join(re.sub(r"(?<!\\)%.*$", "", line) for line in s.split("\n"))


def environments_balanced(s: str) -> list[str]:
    stack, errs = [], []
    for kind, name in re.findall(r"\\(begin|end)\{([^}]*)\}", s):
        if kind == "begin":
            stack.append(name)
        elif not stack or stack.pop() != name:
            errs.append(rf"\end{{{name}}} without matching \begin")
    errs += [rf"\begin{{{n}}} never closed" for n in stack]
    return errs


def line_with(t: str, needle: str) -> str:
    hits = [l for l in t.split("\n") if needle in l]
    assert len(hits) == 1, (needle, hits)
    return hits[0]


@pytest.mark.parametrize("case", list(CASES))
def test_tex_is_structurally_valid(tex, case):
    t = tex[case]
    assert not re.search(r"\\n(?![a-zA-Z])", t), f"{case}: literal backslash-n instead of a newline"
    assert t.count("\n") >= 8, f"{case}: {t.count(chr(10))} newlines; the document is (nearly) one line"
    body = strip_comments(t)
    assert body.lstrip().startswith(r"\documentclass"), case
    for must in (r"\begin{document}", r"\end{document}", r"\maketitle"):
        assert must in body, f"{case}: {must} lost (swallowed by a % comment?)"
    assert body.rstrip().endswith(r"\end{document}"), case
    assert environments_balanced(body) == [], (case, environments_balanced(body))
    # \texttau is defined by the textgreek package, which the preamble does not load
    assert r"\texttau" not in body, f"{case}: undefined control sequence \\texttau"


def test_i2_printed_as_percent_like_diagnostics(tex):
    line = line_with(tex["full"], r"\item $I^2$")
    assert r"93.1\%" in line, line
    assert "0.931" not in line, line


def test_q_is_the_diagnostics_global_q_with_df(tex):
    line = line_with(tex["full"], "Global Q")
    assert "8.148" in line and "df = 9" in line, line
    assert "N/A" not in line, line


def test_missing_values_are_said_not_invented(tex):
    t = tex["missing"]
    i2 = line_with(t, r"\item $I^2$")
    q = line_with(t, "Global Q")
    assert "N/A" in i2 and "NaN" not in i2 and "null" not in i2, i2
    assert "N/A" in q and "NaN" not in q and "null" not in q, q


def test_table_escapes_special_characters(tex):
    assert r"B \& C 50\%" in tex["full"]
    assert r"Drug\_A" in tex["full"]
