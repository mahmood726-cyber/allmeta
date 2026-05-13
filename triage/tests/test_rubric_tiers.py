import time
from triage.rubric import assign_tier

NOW = 1715000000  # 2026-05-06 UTC for math

def _sig(**over):
    base = {
        "stub_count": 0, "has_index": True, "total_size_kb": 80.0,
        "last_touched_unix": NOW - 30*86400, "is_hub_linked": True,
        "featured_rank": None, "category": "Pairwise MA", "kind": "numerical",
        "test_count": 5, "has_r_parity": True, "playwright_pass": True,
        "has_readme": True,
    }
    base.update(over)
    return base

def test_tier5_missing_index():
    assert assign_tier(_sig(has_index=False), now_unix=NOW)[0] == 5

def test_tier5_high_stub_count():
    assert assign_tier(_sig(stub_count=6), now_unix=NOW)[0] == 5

def test_tier4_any_stub():
    assert assign_tier(_sig(stub_count=1), now_unix=NOW)[0] == 4

def test_tier4_playwright_fail():
    assert assign_tier(_sig(playwright_pass=False), now_unix=NOW)[0] == 4

def test_tier4_too_small():
    assert assign_tier(_sig(total_size_kb=5.0), now_unix=NOW)[0] == 4

def test_tier3_no_tests():
    assert assign_tier(_sig(test_count=0), now_unix=NOW)[0] == 3

def test_tier3_missing_r_parity_when_numerical():
    assert assign_tier(_sig(has_r_parity=False), now_unix=NOW)[0] == 3

def test_tier3_no_readme():
    assert assign_tier(_sig(has_readme=False), now_unix=NOW)[0] == 3

def test_tier3_stale():
    assert assign_tier(_sig(last_touched_unix=NOW - 400*86400), now_unix=NOW)[0] == 3

def test_tier1_validated():
    assert assign_tier(_sig(), now_unix=NOW)[0] == 1

def test_tier1_non_numerical_no_r_parity_ok():
    sig = _sig(kind="non-numerical", has_r_parity=False, category="Reporting")
    assert assign_tier(sig, now_unix=NOW)[0] == 1

def test_tier2_working_when_not_hub_linked():
    sig = _sig(is_hub_linked=False)
    assert assign_tier(sig, now_unix=NOW)[0] == 2

def test_tier2_working_low_test_count():
    sig = _sig(test_count=2)
    assert assign_tier(sig, now_unix=NOW)[0] == 2

def test_reasons_included():
    tier, reasons = assign_tier(_sig(stub_count=2), now_unix=NOW)
    assert any("stub_count" in r for r in reasons)
