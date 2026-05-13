"""Tests for Cycle 4.1: runtime_health signal + tier demotion rules."""
from __future__ import annotations
from pathlib import Path

import pytest

from triage.rubric import assign_tier
from triage.signals import load_runtime_health, runtime_health_state
from triage.overrides import load_overrides

NOW = 1715000000  # fixed epoch for determinism


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sig(**over):
    """Baseline signal dict that would normally reach Tier 1."""
    base = {
        "stub_count": 0,
        "has_index": True,
        "total_size_kb": 80.0,
        "last_touched_unix": NOW - 30 * 86400,
        "is_hub_linked": True,
        "featured_rank": None,
        "category": "Pairwise MA",
        "kind": "numerical",
        "test_count": 5,
        "has_r_parity": True,
        "playwright_pass": True,
        "has_readme": True,
        "runtime_health": None,
    }
    base.update(over)
    return base


FIXTURE_RH = Path(__file__).parent / "fixtures" / "runtime-health-fixture.json"


# ---------------------------------------------------------------------------
# load_runtime_health
# ---------------------------------------------------------------------------

def test_load_runtime_health_reads_fixture():
    data = load_runtime_health(FIXTURE_RH)
    assert isinstance(data, dict)
    assert "apps" in data
    assert data["apps"]["good-app"]["state"] == "OK"


def test_load_runtime_health_missing_file_returns_none(tmp_path):
    result = load_runtime_health(tmp_path / "does-not-exist.json")
    assert result is None


def test_load_runtime_health_bad_json_returns_none(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text("not valid json {{{{", encoding="utf-8")
    assert load_runtime_health(bad) is None


# ---------------------------------------------------------------------------
# runtime_health_state
# ---------------------------------------------------------------------------

def test_runtime_health_state_ok():
    data = load_runtime_health(FIXTURE_RH)
    assert runtime_health_state("good-app", data) == "OK"


def test_runtime_health_state_needs_service():
    data = load_runtime_health(FIXTURE_RH)
    assert runtime_health_state("rct-extractor", data) == "NEEDS-SERVICE"


def test_runtime_health_state_missing_mount():
    data = load_runtime_health(FIXTURE_RH)
    assert runtime_health_state("local-ai", data) == "MISSING-MOUNT"


def test_runtime_health_state_not_in_report_returns_none():
    data = load_runtime_health(FIXTURE_RH)
    assert runtime_health_state("no-such-app", data) is None


def test_runtime_health_state_none_data_returns_none():
    assert runtime_health_state("anything", None) is None


# ---------------------------------------------------------------------------
# assign_tier: runtime-health demotion rules
# ---------------------------------------------------------------------------

def test_runtime_health_needs_service_demotes_to_tier_4():
    sig = _sig(runtime_health="NEEDS-SERVICE")
    tier, reasons = assign_tier(sig, now_unix=NOW)
    assert tier == 4
    assert any("NEEDS-SERVICE" in r for r in reasons)


def test_runtime_health_console_errors_demotes_to_tier_4():
    sig = _sig(runtime_health="CONSOLE-ERRORS")
    tier, reasons = assign_tier(sig, now_unix=NOW)
    assert tier == 4
    assert any("CONSOLE-ERRORS" in r for r in reasons)


def test_runtime_health_missing_mount_demotes_to_tier_4_non_informational():
    sig = _sig(runtime_health="MISSING-MOUNT")
    # default kind="numerical" — not informational → demote
    tier, reasons = assign_tier(sig, now_unix=NOW)
    assert tier == 4
    assert any("MISSING-MOUNT" in r for r in reasons)


def test_runtime_health_missing_mount_no_demotion_for_informational():
    sig = _sig(runtime_health="MISSING-MOUNT", kind="informational")
    tier, _ = assign_tier(sig, now_unix=NOW)
    # informational pages with MISSING-MOUNT are not demoted; they fall through
    # to the existing polish/Tier-3 logic.  With a full baseline sig the result
    # reaches Tier 2 (not hub-linked check skipped; kind != "numerical" so no
    # parity check) — what matters is it is NOT 4.
    assert tier != 4


def test_runtime_health_timeout_demotes_to_tier_5():
    sig = _sig(runtime_health="TIMEOUT")
    tier, reasons = assign_tier(sig, now_unix=NOW)
    assert tier == 5
    assert any("TIMEOUT" in r for r in reasons)


def test_runtime_health_unknown_demotes_to_tier_5():
    sig = _sig(runtime_health="UNKNOWN")
    tier, reasons = assign_tier(sig, now_unix=NOW)
    assert tier == 5
    assert any("UNKNOWN" in r for r in reasons)


def test_runtime_health_ok_does_not_demote_validated_app():
    sig = _sig(runtime_health="OK")
    tier, _ = assign_tier(sig, now_unix=NOW)
    assert tier == 1


def test_runtime_health_none_does_not_demote_validated_app():
    sig = _sig(runtime_health=None)
    tier, _ = assign_tier(sig, now_unix=NOW)
    assert tier == 1


def test_runtime_health_needs_service_overrides_good_test_count():
    """Even a well-tested app is demoted if runtime is broken."""
    sig = _sig(test_count=10, has_r_parity=True, runtime_health="NEEDS-SERVICE")
    tier, _ = assign_tier(sig, now_unix=NOW)
    assert tier == 4


# ---------------------------------------------------------------------------
# overrides.py: informational kind is now accepted
# ---------------------------------------------------------------------------

def test_overrides_accepts_informational_kind(tmp_path):
    yaml_content = (
        "apps:\n"
        "  local-ai:\n"
        "    kind: informational\n"
        "    reason: 'Static info page'\n"
    )
    p = tmp_path / "overrides.yaml"
    p.write_text(yaml_content, encoding="utf-8")
    ov = load_overrides(p)
    assert ov["local-ai"]["kind"] == "informational"


def test_overrides_rejects_invalid_kind(tmp_path):
    yaml_content = (
        "apps:\n"
        "  foo:\n"
        "    kind: bogus-kind\n"
        "    reason: 'testing'\n"
    )
    p = tmp_path / "overrides.yaml"
    p.write_text(yaml_content, encoding="utf-8")
    with pytest.raises(ValueError, match=r"kind"):
        load_overrides(p)


# ---------------------------------------------------------------------------
# Live triage-overrides.yaml must load cleanly with informational entries
# ---------------------------------------------------------------------------

def test_live_overrides_loads_informational_entries(fixtures_root):
    live = fixtures_root.parent.parent / "triage-overrides.yaml"
    ov = load_overrides(live)
    assert "local-ai" in ov
    assert ov["local-ai"]["kind"] == "informational"
    assert "local-install" in ov
    assert ov["local-install"]["kind"] == "informational"
