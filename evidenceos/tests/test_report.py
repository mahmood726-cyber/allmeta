"""EvidenceOS report contract tests."""

from __future__ import annotations

import json
from pathlib import Path
import re


APP_DIR = Path(__file__).resolve().parents[1]
REPORT = APP_DIR / "data" / "report.json"


def load_report() -> dict:
    return json.loads(REPORT.read_text(encoding="utf-8"))


def test_report_schema_and_receipt():
    report = load_report()
    assert report["schema"] == "evidenceos.report.v0.1"
    assert re.fullmatch(r"[0-9a-f]{64}", report["truthcert"]["payload_hash"])
    assert re.fullmatch(r"[0-9a-f]{64}", report["source_hashes"]["ctgov"])
    assert re.fullmatch(r"[0-9a-f]{64}", report["source_hashes"]["openalex"])


def test_report_has_source_backed_evidence_surface():
    report = load_report()
    summary = report["summary"]
    assert summary["core_trials"] >= 1
    assert summary["randomized_trials"] >= 1
    assert summary["completed_with_results"] >= 1
    assert summary["publication_candidates"] >= 1
    assert summary["oa_publication_candidates"] >= 1
    assert summary["verdict"]


def test_trials_have_typed_source_ids_and_urls():
    report = load_report()
    for trial in report["trials"]:
        assert re.fullmatch(r"NCT\d{8}", trial["nct_id"]), trial["nct_id"]
        assert trial["ctgov_url"] == f"https://clinicaltrials.gov/study/{trial['nct_id']}"
        assert isinstance(trial["has_results"], bool)
        assert isinstance(trial["is_randomized"], bool)


def test_no_clinical_effect_is_inferred():
    report = load_report()
    disclosure = {item["item"]: item["status"] for item in report["hardcode_disclosure"]}
    assert disclosure["Clinical effect estimates"] == "not inferred"
    forbidden_keys = {"effect_estimate", "pooled_effect", "hazard_ratio", "odds_ratio", "risk_ratio"}

    def walk(value):
        if isinstance(value, dict):
            for key, child in value.items():
                assert key not in forbidden_keys, key
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(report)


def test_committed_evidenceos_files_do_not_embed_local_paths_or_placeholders():
    scanned = [
        APP_DIR / "README.md",
        APP_DIR / "index.html",
        APP_DIR / "app.js",
        APP_DIR / "styles.css",
        APP_DIR / "src" / "evidenceos_engine.py",
        APP_DIR / "scripts" / "build_report.py",
        REPORT,
    ]
    forbidden = [
        "C" + ":\\",
        "D" + ":\\",
        "/mnt/" + "c",
        "/mnt/" + "d",
        "PLACE" + "HOLDER",
        "{" + "{",
    ]
    for path in scanned:
        text = path.read_text(encoding="utf-8")
        assert not any(token in text for token in forbidden), path
