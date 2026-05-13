"""Top-level CLI for the runtime-health auditor.

python audit/runtime_health.py [--workers 4] [--timeout 30] [--repo-root .]
"""

from __future__ import annotations
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Reuse the projects.js parser shipped in Cycle 1.
sys.path.insert(0, str(Path(__file__).parent.parent))
from triage.projects_js import load_projects  # noqa: E402

from audit import classifier, render

AUDIT_VERSION = "0.1.0"

# Windows-aware command resolution: on Windows, npx is npx.cmd and subprocess
# needs shell=True with a string command. On POSIX, use the list form.
_IS_WINDOWS = os.name == "nt"


def _select_in_repo_apps(projects: list[dict], repo_root: Path) -> list[dict]:
    """Keep only apps with a local-path entry whose folder exists on disk."""
    out = []
    for p in projects:
        path = p.get("path") or ""
        if not path.startswith("./"):
            continue
        key = p.get("key")
        if not key:
            continue
        if (repo_root / key).is_dir():
            out.append({"key": key, "path": path})
    return out


def _run_probe(audit_dir: Path, apps: list[dict], workers: int, timeout_s: int) -> Path:
    """Launch the Playwright probe via npx; returns the path to the JSONL output."""
    env = {**os.environ,
           "ALM_AUDIT_APPS_JSON": json.dumps(apps),
           "ALM_AUDIT_WORKERS": str(workers),
           "ALM_AUDIT_TIMEOUT_MS": str(timeout_s * 1000)}
    output_path = audit_dir / ".probe-output.jsonl"
    if output_path.exists():
        output_path.unlink()

    cmd = f"npx playwright test probe.spec.mjs --reporter=line --workers={workers}"
    overall_timeout = max(300, timeout_s * len(apps) // workers + 60)
    proc = subprocess.run(
        cmd,
        cwd=str(audit_dir),
        env=env,
        shell=_IS_WINDOWS,  # Windows needs shell=True for npx.cmd
        capture_output=False,
        text=True,
        timeout=overall_timeout,
    )
    if proc.returncode != 0:
        # The probe spec always asserts true, so a non-zero exit means an infra
        # failure — fail closed.
        raise RuntimeError(f"Playwright probe exited {proc.returncode}; cannot continue.")
    return output_path


def _build_record(raw: dict) -> dict:
    """Combine raw probe observation + classifier verdict into the final record."""
    verdict = classifier.classify(raw)
    return {
        "key": raw["key"],
        "url": raw["url"],
        "state": verdict["state"],
        "confidence": verdict["confidence"],
        "reasons": verdict["reasons"],
        "probe": raw,
    }


def main(*, repo_root: Path, workers: int = 4, timeout_s: int = 30) -> int:
    audit_dir = Path(__file__).parent
    now_unix = int(time.time())
    now_iso = datetime.fromtimestamp(now_unix, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    all_projects = load_projects(repo_root / "hub" / "projects.js")
    apps = _select_in_repo_apps(all_projects, repo_root)
    if not apps:
        print("No in-repo apps found.")
        return 1

    print(f"Probing {len(apps)} apps with {workers} workers (per-app timeout {timeout_s}s)...")
    output_path = _run_probe(audit_dir, apps, workers, timeout_s)

    records = []
    seen = set()
    if output_path.exists():
        for line in output_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            raw = json.loads(line)
            records.append(_build_record(raw))
            seen.add(raw["key"])

    # Any apps that didn't appear in the JSONL → probe crashed for them.
    for app in apps:
        if app["key"] not in seen:
            crash = {"key": app["key"], "url": app["path"],
                     "probe_crashed": True, "load_ok": False, "timed_out": False,
                     "load_time_ms": None, "console_errors": [],
                     "mount_found": False, "ui_text_matches": []}
            records.append(_build_record(crash))

    records.sort(key=lambda r: r["key"].lower())

    render.render_json(records, repo_root / "runtime-health.json",
                       audit_version=AUDIT_VERSION, now_iso=now_iso)
    render.render_csv(records, repo_root / "runtime-health.csv")
    render.render_md(records, repo_root / "runtime-health.md",
                     audit_version=AUDIT_VERSION, now_iso=now_iso)
    render.render_html(records, repo_root / "runtime-health.html",
                       audit_version=AUDIT_VERSION, now_iso=now_iso)

    t = render.totals(records)
    print(f"OK · auditor v{AUDIT_VERSION} · " +
          " · ".join(f"{s}: {t[s]}" for s in render.STATE_ORDER) +
          f" · total: {t['total']}")
    return 0


def _cli() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=".", help="allmeta repo root")
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--timeout", type=int, default=30, help="per-app timeout in seconds")
    args = p.parse_args()
    return main(repo_root=Path(args.repo_root).resolve(),
                workers=args.workers,
                timeout_s=args.timeout)


if __name__ == "__main__":
    raise SystemExit(_cli())
