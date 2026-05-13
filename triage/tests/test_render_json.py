import json
from pathlib import Path
import jsonschema
from triage.render import render_json

def _record(key, tier=1):
    return {
        "key": key, "tier": tier, "auto_tier": tier, "override": None,
        "kind": "numerical", "confidence": "high",
        "reasons": ["test_count=5"],
        "signals": {"stub_count": 0, "test_count": 5},
    }

def test_render_json_writes_valid_artifact(tmp_path):
    records = [_record("forest-plot", 1), _record("Truthcert1", 4)]
    out = tmp_path / "triage.json"
    render_json(records, out, scanner_version="0.1.0", now_iso="2026-05-13T10:30:00Z")
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["scanner_version"] == "0.1.0"
    assert payload["totals"]["tier_1"] == 1
    assert payload["totals"]["tier_4"] == 1
    assert payload["totals"]["total"] == 2
    schema_path = Path(__file__).parent.parent / "schema" / "triage.schema.json"
    jsonschema.validate(payload, json.loads(schema_path.read_text(encoding="utf-8")))
