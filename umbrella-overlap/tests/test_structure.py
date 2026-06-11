"""Structural tests for the umbrella-overlap (CCA) app."""
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
    assert "../shared/umbrella-overlap-v1.js" in h and "AlmUmbrellaOverlap.overlap" in h


def test_cca_method_and_caveats():
    h = _h()
    assert "Corrected Covered Area" in h and "Pieper" in h
    assert "(N − r) / (r·c − r)" in h or "N − r" in h
    assert "Caveats" in h and "double-count" in h.lower()


def test_test_hook_present():
    assert "__almUmbrellaOverlap" in _h()
