import re
from triage.render import render_html


def _r(key, tier):
    return {"key": key, "tier": tier, "auto_tier": tier, "override": None,
            "kind": "numerical", "confidence": "high",
            "reasons": ["x"], "signals": {"stub_count": 0, "test_count": 5}}


def test_render_html_contains_table_and_data(tmp_path):
    records = [_r("forest-plot", 1), _r("Truthcert1", 4)]
    out = tmp_path / "triage.html"
    render_html(records, out, scanner_version="0.1.0", now_iso="2026-05-13T10:30:00Z")
    html = out.read_text(encoding="utf-8")
    assert "<!doctype html>" in html.lower()
    assert "forest-plot" in html
    assert "Truthcert1" in html
    # No external resources
    assert "http://" not in html and "https://" not in html
    # Embedded data is JSON-safe (no </script> in template literals)
    assert "</script>" not in html.split("<script", 1)[1].rsplit("</script>", 1)[0]
