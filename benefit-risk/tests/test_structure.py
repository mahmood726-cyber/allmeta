"""Structural tests for the benefit-risk MCDA app."""
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
    assert "../shared/benefit-risk-v1.js" in h and "AlmBenefitRisk.analyze" in h


def test_surfaces_smaa_evpi_and_caveats():
    h = _h()
    assert "SMAA" in h and "EVPI" in h
    assert "Caveats" in h and "value judgement" in h.lower()
    assert "seed" in h.lower()          # reproducibility control


def test_test_hook_present():
    assert "__almBenefitRisk" in _h()
