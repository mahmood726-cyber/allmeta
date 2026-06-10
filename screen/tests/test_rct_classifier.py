"""Parity + behaviour tests for the offline RCT classifier.

The model is trained by screen/tools/train_rct_classifier.py (network); these
tests run only against the COMMITTED weights, so they need no network. They
pin (a) JS↔Python inference parity via the committed reference scores, and
(b) that the classifier honestly separates RCT from non-RCT abstracts and
carries real held-out metrics.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
WEIGHTS_JS = ROOT / "screen" / "assets" / "rct-classifier-weights-v1.js"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _weights() -> dict:
    s = WEIGHTS_JS.read_text(encoding="utf-8")
    return json.loads(s[s.index("{"): s.rindex("}") + 1])


def _js_scores(texts: list) -> list:
    """Score each text through the actual JS module in Node."""
    prog = (
        "const C=require('./shared/rct-classifier-v1.js');"
        "const fs=require('fs');"
        "const s=fs.readFileSync('./screen/assets/rct-classifier-weights-v1.js','utf8');"
        "const w=JSON.parse(s.slice(s.indexOf('{'),s.lastIndexOf('}')+1));"
        f"const texts={json.dumps(texts)};"
        "console.log(JSON.stringify(texts.map(t=>C.scoreWith(w,t))));"
    )
    r = subprocess.run([NODE, "-e", prog], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_weights_file_is_real_and_honest():
    w = _weights()
    assert w["_schema"] == "rct-classifier-v1"
    m = w["meta"]
    # honest, non-trivial training provenance + held-out metrics
    assert m["n_train"] > 1000 and m["n_test"] > 200
    assert 0.8 <= m["auc"] <= 1.0 and m["sensitivity"] >= 0.8 and m["specificity"] >= 0.8
    assert m["n_terms"] == len(w["vocab"]) and len(w["vocab"]) > 200


def test_js_python_parity_on_reference_scores():
    w = _weights()
    refs = w["reference_scores"]
    js = _js_scores([r["text"] for r in refs])
    for got, ref in zip(js, refs):
        assert abs(got - ref["p"]) < 1e-6, f"JS {got} vs committed {ref['p']}"


def test_classifier_separates_rct_from_non_rct():
    rct = "In this randomized, double-blind, placebo-controlled trial, patients were randomly assigned to treatment or placebo."
    rev = "This systematic review and meta-analysis pooled observational cohort studies."
    case = "We report a rare case of an unusual clinical presentation in one patient."
    s = _js_scores([rct, rev, case])
    assert s[0] > 0.5, "RCT abstract should score high"
    assert s[1] < 0.5 and s[2] < 0.5, "review / case report should score low"
    assert s[0] > s[1] and s[0] > s[2]


def test_tokenisation_contract_matches_training():
    # the JS module must use the same token pattern the trainer recorded
    assert _weights()["token_pattern"] == r"\b\w\w+\b"
    mod = (ROOT / "shared" / "rct-classifier-v1.js").read_text(encoding="utf-8")
    assert r"\b\w\w+\b" in mod
