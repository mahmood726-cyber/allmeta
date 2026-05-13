"""Emit triage.{json,csv,md,html} from per-app records."""

from __future__ import annotations
from pathlib import Path
from typing import Iterable
import json


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
