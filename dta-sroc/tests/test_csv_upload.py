"""CSV upload wiring tests for dta-sroc retrofit."""
import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_csv_upload_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert "hub/shared/csv-upload.js" in html, "csv-upload script tag missing"
    assert 'id="alm-csv-mount"' in html, "csv-upload mount div missing"


def test_csv_upload_columns_match_engine():
    # DTA-SROC input columns: study, TP, FP, FN, TN (2×2 cell counts)
    html = INDEX.read_text(encoding="utf-8")
    assert re.search(r"name:\s*['\"]study['\"]", html), "study column missing from csv-upload config"
    assert re.search(r"name:\s*['\"]TP['\"]", html), "TP column missing from csv-upload config"
    assert re.search(r"name:\s*['\"]FP['\"]", html), "FP column missing from csv-upload config"
