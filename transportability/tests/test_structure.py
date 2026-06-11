"""Structural tests for the transportability app."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_csp_and_main():
    h = _h()
    assert 'http-equiv="Content-Security-Policy"' in h
    assert "<main" in h.lower()


def test_no_cdn():
    h = _h()
    assert 'src="http' not in h and 'href="http' not in h


def test_hub_back():
    assert 'id="hub-back"' in _h()


def test_loads_engine():
    h = _h()
    assert "../shared/transportability-v1.js" in h and "../shared/ma-core.js" in h
    assert "AlmTransport.transport" in h


def test_surfaces_transport_assumptions():
    # transportability is assumption-laden; the UI must state the assumptions + sensitivity
    h = _h()
    assert "Assumptions" in h and "unmeasured" in h.lower()
    assert "sensitivity" in h.lower()


def test_test_hook_present():
    assert "__almTransport" in _h()
