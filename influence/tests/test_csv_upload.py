"""Integration smoke tests: csv-upload module wiring in influence index.html."""
import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_csv_upload_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/csv-upload.js' in html, "csv-upload script tag missing"
    assert 'id="alm-csv-mount"' in html, "csv-upload mount div missing"


def test_csv_upload_columns_match_engine():
    """The alm.csvUpload init block must declare study, yi, vi columns."""
    html = INDEX.read_text(encoding="utf-8")
    assert re.search(r"name:\s*['\"]study['\"]", html), "csv column 'study' missing"
    assert re.search(r"name:\s*['\"]yi['\"]", html),    "csv column 'yi' missing"
    assert re.search(r"name:\s*['\"]vi['\"]", html),    "csv column 'vi' missing"


def test_csv_load_adapter_converts_vi_to_se():
    """The __almLoad adapter must convert vi -> sqrt(vi) when loading into the
    effect/SE textarea — assert the Math.sqrt call is present."""
    html = INDEX.read_text(encoding="utf-8")
    assert "Math.sqrt(r.vi)" in html or "Math.sqrt(" in html, \
        "__almLoad adapter must convert vi to SE via Math.sqrt"
