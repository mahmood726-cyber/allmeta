from triage.rubric import apply_override

def test_override_replaces_tier_preserves_auto():
    record = {"key": "foo", "auto_tier": 2, "tier": 2, "override": None,
              "reasons": ["working"], "kind": "numerical"}
    out = apply_override(record, override={"tier": 4, "reason": "stubs"})
    assert out["tier"] == 4
    assert out["auto_tier"] == 2
    assert out["override"] == {"tier": 4, "reason": "stubs"}
    assert "override applied: stubs" in out["reasons"]

def test_override_kind_only_does_not_change_tier():
    record = {"key": "x", "auto_tier": 1, "tier": 1, "override": None,
              "reasons": [], "kind": "numerical"}
    out = apply_override(record, override={"kind": "non-numerical", "reason": "UI tool"})
    assert out["tier"] == 1
    assert out["kind"] == "non-numerical"

def test_no_override_passthrough():
    record = {"key": "x", "auto_tier": 1, "tier": 1, "override": None,
              "reasons": [], "kind": "numerical"}
    out = apply_override(record, override=None)
    assert out is record
