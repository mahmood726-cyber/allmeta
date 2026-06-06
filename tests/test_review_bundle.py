"""Tests for shared/review-bundle.js — the Phase-3 signed, tamper-evident
review bundle.

A bundle of stages must: sign + verify cleanly; detect tampering of ANY stage's
output and LOCATE the first altered stage (HMAC invalid + chain broken at that
index); and fall back to an honest UNSIGNED-but-chained bundle when no signer is
present (never a placeholder signature).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = (
    "require('./shared/ma-studies-v1.js'); require('./shared/truthcert-export.js');\n"
    "const RB = require('./shared/review-bundle.js');\n"
)
PROJECT = ("{title:'Test SR', stages:["
           "{id:'protocol', output:{prospero:'CRD42026', question:'X vs Y'}},"
           "{id:'screening', output:{included:14, excluded:120}},"
           "{id:'synthesis', output:{mu:-0.35, ciLo:-0.52, ciHi:-0.18, k:14}}]}")


def _run(script: str) -> dict:
    r = subprocess.run([NODE, "-e", PRELUDE + script], capture_output=True, text=True,
                       timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_sign_and_verify_clean():
    o = _run("(async()=>{const s=await RB.sign(" + PROJECT + ",{key:'k'});"
             "const v=await RB.verify(s.receipt,{key:'k'});"
             "console.log(JSON.stringify({signed:s.signed, sig:v.signatureValid, chain:v.chainValid, broken:v.brokenStage}));})();")
    assert o["signed"] is True
    assert o["sig"] is True and o["chain"] is True and o["broken"] == -1


def test_tamper_locates_broken_stage():
    o = _run("(async()=>{const s=await RB.sign(" + PROJECT + ",{key:'k'});"
             "s.receipt.extra.stages[1].output.included=9999;"  # tamper stage index 1
             "const v=await RB.verify(s.receipt,{key:'k'});"
             "console.log(JSON.stringify({sig:v.signatureValid, chain:v.chainValid, broken:v.brokenStage}));})();")
    assert o["sig"] is False, "HMAC must invalidate on any tamper"
    assert o["chain"] is False
    assert o["broken"] == 1, "must locate the exact tampered stage"


def test_wrong_key_fails_signature_but_chain_ok():
    o = _run("(async()=>{const s=await RB.sign(" + PROJECT + ",{key:'right'});"
             "const v=await RB.verify(s.receipt,{key:'wrong'});"
             "console.log(JSON.stringify({sig:v.signatureValid, chain:v.chainValid}));})();")
    assert o["sig"] is False
    assert o["chain"] is True, "an untampered bundle's chain is valid regardless of the key"


def test_unsigned_when_no_signer():
    o = _run("(async()=>{const g=global.MaStudies; delete global.MaStudies;"
             "const r=await RB.sign(" + PROJECT + ",{}); global.MaStudies=g;"
             "console.log(JSON.stringify({signed:r.signed, hasBundle:!!r.bundle, hasReceipt:!!r.receipt}));})();")
    assert o["signed"] is False
    assert o["hasBundle"] is True and o["hasReceipt"] is False
