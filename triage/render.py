"""Emit triage.{json,csv,md,html} from per-app records."""

from __future__ import annotations
from pathlib import Path
from typing import Iterable
import json
import csv


def _totals(records: list[dict]) -> dict[str, int]:
    out = {f"tier_{i}": 0 for i in range(1, 6)}
    for r in records:
        out[f"tier_{r['tier']}"] += 1
    out["total"] = len(records)
    return out


def render_json(records: list[dict], out_path: Path, *, scanner_version: str, now_iso: str) -> None:
    payload = {
        "scanner_version": scanner_version,
        "generated_at": now_iso,
        "totals": _totals(records),
        "apps": {r["key"]: {k: v for k, v in r.items() if k != "key"} for r in records},
    }
    out_path.write_text(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False), encoding="utf-8")


_CSV_COLS = (
    "app", "tier", "auto_tier", "kind", "confidence",
    "stub_count", "test_count", "has_r_parity", "last_touched_days",
    "total_size_kb", "is_hub_linked", "featured_rank", "reasons",
)


def _record_to_csv_row(r: dict) -> dict:
    s = r.get("signals", {})
    return {
        "app": r["key"],
        "tier": r["tier"],
        "auto_tier": r["auto_tier"],
        "kind": r["kind"],
        "confidence": r["confidence"],
        "stub_count": s.get("stub_count"),
        "test_count": s.get("test_count"),
        "has_r_parity": s.get("has_r_parity"),
        "last_touched_days": s.get("last_touched_days"),
        "total_size_kb": s.get("total_size_kb"),
        "is_hub_linked": s.get("is_hub_linked"),
        "featured_rank": s.get("featured_rank"),
        "reasons": " | ".join(r.get("reasons", [])),
    }


def render_csv(records: list[dict], out_path: Path) -> None:
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(_CSV_COLS))
        w.writeheader()
        for r in records:
            w.writerow(_record_to_csv_row(r))
