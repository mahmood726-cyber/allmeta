#!/usr/bin/env python3
"""Build machine-readable release readiness summary from benchmark/test artifacts."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VALIDATION_DIR = ROOT / "tests" / "release_validation_2026-02-28"
DEFAULT_OUTPUT_PATH = DEFAULT_VALIDATION_DIR / "release_readiness_summary.json"


def extract(pattern: str, text: str, cast: Callable[[str], Any], default: Any = None) -> Any:
    match = re.search(pattern, text, re.MULTILINE)
    if not match:
        return default
    return cast(match.group(1))


def read_text(path: Path) -> str:
    raw = path.read_bytes()
    if b"\x00" in raw:
        try:
            return raw.decode("utf-16")
        except UnicodeDecodeError:
            return raw.decode("utf-16-le", errors="replace")
    return raw.decode("utf-8", errors="replace")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def build_summary(validation_dir: Path) -> dict[str, Any]:
    app_log_path = validation_dir / "test_dose_response_app.log"
    main_log_path = validation_dir / "test_dose_response_main.log"
    selenium_log_path = validation_dir / "selenium_full_test.log"

    app_log = read_text(app_log_path)
    main_log = read_text(main_log_path)
    selenium_log = read_text(selenium_log_path)

    summary: dict[str, Any] = {
        "validation_date": "2026-02-28",
        "gui_test_runs": {
            "test_dose_response_app.py": {
                "total": extract(r"Total Tests:\s*(\d+)", app_log, int),
                "passed": extract(r"Passed:\s*(\d+)", app_log, int),
                "failed": extract(r"Failed:\s*(\d+)", app_log, int),
                "success_rate_pct": extract(r"Success Rate:\s*([0-9.]+)%", app_log, float),
                "log_path": str(app_log_path),
            },
            "test_dose_response_main.py": {
                "total": extract(r"Total Tests:\s*(\d+)", main_log, int),
                "passed": extract(r"Passed:\s*(\d+)", main_log, int),
                "failed": extract(r"Failed:\s*(\d+)", main_log, int),
                "warnings": extract(r"Warnings:\s*(\d+)", main_log, int),
                "duration_seconds": extract(r"Duration:\s*([0-9.]+)\s*seconds", main_log, float),
                "log_path": str(main_log_path),
            },
            "selenium_full_test.py": {
                "total": extract(r"Total Tests:\s*(\d+)", selenium_log, int),
                "passed": extract(r"Passed:\s*(\d+)", selenium_log, int),
                "failed": extract(r"Failed:\s*(\d+)", selenium_log, int),
                "pass_rate_pct": extract(r"Pass Rate:\s*([0-9.]+)%", selenium_log, float),
                "log_path": str(selenium_log_path),
            },
        },
    }

    totals = []
    passes = []
    fails = []
    for run_summary in summary["gui_test_runs"].values():
        totals.append(int(run_summary.get("total") or 0))
        passes.append(int(run_summary.get("passed") or 0))
        fails.append(int(run_summary.get("failed") or 0))

    summary["gui_aggregate"] = {
        "total_tests": sum(totals),
        "passed_tests": sum(passes),
        "failed_tests": sum(fails),
        "all_passed": all(v == 0 for v in fails),
    }

    cross = load_json(ROOT / "tests" / "cross_package_benchmark_results.json")
    strict = load_json(ROOT / "tests" / "strict_beat_r_benchmark_results.json")

    summary["benchmarks"] = {
        "r_validation": cross.get("r_summary"),
        "simulation": cross.get("simulation_summary"),
        "strict_r": cross.get("strict_r_benchmark_summary"),
        "vote_counts": cross.get("vote_counts"),
        "stata_evidence": cross.get("stata_evidence"),
        "spss_evidence": cross.get("spss_evidence"),
        "cross_package_generated_at": cross.get("generated_at"),
        "strict_benchmark_generated_at": strict.get("generated_at"),
    }

    vote_counts = cross.get("vote_counts") or {}
    yes_votes = int(vote_counts.get("YES", 0))
    strict_summary = cross.get("strict_r_benchmark_summary") or {}
    r_summary = cross.get("r_summary") or {}
    summary["release_readiness"] = {
        "ready_to_release": bool(
            summary["gui_aggregate"]["all_passed"] and strict_summary.get("beats_r") and yes_votes >= 11
        ),
        "ready_to_submit_rsm": bool(
            summary["gui_aggregate"]["all_passed"]
            and r_summary.get("overall_pass")
            and strict_summary.get("beats_r")
        ),
        "full_unconditional_12_of_12": yes_votes >= 12,
        "remaining_condition": (
            "Local executable SPSS/Stata benchmark artifacts are still missing; "
            "current evidence uses internet-reference fallback."
        ),
    }

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Build release readiness summary JSON.")
    parser.add_argument(
        "--validation-dir",
        type=Path,
        default=DEFAULT_VALIDATION_DIR,
        help="Directory containing GUI test log files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Output JSON path.",
    )
    args = parser.parse_args()

    summary = build_summary(args.validation_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
        f.write("\n")

    print(f"Wrote release readiness summary: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
