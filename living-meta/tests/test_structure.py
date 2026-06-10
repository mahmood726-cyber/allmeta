"""Structural integrity tests for living-meta.

living-meta/index.html is a 0-duration redirect stub forwarding to
living-meta-complete.html (the real app, per projects.js path). Skip-link
and back-to-hub navigation are not applicable to a redirect — by the time
a user could activate either, they're already at the target page.

Only the CSP meta tag check applies (security baseline still matters even
on a redirect stub)."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"
APP = Path(__file__).parent.parent / "living-meta-complete.html"


def test_has_csp_meta():
    """Every allmeta app ships an inline CSP meta tag (defence-in-depth)."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'http-equiv="Content-Security-Policy"' in html, "CSP meta tag missing"


def test_redirects_to_real_app():
    """The redirect stub forwards to living-meta-complete.html."""
    html = INDEX.read_text(encoding="utf-8")
    assert "living-meta-complete.html" in html, "redirect target missing"
    assert 'http-equiv="refresh"' in html or "location.replace" in html, "no redirect mechanism"


def test_signed_audit_trail_wired():
    """P1: the living-review version timeline is sealed into a signed,
    tamper-evident provenance chain."""
    h = APP.read_text(encoding="utf-8")
    assert "../shared/living-monitor-v1.js" in h, "signing engine not loaded"
    assert "LivingMonitor.sealVersion" in h, "versions are not sealed on record"
    assert "LMA.verifyVersionHistory" in h and "verifyCurrentProvenance" in h
    assert 'id="verify-provenance-btn"' in h and 'id="sign-key-btn"' in h
    # honest: unsigned still hash-chains; signing is HMAC with the reviewer's key
    assert "getSignKey" in h and "setSignKey" in h
