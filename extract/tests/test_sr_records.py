"""Contract tests for shared/sr-records-v1.js — the canonical record bus.

Two guards:
  1. The shared normalizeRecord / envelope behave correctly (run in Node).
  2. Cross-app drift guard: Search / Screen / Extract all still use this exact
     key + {records:[]} envelope, and the shared canonical shape matches the
     field set screen's normalizeImported emits (the richest producer). If any
     app renames the key/envelope or the shapes diverge, this fails.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")

PRELUDE = "const R = require('./shared/sr-records-v1.js');\n"


def _run(script: str) -> dict:
    r = subprocess.run([NODE, "-e", PRELUDE + script], capture_output=True, text=True,
                       timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_normalize_coerces_fields():
    o = _run(
        "const rec=R.normalizeRecord({title:'  A   trial ',abstract:'x',"
        "authors:'Smith J; Doe A and Roe B',year:'Published 2019 online',"
        "doi:'https://doi.org/10.1/AbC',pmid:' 123 ',keywords:['k1','k2'],"
        "aiSuggestion:'include',aiConfidence:0.8,dup:1,resolved:'include'});"
        "console.log(JSON.stringify(rec));"
    )
    assert o["title"] == "A trial"
    assert o["authors"] == ["Smith J", "Doe A", "Roe B"]
    assert o["year"] == "2019"                       # 4-digit extracted
    assert o["doi"] == "10.1/AbC"                     # doi.org prefix stripped, case kept
    assert o["pmid"] == "123"
    assert o["dup"] is True                            # coerced to bool
    assert o["aiSuggestion"] == "include"
    assert o["aiConfidence"] == 0.8
    assert o["resolved"] == "include"
    # always-present decision slots
    assert o["r1"] == {"d": "", "reason": ""} and o["r2"] == {"d": "", "reason": ""}


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_bad_ai_suggestion_dropped_and_id_minted():
    o = _run(
        "const rec=R.normalizeRecord({title:'t',aiSuggestion:'banana'});"
        "console.log(JSON.stringify({ai:rec.aiSuggestion,hasId:!!rec.id,conf:rec.aiConfidence}));"
    )
    assert o["ai"] == ""              # only include/exclude/maybe survive
    assert o["hasId"] is True         # freshId minted when absent
    assert o["conf"] is None          # non-numeric confidence -> null


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_registry_linkage_fields_survive_the_bus():
    # Regression: before nct/url/ctgovUrl/abstractSource/mergedSources were added
    # to the shared normaliser, a record Screen wrote with a trial-registry link
    # lost those fields when Extract read it back through normalizeRecord() —
    # silent data loss of a typed identifier (NCT). They must round-trip.
    o = _run(
        "const rec=R.normalizeRecord({title:'t',nct:'NCT01234567',"
        "url:'https://pubmed.ncbi.nlm.nih.gov/1/',ctgovUrl:'https://clinicaltrials.gov/study/NCT01234567',"
        "abstractSource:'ctgov',mergedSources:['pubmed','ctgov', '']});"
        "console.log(JSON.stringify(rec));"
    )
    assert o["nct"] == "NCT01234567"                       # explicit nct preserved (clean, no re-case)
    assert o["url"] == "https://pubmed.ncbi.nlm.nih.gov/1/"
    assert o["ctgovUrl"] == "https://clinicaltrials.gov/study/NCT01234567"
    assert o["abstractSource"] == "ctgov"
    assert o["mergedSources"] == ["pubmed", "ctgov"]        # blanks filtered


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_nct_recovered_from_id_when_field_absent():
    # Mirror screen: an NCT id embedded in the record id is recovered into nct.
    o = _run(
        "const rec=R.normalizeRecord({title:'t',id:'NCT09876543'});"
        "console.log(JSON.stringify({nct:rec.nct,ms:rec.mergedSources}));"
    )
    assert o["nct"] == "NCT09876543"
    assert o["ms"] is None                                  # absent mergedSources -> null


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_envelope_roundtrip():
    o = _run(
        "const env=R.buildEnvelope([{title:'a'},{title:'b'}],'2026-01-01T00:00:00Z');"
        "console.log(JSON.stringify({schema:env._schema,saved:env._savedAt,n:env.records.length,"
        "isEnv:R.isEnvelope(env),notEnv:R.isEnvelope({foo:1})}));"
    )
    assert o["schema"] == "sr-records-v1"
    assert o["saved"] == "2026-01-01T00:00:00Z"
    assert o["n"] == 2
    assert o["isEnv"] is True and o["notEnv"] is False


# ---- cross-app drift guard (pure, no node needed) ----

APPS = ["search", "screen", "extract"]


def _app_html(name: str) -> str:
    return (ROOT / name / "index.html").read_text(encoding="utf-8")


def test_all_apps_use_the_same_key_and_envelope():
    for name in APPS:
        h = _app_html(name)
        assert "sr-records-v1" in h, f"{name} dropped the sr-records-v1 key"
        assert re.search(r"\.records\b", h) or "records:" in h, f"{name} dropped the records envelope field"


def test_extract_adopts_the_shared_module():
    h = _app_html("extract")
    assert "../shared/sr-records-v1.js" in h
    assert "SrRecords.read" in h


def test_shared_shape_matches_screen_normalizer():
    # Pull the object-literal field keys from screen's normalizeImported and the
    # shared normalizeRecord; the canonical shape must be a superset of screen's
    # (no field screen relies on may silently vanish from the shared module).
    shared = (ROOT / "shared" / "sr-records-v1.js").read_text(encoding="utf-8")
    screen = _app_html("screen")

    def keys(src: str, anchor: str) -> set:
        i = src.index(anchor)
        # Window must span the whole returned object literal in BOTH files. The
        # canonical shape grew (trial-registry linkage fields nct/url/ctgovUrl/
        # abstractSource/mergedSources), pushing the last keys past the old 1400
        # budget; 2000 covers the full object in shared (~1890) and screen (~1780).
        block = src[i: i + 2000]
        # top-level "key:" tokens inside the returned object literal
        return set(re.findall(r"\n\s{6,}([a-zA-Z][a-zA-Z0-9]*)\s*:", block))

    shared_keys = keys(shared, "function normalizeRecord")
    screen_keys = keys(screen, "function normalizeImported")
    missing = screen_keys - shared_keys
    assert not missing, f"shared sr-records-v1 is missing screen fields: {sorted(missing)}"
