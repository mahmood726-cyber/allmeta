"""Tests for the vision evidence store.

Every test here is RED-able: it proves a guard CAN fail. A gate that cannot
fail is verification theatre (see the RapidMeta pre-push hook that printed
"PASS" at 0/1522).
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import visionstore as vs


@pytest.fixture
def store(tmp_path, monkeypatch):
    d = tmp_path / "visionstore"
    monkeypatch.setattr(vs, "STORE_DIR", str(d))
    monkeypatch.setattr(vs, "LEDGER", str(d / "calls.jsonl"))
    monkeypatch.setattr(vs, "BLOBS", str(d / "blobs"))
    return d


@pytest.fixture
def img(tmp_path):
    p = tmp_path / "fig.jpg"
    p.write_bytes(b"\xff\xd8\xff\xe0" + b"PRETEND-JPEG-BYTES" * 4)
    return str(p)


def _rec(img, **kw):
    base = dict(image_path=img, role="ANSWER_KEY", model_id="claude-opus-4-8",
                prompt_version="v1", raw_response="{...}", parsed={"rows": []})
    base.update(kw)
    return vs.record(**base)


def test_record_roundtrips_and_hashes_the_image(store, img):
    r = _rec(img)
    assert r["image_sha256"] == vs.sha256_file(img)
    assert os.path.exists(os.path.join(vs.STORE_DIR, r["blob"]))
    assert len(vs.read_all()) == 1


def test_idempotent_same_image_is_not_stored_twice(store, img):
    assert _rec(img) is not None
    assert _rec(img) is None, "second call on identical bytes must be skipped"
    assert len(vs.read_all()) == 1


def test_same_image_different_ROLE_is_a_different_question(store, img):
    """ROLE IS THE QUESTION, not a label. A forest plot is BOTH an ANSWER_KEY
    (its 2x2 cells) and a BEHAVIOURAL_RECORD (its inclusion list). Both must be
    storable off the same pixels. Keying idempotency on sha alone silently
    refused the second — that was a real bug, caught 2026-07-16."""
    assert _rec(img, role="ANSWER_KEY") is not None
    assert _rec(img, role="BEHAVIOURAL_RECORD") is not None, \
        "a second ROLE on the same image must be storable"
    assert len(vs.read_all()) == 2
    # ...but a re-run of EITHER is still a no-op
    assert _rec(img, role="ANSWER_KEY") is None
    assert _rec(img, role="BEHAVIOURAL_RECORD") is None
    assert len(vs.read_all()) == 2


def test_behavioural_record_is_a_valid_role(store, img):
    r = _rec(img, role="BEHAVIOURAL_RECORD")
    assert r["role"] == "BEHAVIOURAL_RECORD"


def test_different_bytes_are_a_different_call(store, img, tmp_path):
    _rec(img)
    other = tmp_path / "fig2.jpg"
    other.write_bytes(b"\xff\xd8\xff\xe0DIFFERENT")
    assert _rec(str(other)) is not None
    assert len(vs.read_all()) == 2


# --- RED: the guards must bite -------------------------------------------

def test_bad_role_is_refused(store, img):
    """Role cannot be reconstructed later => must be refused at write time."""
    with pytest.raises(ValueError, match="role must be one of"):
        _rec(img, role="whatever")


def test_role_is_required_no_silent_default(store, img):
    with pytest.raises(TypeError):
        vs.record(image_path=img, model_id="m", prompt_version="v",
                  raw_response="x")


def test_missing_raw_response_is_refused(store, img):
    """A parsed-only record destroys the evidence the call was bought for."""
    with pytest.raises(ValueError, match="raw_response is required"):
        _rec(img, raw_response=None)


def test_missing_image_is_refused(store):
    with pytest.raises(FileNotFoundError):
        _rec("does-not-exist.jpg")


def test_verify_fails_when_a_blob_is_altered(store, img, capsys):
    r = _rec(img)
    blob = os.path.join(vs.STORE_DIR, r["blob"])
    with open(blob, "ab") as fh:
        fh.write(b"TAMPERED")
    assert vs.verify() == 1, "verify must FAIL on an altered blob"
    assert "HASH MISMATCH" in capsys.readouterr().out


def test_verify_fails_when_a_blob_is_deleted(store, img, capsys):
    r = _rec(img)
    os.remove(os.path.join(vs.STORE_DIR, r["blob"]))
    assert vs.verify() == 1, "verify must FAIL on a missing blob"
    assert "BLOB MISSING" in capsys.readouterr().out


def test_verify_passes_on_a_clean_store(store, img):
    _rec(img)
    assert vs.verify() == 0


# --- cost honesty ---------------------------------------------------------

def test_cost_basis_is_marked_unmeasurable_when_tokens_absent(store, img):
    """The subagent route cannot see per-image billing. It must say so, never
    estimate. A remembered pixels->tokens formula is the folklore we cure."""
    r = _rec(img)
    assert r["tokens_in"] is None and r["cost_usd"] is None
    assert r["cost_basis"] == "unmeasurable_subagent_route"


def test_cost_basis_is_measured_when_tokens_supplied(store, img):
    r = _rec(img, tokens_in=1200, tokens_out=800, cost_usd=0.0261)
    assert r["cost_basis"] == "measured"


# --- gradient is first-class ---------------------------------------------

def test_confidence_gradient_is_extracted_from_study_rows_only(store, img):
    parsed = {"rows": [
        {"row_type": "study", "confidence": "high"},
        {"row_type": "study", "confidence": "high"},
        {"row_type": "study", "confidence": "low"},
        {"row_type": "total", "confidence": "high"},   # not a study => excluded
    ]}
    r = _rec(img, parsed=parsed)
    assert r["confidence_emitted"] == {"high": 2, "low": 1}


def test_raw_response_survives_a_parser_that_returns_nothing(store, img):
    """If the parse is wrong we re-parse from raw; we do NOT re-buy the call."""
    r = _rec(img, parsed=None, raw_response="VERBATIM MODEL TEXT")
    assert r["raw_response"] == "VERBATIM MODEL TEXT"
    assert r["parsed"] is None


def test_corrupt_ledger_line_does_not_hide_the_rest(store, img, tmp_path):
    _rec(img)
    with open(vs.LEDGER, "a", encoding="utf-8") as fh:
        fh.write("{not json\n")
    other = tmp_path / "f3.jpg"
    other.write_bytes(b"\xff\xd8XYZ")
    assert _rec(str(other)) is not None, "a corrupt line must not break idempotency"
