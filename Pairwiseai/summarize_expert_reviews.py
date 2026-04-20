#!/usr/bin/env python3
"""Summarize expert review scores and adoption votes from CSV."""

from __future__ import annotations

import csv
import statistics
import sys
from collections import Counter
from pathlib import Path


DOMAINS = [
    "score_statistical_correctness",
    "score_estimator_coverage",
    "score_bias_diagnostics",
    "score_advanced_methods",
    "score_reproducibility",
    "score_usability",
    "score_reporting_ready",
    "score_regulatory_hta_ready",
]


def to_float(value: str) -> float | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def load_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def summarize(rows: list[dict[str, str]]) -> int:
    completed = [r for r in rows if (r.get("adoption_vote") or "").strip()]

    print(f"Total rows: {len(rows)}")
    print(f"Completed votes: {len(completed)}")

    votes = Counter((r.get("adoption_vote") or "").strip().lower() for r in completed)
    print("\nAdoption votes:")
    print(f"  Adopt now: {votes.get('adopt now', 0)}")
    print(f"  Pilot first: {votes.get('pilot first', 0)}")
    print(f"  Not now: {votes.get('not now', 0)}")

    weighted_totals = [to_float(r.get("weighted_total", "")) for r in completed]
    weighted_totals = [x for x in weighted_totals if x is not None]
    if weighted_totals:
        print("\nWeighted total score:")
        print(f"  Mean: {statistics.mean(weighted_totals):.2f}")
        if len(weighted_totals) > 1:
            print(f"  SD: {statistics.stdev(weighted_totals):.2f}")
        print(f"  Min: {min(weighted_totals):.2f}")
        print(f"  Max: {max(weighted_totals):.2f}")

    print("\nDomain means (1-5):")
    for domain in DOMAINS:
        values = [to_float(r.get(domain, "")) for r in completed]
        values = [x for x in values if x is not None]
        if values:
            print(f"  {domain}: {statistics.mean(values):.2f}")
        else:
            print(f"  {domain}: n/a")

    blocker_yes = 0
    for r in completed:
        flag = (r.get("critical_blocker_flag") or "").strip().lower()
        if flag in {"yes", "y", "true", "1"}:
            blocker_yes += 1
    print("\nCritical blocker flags:")
    print(f"  Yes: {blocker_yes}")
    print(f"  No/blank: {len(completed) - blocker_yes}")

    return 0


def main(argv: list[str]) -> int:
    if len(argv) > 2:
        print("Usage: summarize_expert_reviews.py [csv_path]", file=sys.stderr)
        return 2

    if len(argv) == 2:
        csv_path = Path(argv[1])
    else:
        csv_path = Path(__file__).resolve().parent / "EXPERT_SCORING_SHEET_TEMPLATE.csv"

    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 1

    rows = load_rows(csv_path)
    return summarize(rows)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
