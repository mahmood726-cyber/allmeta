"""Tests for shared/living-monitor-v1.js — the signed living-review audit trail.

Runs the module in Node (Web Crypto is available in Node >= 20, the same code
the browser runs). Pins that the SHA-256 chain + HMAC signature detect every
tampering mode and pinpoint the first altered version.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run(body: str) -> dict:
    prog = (
        "const L=require('./shared/living-monitor-v1.js');"
        "(async()=>{try{" + body + "}catch(e){console.log(JSON.stringify({__err:e.message}))}})();"
    )
    r = subprocess.run([NODE, "-e", prog], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    out = json.loads(r.stdout.strip().splitlines()[-1])
    assert "__err" not in out, out
    return out

SEED = (
    "const v1={version:1,k:5,estimate:-0.15,tau2:0.02};"
    "const v2={version:2,k:7,estimate:-0.20,tau2:0.03};"
    "const s1=await L.sealVersion(null,v1,'KEY');"
    "const s2=await L.sealVersion(s1._seal,v2,'KEY');"
)


def test_seal_then_verify_intact_signed_chain():
    o = _run(SEED + "console.log(JSON.stringify(await L.verifyHistory([s1,s2],'KEY')));")
    assert o["valid"] is True and o["brokenAt"] == -1 and o["signed"] is True and o["count"] == 2


def test_content_tamper_is_caught_at_its_index():
    o = _run(SEED + "const t=JSON.parse(JSON.stringify(s2)); t.estimate=-0.99;"
                    "console.log(JSON.stringify(await L.verifyHistory([s1,t],'KEY')));")
    assert o["valid"] is False and o["brokenAt"] == 1 and o["reason"] == "content altered"


def test_wrong_key_fails_signature():
    o = _run(SEED + "console.log(JSON.stringify(await L.verifyHistory([s1,s2],'WRONG')));")
    assert o["valid"] is False and o["reason"] == "signature invalid"


def test_reorder_breaks_the_chain_link():
    o = _run(SEED + "console.log(JSON.stringify(await L.verifyHistory([s2,s1],'KEY')));")
    assert o["valid"] is False and o["reason"] == "chain link broken"


def test_unsigned_chain_still_tamper_evident():
    # no key: the hash chain is still tamper-evident, just not authenticated
    o = _run("const a=await L.sealVersion(null,{version:1,estimate:0.1},null);"
             "const b=await L.sealVersion(a._seal,{version:2,estimate:0.2},null);"
             "const ok=await L.verifyHistory([a,b],null);"
             "const t=JSON.parse(JSON.stringify(b)); t.estimate=9;"
             "const bad=await L.verifyHistory([a,t],null);"
             "console.log(JSON.stringify({ok:ok.valid,signed:ok.signed,bad:bad.valid,at:bad.brokenAt}));")
    assert o["ok"] is True and o["signed"] is False
    assert o["bad"] is False and o["at"] == 1


def test_canonical_is_key_order_independent():
    o = _run("const a=L.canonical({b:1,a:2}); const b=L.canonical({a:2,b:1});"
             "console.log(JSON.stringify({eq:a===b}));")
    assert o["eq"] is True
