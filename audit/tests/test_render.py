import csv
import json
from pathlib import Path
from audit.render import render_json, render_csv, render_md, render_html, totals


def _record(key, state):
    return {
        "key": key,
        "url": f"./{key}/index.html",
        "state": state,
        "confidence": "high",
        "reasons": ["loaded in 642 ms"],
        "probe": {
            "load_ok": True,
            "timed_out": False,
            "load_time_ms": 642,
            "console_errors": [],
            "mount_found": True,
            "ui_text_matches": [],
            "probe_crashed": False,
        },
    }


def test_totals_counts_each_state():
    records = [_record("a", "OK"), _record("b", "OK"), _record("c", "NEEDS-SERVICE")]
    t = totals(records)
    assert t["OK"] == 2
    assert t["NEEDS-SERVICE"] == 1
    assert t["total"] == 3


def test_render_json(tmp_path):
    records = [_record("forest-plot", "OK"), _record("rct-extractor", "NEEDS-SERVICE")]
    out = tmp_path / "runtime-health.json"
    render_json(records, out, audit_version="0.1.0", now_iso="2026-05-13T10:30:00Z")
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["audit_version"] == "0.1.0"
    assert payload["totals"]["total"] == 2
    assert payload["apps"]["forest-plot"]["state"] == "OK"
    assert payload["apps"]["rct-extractor"]["state"] == "NEEDS-SERVICE"


def test_render_csv(tmp_path):
    records = [_record("a", "OK"), _record("b", "CONSOLE-ERRORS")]
    out = tmp_path / "runtime-health.csv"
    render_csv(records, out)
    rows = list(csv.DictReader(out.read_text(encoding="utf-8").splitlines()))
    assert len(rows) == 2
    assert rows[0]["app"] == "a"
    assert rows[0]["state"] == "OK"
    assert rows[1]["state"] == "CONSOLE-ERRORS"


def test_render_md_sections_in_state_order(tmp_path):
    records = [_record("a", "OK"), _record("b", "UNKNOWN"), _record("c", "NEEDS-SERVICE")]
    out = tmp_path / "runtime-health.md"
    render_md(records, out, audit_version="0.1.0", now_iso="2026-05-13T10:30:00Z")
    text = out.read_text(encoding="utf-8")
    # UNKNOWN appears in the markdown body before NEEDS-SERVICE before OK
    i_unknown = text.index("UNKNOWN")
    i_needs = text.index("NEEDS-SERVICE")
    # OK comes last; find the "## OK" section header specifically
    i_ok = text.rindex("OK")
    assert i_unknown < i_needs < i_ok


def test_render_html_self_contained(tmp_path):
    records = [_record("forest-plot", "OK"), _record("rct-extractor", "NEEDS-SERVICE")]
    out = tmp_path / "runtime-health.html"
    render_html(records, out, audit_version="0.1.0", now_iso="2026-05-13T10:30:00Z")
    html = out.read_text(encoding="utf-8")
    assert "<!doctype html>" in html.lower()
    assert "forest-plot" in html
    assert "rct-extractor" in html
    assert "http://" not in html and "https://" not in html
