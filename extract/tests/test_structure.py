from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_csp_and_main():
    h = _h()
    assert 'http-equiv="Content-Security-Policy"' in h
    assert "<main" in h.lower()
    assert "frame-ancestors" not in h  # ignored in <meta>, must not be present


def test_no_cdn():
    h = _h()
    assert 'src="http' not in h and 'href="http' not in h


def test_hub_back():
    assert 'id="hub-back"' in _h()


def test_test_hook_present():
    assert "__almExtract" in _h()


def test_extraction_engine_functions():
    h = _h()
    for fn in ("function extractEffects", "function extractSampleSizes", "function extractEvents",
               "function extractRoB", "function extractDesign", "function extractPICO", "function toMaStudy"):
        assert fn in h, f"missing engine fn: {fn}"


def test_feeds_ma_studies_bus():
    h = _h()
    assert "ma-studies-v1.js" in h
    assert "MaStudies.fromCI" in h and "MaStudies.write" in h


def test_negation_guard_present():
    # "Not randomized 1807" trap (rules/lessons.md) must be guarded.
    assert "NEG" in _h() and "not|non|never" in _h()


def test_no_placeholder_or_hardcoded_key():
    h = _h()
    for bad in ("{{", "REPLACE_ME", "__PLACEHOLDER__", ">None<", "/None", "sk-proj-", "sk-SECRET"):
        assert bad not in h


def test_csv_injection_guard_excludes_hyphen():
    h = _h()
    assert r"/^[=+@\t\r]/" in h
    assert r"/^[=+\-@\t\r]/" not in h
