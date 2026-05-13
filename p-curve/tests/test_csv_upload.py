"""Integration smoke tests: csv-upload module wiring in p-curve index.html."""
import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_csv_upload_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/csv-upload.js' in html, "csv-upload script tag missing"
    assert 'id="alm-csv-mount"' in html, "csv-upload mount div missing"


def test_csv_upload_columns_match_engine():
    """The alm.csvUpload init block must declare study and p columns."""
    html = INDEX.read_text(encoding="utf-8")
    assert re.search(r"name:\s*['\"]study['\"]", html), "csv column 'study' missing"
    assert re.search(r"name:\s*['\"]p['\"]",     html), "csv column 'p' missing"


def test_csv_load_adapter_populates_textarea():
    """The __almLoad adapter must put data into the #src textarea."""
    html = INDEX.read_text(encoding="utf-8")
    assert "__almLoad" in html, "__almLoad adapter function missing"
    assert "src" in html, "textarea #src reference missing from __almLoad adapter"
