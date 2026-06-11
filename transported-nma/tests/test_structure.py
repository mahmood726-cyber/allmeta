"""Structural tests for the transported-NMA app."""
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


def test_loads_engines():
    h = _h()
    assert "../shared/transported-nma-v1.js" in h
    assert "../shared/multiplicative-nma.js" in h and "../shared/ma-core.js" in h
    assert "AlmTransportedNMA.run" in h


def test_method_framing_and_caveats():
    h = _h()
    assert "entropy" in h.lower() and "P-score" in h and "effective sample size" in h.lower()
    assert "Caveats" in h and "extrapolat" in h.lower()
    assert "unmeasured" in h.lower()                 # honesty about residual confounding


def test_aria_live_result():
    h = _h()
    assert 'role="status"' in h and 'aria-live="polite"' in h


def test_test_hook_present():
    assert "__almTransportedNMA" in _h()
