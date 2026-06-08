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


def test_no_cdn():
    h = _h()
    assert 'src="http' not in h and 'href="http' not in h


def test_test_hook_present():
    # behavioural specs depend on this deterministic compute hook
    assert "__almScreenpro" in _h()


def test_no_placeholder_leak():
    h = _h()
    for bad in ("{{", "REPLACE_ME", "__PLACEHOLDER__", ">None<", "/None"):
        assert bad not in h, f"placeholder leak: {bad}"


def test_local_first_connect():
    # records must never leave the device
    assert "connect-src 'self'" in _h()
