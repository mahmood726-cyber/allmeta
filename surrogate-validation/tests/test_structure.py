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


def test_validation_claim_names_what_was_validated():
    # The footer said only "Cross-language validated against numpy". The page's own unit test does compare with a
    # numpy oracle, but the external validation (P52 archive) was against R: slope/intercept, Q, df, I^2 with
    # metafor; naive and leave-one-out R^2 with Surrogate::TrialLevelMA; Pearson r with base R. The adjusted R^2
    # and STE have no package implementation and were checked only against their printed definitions.
    foot = _h().split('class="footer-note"', 1)[1].split("</p>", 1)[0]
    assert "Cross-language validated against numpy" not in foot
    for word in ("metafor", "TrialLevelMA", "printed definition"):
        assert word in foot, word
