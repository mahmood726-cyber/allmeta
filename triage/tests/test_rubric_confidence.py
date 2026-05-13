from triage.rubric import confidence


def test_confidence_high_when_all_signals_present():
    sig = {"stub_count": 0, "has_index": True, "total_size_kb": 50.0,
           "last_touched_unix": 1714512000, "is_hub_linked": True,
           "featured_rank": 1, "category": "X", "kind": "numerical",
           "test_count": 5, "has_r_parity": True, "playwright_pass": True,
           "has_readme": True}
    assert confidence(sig) == "high"


def test_confidence_medium_with_some_nulls():
    sig = {"stub_count": 0, "has_index": True, "total_size_kb": 50.0,
           "last_touched_unix": None, "is_hub_linked": True,
           "featured_rank": None, "category": None, "kind": "numerical",
           "test_count": 0, "has_r_parity": False, "playwright_pass": None,
           "has_readme": False}
    assert confidence(sig) == "medium"


def test_confidence_low_when_most_null():
    sig = {"stub_count": 0, "has_index": False, "total_size_kb": 0.0,
           "last_touched_unix": None, "is_hub_linked": False,
           "featured_rank": None, "category": None, "kind": "numerical",
           "test_count": 0, "has_r_parity": False, "playwright_pass": None,
           "has_readme": False}
    assert confidence(sig) == "low"
