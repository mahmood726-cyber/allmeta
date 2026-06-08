"""Static regression guards for the Screen app — each pins a fix applied during
the 2026-06-08 review so it cannot silently regress. Behavioural coverage lives
in tests/playwright/alm-screen-*.spec.mjs."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_sr_project_key_is_declared():
    # P1: was referenced in importFromSearch() but never declared -> ReferenceError
    # silently swallowed, killing Design->Screen term propagation.
    h = _h()
    assert 'var SR_PROJECT_KEY = "sr-project-v1"' in h
    # and it is actually used to read the protocol envelope
    assert "localStorage.getItem(SR_PROJECT_KEY)" in h


def test_csv_injection_guard_excludes_hyphen():
    # Negative term_score must not be corrupted into a text cell ("'-4").
    h = _h()
    assert r"/^[=+@\t\r]/" in h
    assert r"/^[=+\-@\t\r]/" not in h


def test_chips_are_keyboard_operable():
    # WCAG 2.1.1: reason/label chips must be focusable buttons, not click-only spans.
    h = _h()
    assert 'role="button" tabindex="0" aria-pressed="' in h
    # and a keydown handler activates them
    assert "keydown" in h and "chipKey" in h


def test_kappa_degenerate_case_flagged():
    # Perfect agreement on a single category is undefined, not 0.
    h = _h()
    assert "degenerate" in h
    assert "κ undefined" in h


def test_ai_hosts_allowlisted_in_csp():
    h = _h()
    for host in ("api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com"):
        assert host in h, f"missing AI connect-src host: {host}"


def test_footer_does_not_overstate_locality():
    # Honesty: the BYO-key path DOES send record text out, so the blanket
    # "Fully local — records never leave your device" claim was removed.
    h = _h()
    assert "Fully local — records never leave your device" not in h
    assert "Local by default" in h


def test_no_hardcoded_api_key():
    h = _h()
    # only the visible placeholder may contain the sk- hint
    assert 'placeholder="sk-' in h
    # no real-looking secret committed
    assert "sk-SECRET" not in h
    assert "sk-proj-" not in h


def test_frame_ancestors_removed_from_meta_csp():
    # frame-ancestors is ignored in <meta> delivery and emitted a console error.
    assert "frame-ancestors" not in _h()
