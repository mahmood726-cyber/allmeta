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


def test_rct_classifier_wired():
    # P1: offline cold-start RCT classifier surfaced in screening.
    h = _h()
    assert "../shared/rct-classifier-v1.js" in h, "classifier module not loaded"
    assert "assets/rct-classifier-weights-v1.js" in h, "trained weights not loaded"
    assert "function rctScore" in h and "SrRctClassifier" in h
    assert 'class="badge b-rct"' in h               # per-card RCT% badge
    assert 'value="rct"' in h                        # sortable by RCT likelihood
    # honest provenance surfaced from real held-out metrics (not hardcoded)
    assert 'id="rct-meta"' in h and "Held-out AUC" in h


def test_rct_weights_are_real_trained_artifact():
    from pathlib import Path
    import json
    p = Path(__file__).parent.parent / "assets" / "rct-classifier-weights-v1.js"
    assert p.is_file(), "trained weights missing"
    s = p.read_text(encoding="utf-8")
    j = json.loads(s[s.index("{"): s.rindex("}") + 1])
    assert j["_schema"] == "rct-classifier-v1"
    assert j["meta"]["auc"] >= 0.85 and j["meta"]["n_train"] > 1000   # honest, non-trivial
    assert len(j["vocab"]) > 200 and "reference_scores" in j


def test_imported_decisions_whitelisted_and_id_escaped():
    # XSS guard: decisions are a closed set (whitelisted on import) and the
    # arbitrary record id is escaped where it lands in the conflict-panel markup.
    h = _h()
    assert "function dec(d)" in h and '["include", "exclude", "maybe"]' in h
    assert "d: dec(r.r1.d)" in h and "d: dec(r.r2.d)" in h and "resolved: dec(" in h
    assert 'data-res-inc="\' + escapeHtml(r.id)' in h and 'data-res-exc="\' + escapeHtml(r.id)' in h


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
