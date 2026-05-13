import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_csv_upload_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/csv-upload.js' in html
    assert 'id="alm-csv-mount"' in html


def test_csv_upload_required_columns_match_engine():
    # study/yi/vi required; covariates pass through as extra columns
    html = INDEX.read_text(encoding="utf-8")
    assert re.search(r"name:\s*['\"]study['\"]", html)
    assert re.search(r"name:\s*['\"]yi['\"]", html)
    assert re.search(r"name:\s*['\"]vi['\"]", html)
