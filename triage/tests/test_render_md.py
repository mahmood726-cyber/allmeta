from pathlib import Path
from triage.render import render_md


def _r(key, tier, conf="high"):
    return {"key": key, "tier": tier, "auto_tier": tier, "override": None,
            "kind": "numerical", "confidence": conf,
            "reasons": ["x"], "signals": {}}


def test_render_md_sections_in_order(tmp_path):
    records = [_r("a", 1), _r("b", 3), _r("c", 5), _r("d", 2, "low")]
    out = tmp_path / "triage.md"
    render_md(records, out, scanner_version="0.1.0", now_iso="2026-05-13T10:30:00Z")
    text = out.read_text(encoding="utf-8")
    # Find the section headers (marked by ##)
    i5 = text.index("## Tier 5")
    i1 = text.index("## Tier 1")
    i_low = text.index("## Low-confidence")
    assert i5 < i1 < i_low
    assert "a" in text and "b" in text and "c" in text
    assert "d" in text  # low-confidence section listing
