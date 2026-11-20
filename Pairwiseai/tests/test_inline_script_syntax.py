"""Every inline <script> of every Pairwise Pro build parses (node --check), and so do app.js / app.min.js.

Before the fix, TruthCert-PairwisePro-v1.0-optimized.html's exportTierDAuditLog had its two "\\n" escapes expanded
into real line breaks inside single-quoted strings ('timestamp,...,sessionId<LF>' and .join('<LF>')), so the
whole 4th inline script (the application code) was a SyntaxError and none of it ran.
"""
import re
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
JS = ['app.js', 'app.min.js']
HTML = ['TruthCert-PairwisePro-v1.0-bundle.html', 'TruthCert-PairwisePro-v1.0-dist.html',
        'TruthCert-PairwisePro-v1.0-min.html', 'TruthCert-PairwisePro-v1.0-optimized.html',
        'pairwise-pro-v2_2_evalue (5).html']
SCRIPT = re.compile(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', re.S | re.I)
NON_JS = re.compile(r'type=["\'](application/(ld\+)?json|text/template|text/x-)', re.I)


def _check(path):
    r = subprocess.run(['node', '--check', str(path)], capture_output=True, timeout=120)
    return r.returncode, r.stderr.decode('utf-8', 'replace')[-600:]


@pytest.mark.parametrize('name', JS)
def test_js_build_parses(name):
    rc, err = _check(ROOT / name)
    assert rc == 0, err


@pytest.mark.parametrize('name', HTML)
def test_every_inline_script_parses(name, tmp_path):
    html = (ROOT / name).read_text(encoding='utf-8', errors='surrogateescape')
    scripts = [m.group(2) for m in SCRIPT.finditer(html) if not NON_JS.search(m.group(1))]
    assert scripts, 'no inline script found'
    bad = {}
    for k, body in enumerate(scripts, 1):
        p = tmp_path / f's{k}.js'
        p.write_text(body, encoding='utf-8', errors='surrogateescape')
        rc, err = _check(p)
        if rc:
            bad[k] = err
    assert bad == {}
