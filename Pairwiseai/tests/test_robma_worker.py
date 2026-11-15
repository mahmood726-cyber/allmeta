"""The RoBMA web worker carries no private normal / gamma approximations (lane pwbias).

The worker source (a string handed to new Blob in runRoBMA) defined pnorm by Abramowitz-Stegun 7.1.26
(relative error 5e-5), an Acklam qnorm and a Lanczos lgamma, while the page's pnorm is the R-equal
shared/upper-tail.js one. Nothing in the worker called any of the three, so they are removed rather than
replaced: no worker output can come from them, and a future edit that needs one must load the shared code.
"""
import json
import re
from pathlib import Path

BUNDLE = Path(__file__).resolve().parent.parent / 'TruthCert-PairwisePro-v1.0-bundle.html'


def worker_source(html):
    m = re.search(r'new Blob\(\["(\\n {8}// [^"]*?RoBMA[\s\S]*?)"\], \{', html)
    assert m, 'RoBMA worker blob not found'
    return json.loads('"' + m.group(1) + '"')


def test_robma_worker_has_no_private_approximations():
    src = worker_source(BUNDLE.read_text(encoding='utf-8'))
    assert 'robustBayesianMAWorker' in src and 'self.onmessage' in src
    for name in ('pnorm', 'qnorm', 'lgamma'):
        assert not re.search(r'function\s+' + name + r'\s*\(', src), name + ' defined in the worker'
        assert not re.search(r'\b' + name + r'\s*\(', src), name + ' called in the worker'
    assert '0.3275911' not in src  # the A-S 7.1.26 constant
