r"""Inline on*= handlers in the two live Pairwise Pro / TruthCert pages must call functions that exist.

Before lane aitems (2026-11-15) these buttons threw `ReferenceError: X is not defined` on click (confirmed in
headless Chrome, lane scratch click_probe.cjs), and nothing on screen said so:
  both pages:  exportToR, computeHeterogeneity, computeBias, runLiveValidation, exportPRISMASVG
  Truthcert1 production only: computeDDMA (defined in the bundle, never in production or its app.min.js)

Static check: string literals are blanked, then every bare call `name(` in each inline handler must be a
function declared (or assigned) in the page or in a same-folder <script src> it loads, or a browser global.
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PAGES = [
    'Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html',   # hub -> Pairwiseai/main-screen.html redirects here
    'Truthcert1/TruthCert-PairwisePro-v1.0-production.html',
]
BUILTINS = set('''if for while switch return typeof new function catch void delete in of do else try await async
this super alert confirm prompt setTimeout setInterval clearTimeout parseInt parseFloat Number String Boolean Array
Object JSON Math isNaN isFinite encodeURIComponent decodeURIComponent fetch Promise Date Error RegExp URL Blob
requestAnimationFrame structuredClone'''.split())

HANDLER = re.compile(r'\son[a-z]+\s*=\s*"([^"]*)"', re.S)
STRING = re.compile(r"'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`")
CALL = re.compile(r'(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(')


def _defined(text):
    names = set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(', text))
    names |= set(re.findall(r'(?:window\.|\b(?:const|let|var)\s+)([A-Za-z_$][\w$]*)\s*=', text))
    return names


def _page_text(rel):
    page = ROOT / rel
    html = page.read_text(encoding='utf-8')
    text = html
    for src in re.findall(r'<script[^>]+src="([^"]+)"', html):
        p = (page.parent / src).resolve()
        if p.is_file() and ROOT in p.parents and 'vendor' not in p.parts:
            text += '\n' + p.read_text(encoding='utf-8', errors='replace')
    return html, text


@pytest.mark.parametrize('rel', PAGES)
def test_every_inline_handler_calls_a_defined_function(rel):
    html, text = _page_text(rel)
    defined = _defined(text)
    missing = set()
    for code in HANDLER.findall(html):
        for name in CALL.findall(STRING.sub("''", code)):
            if name not in BUILTINS and name not in defined:
                missing.add(name)
    assert not missing, f'{rel}: buttons call undefined functions: {sorted(missing)}'
