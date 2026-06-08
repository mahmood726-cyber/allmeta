from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_csp():
    assert 'http-equiv="Content-Security-Policy"' in _h()


def test_main():
    assert "<main" in _h().lower()


def test_hub_back():
    h = _h()
    assert 'id="hub-back"' in h or 'href="../"' in h


def test_test_hook_present():
    assert "__almDesign" in _h()


def test_no_placeholder_leak():
    h = _h()
    for bad in ("{{", "REPLACE_ME", "__PLACEHOLDER__", ">None<", "/None"):
        assert bad not in h, f"placeholder leak: {bad}"


def test_pipeline_envelope():
    # writes the sr-project-v1 envelope read by Search and Screen
    assert "sr-project-v1" in _h()
