"""Structural tests for the search-completeness app."""
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
    assert "../shared/search-completeness-v1.js" in h and "AlmSearchCompleteness.assess" in h


def test_surfaces_denominator_bias_and_caveats():
    h = _h()
    assert "denominator" in h.lower() and "linkage" in h.lower()
    assert "Caveats" in h and "registry cohort itself may be incomplete" in h


def test_test_hook_present():
    assert "__almSearchCompleteness" in _h()
