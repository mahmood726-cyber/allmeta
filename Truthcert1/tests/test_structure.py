"""Structural integrity tests for Truthcert1.

Truthcert1/index.html is a 53-line landing page with cards and figure images
linking to TruthCert-PairwisePro-v1.0-production.html, e156-submission/, etc.
No interactive primary mount — the real app is the linked HTML. Skip-link and
<main> are not required for this landing page type. CSP and hub navigation apply."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_has_csp_meta():
    """Every allmeta app ships an inline CSP meta tag (defence-in-depth)."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'http-equiv="Content-Security-Policy"' in html, "CSP meta tag missing"


def test_has_hub_link():
    """Launcher page links back to hub."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'href="../"' in html or 'id="hub-back"' in html, "no back-to-hub navigation"
