import csv
from triage.render import render_csv


def _record(key, tier):
    return {"key": key, "tier": tier, "auto_tier": tier, "override": None,
            "kind": "numerical", "confidence": "high",
            "reasons": ["test_count=5", "has R-parity"],
            "signals": {"stub_count": 0, "test_count": 5, "has_r_parity": True,
                        "last_touched_unix": 1715000000, "total_size_kb": 50.0,
                        "is_hub_linked": True, "featured_rank": 3}}


def test_render_csv_header_and_rows(tmp_path):
    records = [_record("a", 1), _record("b", 3)]
    out = tmp_path / "triage.csv"
    render_csv(records, out)
    rows = list(csv.DictReader(out.read_text(encoding="utf-8").splitlines()))
    assert len(rows) == 2
    assert rows[0]["app"] == "a"
    assert rows[0]["tier"] == "1"
    assert "test_count=5" in rows[0]["reasons"]
    assert "|" in rows[0]["reasons"]  # joined with ' | '
