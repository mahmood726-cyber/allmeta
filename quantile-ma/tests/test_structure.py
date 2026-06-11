"""Structural tests for the quantile meta-analysis app."""
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
    assert "../shared/ma-core.js" in h and "../shared/quantile-ma-v1.js" in h
    assert "AlmQuantileMA.analyze" in h


def test_method_framing_and_caveats():
    h = _h()
    assert "Wald" in h and "QTE" in h and "quantile" in h.lower()
    assert "Caveats" in h and "conservative" in h.lower()
    assert "quantile regression" in h.lower()      # stage-1 honesty


def test_test_hook_present():
    assert "__almQuantileMA" in _h()
