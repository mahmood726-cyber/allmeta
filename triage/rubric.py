"""Tier-assignment rubric for allmeta triage atlas. See spec §3."""

from __future__ import annotations

STUB_REBUILD_THRESHOLD: int = 6
MIN_TESTS_FOR_VALIDATED: int = 3
STALE_DAYS: int = 365
MIN_VALIDATED_SIZE_KB: float = 10.0


def assign_tier(sig: dict, *, now_unix: int) -> tuple[int, list[str]]:
    """Returns (tier, reasons). First-match-wins, top-down."""
    reasons: list[str] = []

    if not sig["has_index"]:
        reasons.append("missing index.html")
        return 5, reasons
    if (sig["stub_count"] or 0) >= STUB_REBUILD_THRESHOLD:
        reasons.append(f"stub_count={sig['stub_count']} (>= {STUB_REBUILD_THRESHOLD})")
        return 5, reasons

    if (sig["stub_count"] or 0) >= 1:
        reasons.append(f"stub_count={sig['stub_count']}")
        return 4, reasons
    if sig["playwright_pass"] is False:
        reasons.append("playwright failing")
        return 4, reasons
    if (sig["total_size_kb"] or 0.0) < MIN_VALIDATED_SIZE_KB:
        reasons.append(f"total_size_kb={sig['total_size_kb']} (< {MIN_VALIDATED_SIZE_KB})")
        return 4, reasons

    needs_parity = sig["kind"] == "numerical"
    parity_ok = (not needs_parity) or bool(sig["has_r_parity"])
    fresh = sig["last_touched_unix"] is None or (now_unix - sig["last_touched_unix"]) <= STALE_DAYS * 86400

    polish = []
    if (sig["test_count"] or 0) == 0:
        polish.append("no tests")
    if not parity_ok:
        polish.append("no R-parity test")
    if sig["last_touched_unix"] is not None and not fresh:
        age_days = (now_unix - sig["last_touched_unix"]) // 86400
        polish.append(f"last_touched {age_days}d ago")
    if not sig["has_readme"]:
        polish.append("no README")
    if polish:
        reasons.extend(polish)
        return 3, reasons

    if (
        (sig["test_count"] or 0) >= MIN_TESTS_FOR_VALIDATED
        and parity_ok
        and fresh
        and bool(sig["is_hub_linked"])
    ):
        reasons.append(f"test_count={sig['test_count']}")
        if sig["has_r_parity"]:
            reasons.append("has R-parity test")
        if sig["last_touched_unix"]:
            reasons.append(f"last_touched {(now_unix - sig['last_touched_unix']) // 86400}d ago")
        return 1, reasons

    reasons.append("working — no flags")
    return 2, reasons


def confidence(sig: dict) -> str:
    """Heuristic confidence in the tier assignment. 12 signals total."""
    informative = 0
    if sig.get("has_index"):
        informative += 1
    if (sig.get("total_size_kb") or 0.0) > 0:
        informative += 1
    if sig.get("last_touched_unix") is not None:
        informative += 1
    if sig.get("is_hub_linked"):
        informative += 1
    if sig.get("category"):
        informative += 1
    if (sig.get("test_count") or 0) > 0:
        informative += 1
    if sig.get("has_r_parity"):
        informative += 1
    if sig.get("playwright_pass") is not None:
        informative += 1
    if sig.get("has_readme"):
        informative += 1
    if sig.get("kind"):
        informative += 1
    # stub_count is always informative (even at 0)
    informative += 1
    # featured_rank: count only if present
    if sig.get("featured_rank") is not None:
        informative += 1
    if informative >= 8:
        return "high"
    if informative >= 4:
        return "medium"
    return "low"


def apply_override(record: dict, *, override: dict | None) -> dict:
    """Mutates record in place to apply override, preserving auto_tier."""
    if not override:
        return record
    if "tier" in override:
        record["tier"] = override["tier"]
    if "kind" in override:
        record["kind"] = override["kind"]
    record["override"] = dict(override)
    record["reasons"].append(f"override applied: {override.get('reason', '')}".strip(": "))
    return record
