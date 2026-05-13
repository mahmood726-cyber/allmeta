"""Top-level CLI orchestrator. Loads projects.js, extracts signals, assigns tiers,
applies overrides, and renders 4 artifacts (json, csv, md, html)."""

from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
import argparse
import time

from triage import signals as S
from triage import rubric as R
from triage import render
from triage.overrides import load_overrides
from triage.projects_js import load_projects

SCANNER_VERSION = "0.1.0"


def main(
    *,
    repo_root: Path,
    overrides_path: Path | None,
    playwright_report_path: Path | None,
    runtime_health_path: Path | None = None,
    now_unix: int | None = None,
) -> None:
    """Orchestrate: load projects → extract signals → assign tiers → apply overrides → render artifacts.

    Args:
        repo_root: path to the allmeta repo root (contains hub/ folder)
        overrides_path: path to triage-overrides.yaml (None = no overrides)
        playwright_report_path: path to playwright report JSON (None = no playwright data)
        runtime_health_path: path to runtime-health.json (None = no runtime data; backward-compat)
        now_unix: current timestamp (Unix seconds; default = time.time())
    """
    now_unix = now_unix or int(time.time())
    now_iso = datetime.fromtimestamp(now_unix, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    overrides = load_overrides(overrides_path) if overrides_path else {}
    projects = load_projects(repo_root / "hub" / "projects.js")
    pw_report = S.load_playwright_report(playwright_report_path) if playwright_report_path else None
    # Cycle 4.1: auto-discover runtime-health.json at repo root if not explicitly supplied.
    if runtime_health_path is None:
        candidate = repo_root / "runtime-health.json"
        runtime_health_path = candidate if candidate.is_file() else None
    rh_data = S.load_runtime_health(runtime_health_path) if runtime_health_path else None

    records: list[dict] = []
    for proj in projects:
        app_dir = repo_root / proj["key"]
        if not app_dir.is_dir():
            # External URL apps or moved folders — skip silently
            continue

        sig = S.extract_signals(
            app_dir=app_dir,
            repo_root=repo_root,
            project_meta=proj,
            playwright_report=pw_report,
            runtime_health=rh_data,
        )

        # Compute last_touched_days for CSV / dashboard
        if sig["last_touched_unix"] is not None:
            sig["last_touched_days"] = (now_unix - sig["last_touched_unix"]) // 86400
        else:
            sig["last_touched_days"] = None

        # Cycle 4.1: pre-apply kind override so assign_tier sees the correct kind
        # (e.g. "informational") before runtime-health demotion rules fire.
        app_override = overrides.get(proj["key"])
        if app_override and "kind" in app_override:
            sig["kind"] = app_override["kind"]

        tier, reasons = R.assign_tier(sig, now_unix=now_unix)
        record = {
            "key": proj["key"],
            "tier": tier,
            "auto_tier": tier,
            "override": None,
            "kind": sig["kind"],
            "confidence": R.confidence(sig),
            "reasons": reasons,
            "signals": sig,
        }
        R.apply_override(record, override=overrides.get(proj["key"]))
        records.append(record)

    render.render_json(
        records,
        repo_root / "triage.json",
        scanner_version=SCANNER_VERSION,
        now_iso=now_iso,
    )
    render.render_csv(records, repo_root / "triage.csv")
    render.render_md(
        records,
        repo_root / "triage.md",
        scanner_version=SCANNER_VERSION,
        now_iso=now_iso,
    )
    render.render_html(
        records,
        repo_root / "triage.html",
        scanner_version=SCANNER_VERSION,
        now_iso=now_iso,
    )


def _cli() -> int:
    """Command-line entry point."""
    p = argparse.ArgumentParser(description="allmeta triage scanner")
    p.add_argument("--repo-root", default=".", help="allmeta repo root (default: current dir)")
    p.add_argument("--overrides", default="triage/triage-overrides.yaml",
                   help="path to triage-overrides.yaml (default: triage/triage-overrides.yaml)")
    p.add_argument("--playwright-report", default=None,
                   help="path to playwright report JSON (optional)")
    p.add_argument("--runtime-health", default=None,
                   help="path to runtime-health.json (optional; auto-discovered at repo root)")
    args = p.parse_args()

    main(
        repo_root=Path(args.repo_root).resolve(),
        overrides_path=Path(args.overrides).resolve() if args.overrides else None,
        playwright_report_path=Path(args.playwright_report).resolve() if args.playwright_report else None,
        runtime_health_path=Path(args.runtime_health).resolve() if args.runtime_health else None,
    )
    print(f"OK · scanner v{SCANNER_VERSION}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
