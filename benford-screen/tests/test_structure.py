"""Structural tests for the Benford integrity-screen app."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_csp_and_main():
    h = _h()
    assert 'http-equiv="Content-Security-Policy"' in h and "<main" in h.lower()


def test_no_cdn():
    h = _h()
    assert 'src="http' not in h and 'href="http' not in h


def test_hub_back():
    assert 'id="hub-back"' in _h()


def test_loads_engine():
    h = _h()
    assert "../shared/benford-v1.js" in h and "AlmBenford.analyze" in h


def test_caveats_and_bounded_warning():
    h = _h()
    assert "Caveats" in h
    # the honest caveat must name the bounded quantities Benford does NOT apply to
    assert "p-values" in h.lower() and "proportion" in h.lower()
    assert "order" in h.lower() and "magnitude" in h.lower()


def test_aria_live_result():
    h = _h()
    assert 'role="status"' in h and 'aria-live="polite"' in h


def test_test_hook_present():
    assert "__almBenford" in _h()
