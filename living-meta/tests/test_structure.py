"""Structural integrity tests for living-meta.

living-meta/index.html is a 0-duration redirect stub forwarding to
living-meta-complete.html (the real app, per projects.js path). Skip-link
and back-to-hub navigation are not applicable to a redirect — by the time
a user could activate either, they're already at the target page.

Only the CSP meta tag check applies (security baseline still matters even
on a redirect stub)."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_has_csp_meta():
    """Every allmeta app ships an inline CSP meta tag (defence-in-depth)."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'http-equiv="Content-Security-Policy"' in html, "CSP meta tag missing"


def test_redirects_to_real_app():
    """The redirect stub forwards to living-meta-complete.html."""
    html = INDEX.read_text(encoding="utf-8")
    assert "living-meta-complete.html" in html, "redirect target missing"
    assert 'http-equiv="refresh"' in html or "location.replace" in html, "no redirect mechanism"
