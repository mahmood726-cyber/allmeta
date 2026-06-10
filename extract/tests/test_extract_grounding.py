"""Pure-logic tests for shared/extract-grounding-v1.js (Phase P0 span grounding).

Runs the module in Node (same pattern as the other shared engines). The grounding
layer is what makes extracted/LLM-proposed values auditable: a value is only
trustworthy if its supporting quote is genuinely in the source.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const G = require('./shared/extract-grounding-v1.js');\n"
TEXT = ("In this randomized trial the hazard ratio 0.86 (95% CI 0.78 to 0.95) was observed for the primary outcome. "
        "A total of 4744 patients were enrolled. The follow-up was 18 months.")


def _run(script: str):
    r = subprocess.run([NODE, "-e", PRELUDE + script], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_sentence_split_keeps_decimals_and_ci_intact():
    o = _run(f"console.log(JSON.stringify(G.sentences({json.dumps(TEXT)})));")
    assert len(o) == 3                       # not split on 0.86 / 0.95 / "18 months."
    assert "hazard ratio 0.86 (95% CI 0.78 to 0.95)" in o[0]


def test_locate_finds_the_source_sentence():
    o = _run(f"console.log(JSON.stringify(G.locate({json.dumps(TEXT)}, 'hazard ratio 0.86 (95% CI 0.78 to 0.95)')));")
    assert o["found"] is True
    assert o["index"] == 0
    assert "hazard ratio 0.86" in o["sentence"]


def test_locate_is_whitespace_insensitive():
    o = _run(f"console.log(JSON.stringify(G.locate({json.dumps(TEXT)}, 'hazard   ratio   0.86')));")
    assert o["found"] is True


def test_validate_quote_grounded_vs_fabricated():
    grounded = _run(f"console.log(JSON.stringify(G.validateQuote({json.dumps(TEXT)}, 'the hazard ratio 0.86 (95% CI 0.78 to 0.95) was observed')));")
    assert grounded["grounded"] is True
    assert "hazard ratio 0.86" in grounded["sentence"]

    fabricated = _run(f"console.log(JSON.stringify(G.validateQuote({json.dumps(TEXT)}, 'odds ratio 2.50 (95% CI 1.10 to 5.00)')));")
    assert fabricated["grounded"] is False   # the value was never in the source

    empty = _run(f"console.log(JSON.stringify(G.validateQuote({json.dumps(TEXT)}, '')));")
    assert empty["grounded"] is False        # no quote = not grounded (never default-trust)
