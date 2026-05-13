import pytest
from triage.overrides import load_overrides


def test_load_overrides_good(fixtures_root):
    ov = load_overrides(fixtures_root / "overrides-good.yaml")
    assert ov["Truthcert1"]["tier"] == 4
    assert ov["Truthcert1"]["reason"] == "Known stubs in app.min.js"
    assert ov["prisma-flow"]["kind"] == "non-numerical"


def test_load_overrides_parses_live_file(fixtures_root):
    # Smoke-test: the live triage-overrides.yaml loads without error and
    # returns a dict (may be empty or populated as curated overrides evolve).
    ov = load_overrides(fixtures_root.parent.parent / "triage-overrides.yaml")
    assert isinstance(ov, dict)


def test_load_overrides_bad_tier_fails_closed(fixtures_root):
    with pytest.raises(ValueError, match=r"tier"):
        load_overrides(fixtures_root / "overrides-bad-tier.yaml")


def test_load_overrides_missing_file_returns_empty(tmp_path):
    assert load_overrides(tmp_path / "nope.yaml") == {}
