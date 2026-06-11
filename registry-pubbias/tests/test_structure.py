"""Structural tests for the registry-publication-bias app."""
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


def test_loads_audited_engines():
    h = _h()
    assert "../shared/ma-core.js" in h and "../shared/egger.js" in h
    assert "../shared/registry-pubbias-v1.js" in h and "AlmRegistryPubbias.assess" in h


def test_measure_vs_infer_framing_and_caveats():
    h = _h()
    assert "measure" in h.lower() and "infer" in h.lower()
    assert "spurious" in h.lower() and "ghost" in h.lower()
    assert "Caveats" in h


def test_test_hook_present():
    assert "__almRegistryPubbias" in _h()
