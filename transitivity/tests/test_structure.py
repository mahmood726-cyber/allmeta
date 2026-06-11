"""Structural tests for the transitivity & representativeness app."""
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
    assert "../shared/transitivity-v1.js" in h
    assert "AlmTransitivity.assessTransitivity" in h and "AlmTransitivity.assessRepresentativeness" in h


def test_screen_not_test_framing_and_links_transport():
    h = _h()
    assert "screen" in h.lower() and "not a hypothesis test" in h.lower()
    assert "../transportability/" in h          # representativeness flag → transport


def test_test_hook_present():
    assert "__almTransitivity" in _h()
