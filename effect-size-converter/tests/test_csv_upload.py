"""Integration smoke tests: csv-upload module wiring in effect-size-converter index.html."""
import re
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_csv_upload_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert "hub/shared/csv-upload.js" in html, "csv-upload script tag missing"
    assert 'id="alm-csv-mount"' in html, "csv-upload mount div missing"


def test_csv_upload_columns_match_smd_mode():
    """The SMD-from-means column spec must declare all 6 input fields."""
    html = INDEX.read_text(encoding="utf-8")
    for col in ("m1", "sd1", "n1", "m2", "sd2", "n2"):
        assert re.search(rf"name:\s*['\"]" + col + r"['\"]", html), \
            f"csv-upload column '{col}' not declared in init call"


def test_csv_upload_mount_is_in_input_panel():
    """csv mount must appear inside the main input fieldset, not the results panel."""
    html = INDEX.read_text(encoding="utf-8")
    csv_pos = html.find('id="alm-csv-mount"')
    convert_btn_pos = html.find('id="btn-convert"')
    assert csv_pos != -1, "alm-csv-mount div missing"
    assert convert_btn_pos != -1, "btn-convert missing"
    # The csv mount is above the results section
    assert csv_pos < convert_btn_pos, \
        "alm-csv-mount should appear in the input panel (before btn-convert)"
