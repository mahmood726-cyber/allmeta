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


def test_team_folder_collaboration():
    # Phase 3: serverless shared-folder collaboration via sr-collab-v1.
    h = _h()
    assert "../shared/sr-collab-v1.js" in h, "collaboration module not loaded"
    for el in ('id="btn-folder-connect"', 'id="btn-folder-publish"', 'id="btn-folder-pull"', 'id="folder-status"'):
        assert el in h, f"team-folder UI missing: {el}"
    # the folder path stays serverless — no Google sign-in script or Drive API
    # endpoint was added (the pre-existing Gemini connect-src is unrelated).
    assert "gsi/client" not in h and "accounts.google" not in h
    assert "www.googleapis.com/drive" not in h and "oauth2" not in h
    # it works through the File System Access API instead
    assert "supportsFolder" in h or "showDirectoryPicker" in h
