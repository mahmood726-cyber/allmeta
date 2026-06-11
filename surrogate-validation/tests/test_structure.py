"""Structural tests for the surrogate-validation app."""
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
    assert "../shared/surrogate-v1.js" in h and "AlmSurrogate.analyze" in h


def test_surfaces_adjusted_r2_and_degeneracy_caveats():
    h = _h()
    assert "adjusted" in h.lower() and "Daniels-Hughes" in h
    assert "Caveats" in h and "necessary but not sufficient" in h
    assert "refus" in h.lower()          # refuses adjusted R² when degenerate


def test_test_hook_present():
    assert "__almSurrogate" in _h()
