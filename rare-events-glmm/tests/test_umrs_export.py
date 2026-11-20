"""UM.RS "Copy R script" / "Download .R" (rare-events-glmm/index.html, buildUMRSscript).

The page displays NO numbers for UM.RS (R-only model), so this export cannot be a page-vs-R
check. Requirement: the script must SAY so in its output, ending with an explicit
"NOT A CHECK" line, so neither a user nor a harness can read its printout as a passing
comparison (it used to print the metafor fit and stop, with no verdict either way).
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _script(rows):
    h = (ROOT / "rare-events-glmm" / "index.html").read_text(encoding="utf-8")
    m = re.search(r"    function buildUMRSscript\(rows\) \{.*?\n    \}\n", h, re.S)
    assert m, "buildUMRSscript not found in index.html"
    js = m.group(0) + "\nconsole.log(JSON.stringify(buildUMRSscript(" + json.dumps(rows) + ")));"
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


ROWS = [{"label": "A", "events_T": 0, "n_T": 50, "events_C": 2, "n_C": 50},
        {"label": "B", "events_T": 1, "n_T": 80, "events_C": 3, "n_C": 82}]


def test_umrs_script_carries_the_inputs():
    s = _script(ROWS)
    assert "ai <- c(0, 1)" in s and "bi <- c(50, 79)" in s and "ci <- c(2, 3)" in s and "di <- c(48, 79)" in s
    assert 'model="UM.RS"' in s


def test_umrs_script_states_it_is_not_a_check():
    s = _script(ROWS)
    last = [l for l in s.splitlines() if l.strip()][-1]
    assert last.startswith("cat(") and "NOT A CHECK" in last, last
    # never a MATCH verdict: there are no page values to match
    assert "MATCH" not in s.replace("NOT A CHECK", "")
