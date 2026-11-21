"""shared/robma.js analysis() options (limitation sweep P56 F21, lane lim8, 2026-11-20).

The page uses the defaults (muSD = tauSD = 1, equal model weights) and these are unchanged, bit for bit.
API defects: `opts.muSD || 1` silently replaced 0 by 1 and accepted a negative scale; unequal model
weights were folded into the "Bayes factors", which were then posterior inclusion odds, not BFs.
Requirement: invalid scales / weights throw; with unequal weights the inclusion BF is the posterior
inclusion odds divided by the prior inclusion odds, i.e. it equals the BF computed from the marginal
likelihoods (checked here against a direct calculation from the returned log marginals).
"""
import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
Y, S = [0.10, 0.30, 0.50, 0.20, 0.90, 0.40, 1.10, 0.05], [0.20, 0.25, 0.18, 0.30, 0.22, 0.28, 0.35, 0.15]


def run(opts):
    js = ("const R=require('./shared/robma.js');let o;try{o=R.analysis(%s,%s,%s);}catch(e){o={error:String(e.message)}}"
          "console.log(JSON.stringify(o));") % (json.dumps(Y), json.dumps(S), json.dumps(opts))
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=120, cwd=str(ROOT))
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def lse(a):
    m = max(a)
    return m + math.log(sum(math.exp(x - m) for x in a))


@pytest.mark.parametrize("opts", [{"muSD": 0}, {"muSD": -2}, {"tauSD": 0}, {"tauSD": -1},
                                  {"priors": [0.5, 0.5, 0, 0]}, {"priors": [0.25, -0.25, 0.5, 0.5]}, {"priors": [1, 1, 1]}])
def test_invalid_options_throw(opts):
    assert "error" in run(opts)


def test_unequal_weights_give_bayes_factors_not_posterior_odds():
    o = run({"priors": [0.1, 0.2, 0.3, 0.4]})
    L = o["logMarginal"]
    bf_e = lse([L["H1FE"] + math.log(0.2), L["H1RE"] + math.log(0.4)]) - lse([L["H0FE"] + math.log(0.1), L["H0RE"] + math.log(0.3)]) \
        - (math.log(0.6) - math.log(0.4))
    bf_h = lse([L["H0RE"] + math.log(0.3), L["H1RE"] + math.log(0.4)]) - lse([L["H0FE"] + math.log(0.1), L["H1FE"] + math.log(0.2)]) \
        - (math.log(0.7) - math.log(0.3))
    assert abs(o["logBfEffect"] - bf_e) < 1e-12 and abs(o["logBfHetero"] - bf_h) < 1e-12, o
    # and it differs from the posterior odds the old code returned
    post = o["postProb"]
    assert abs(o["logBfEffect"] - math.log((post["H1FE"] + post["H1RE"]) / (post["H0FE"] + post["H0RE"]))) > 0.1


def test_defaults_unchanged():
    # Exact doubles from the engine BEFORE this change (lane lim8 HEAD 440e47d4) for the built-in example;
    # the page shows them as 6.74 and 2.70 (R integrate(): 6.738859, 2.698955 -- robma-parity.spec.mjs).
    a, b = run({}), run({"muSD": 1, "tauSD": 1, "priors": [0.25, 0.25, 0.25, 0.25]})
    assert a == b
    assert a["bfEffect"] == 6.738856332915744 and a["bfHetero"] == 2.69895320685472, a
