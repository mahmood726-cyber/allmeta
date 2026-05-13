"""Signal extractors. Each function takes a Path to an app folder and returns a
single signal value. Functions fail soft (return null-equivalent) on missing
data; they fail closed (raise) only on operator error."""

from __future__ import annotations
from pathlib import Path
import json as _json
import re
import subprocess

_STUB_PATTERNS = re.compile(
    # Cycle 2.3 tightening:
    # - "placeholder" removed entirely: appears as HTML attribute, CSS pseudo-element
    #   (::placeholder), JS object property key (placeholder: "..."), JS variable name
    #   (const placeholder = ...) and comment prose across too many legitimate files to
    #   be a reliable stub signal.  __PLACEHOLDER__ (below) covers the actual unfilled-
    #   template-slot use-case.
    # - \bstub\b is restricted to non-.md files (see _SCAN_SUFFIXES).  Documentation
    #   markdown legitimately uses "stub" as English (e.g. "pandas stub", "stub_count").
    r"\bTODO\b|\bstub\b|REPLACE_ME|__PLACEHOLDER__|not implemented|"
    r"throw new Error\(.unimpl",
    re.IGNORECASE,
)

_SCAN_SUFFIXES = (".html", ".js", ".css", ".py")


def stub_count(app_dir: Path) -> int:
    """Count distinct stub markers across top-level source files."""
    if not app_dir.exists() or not app_dir.is_dir():
        return 0
    n = 0
    for p in app_dir.iterdir():
        if not p.is_file() or p.suffix.lower() not in _SCAN_SUFFIXES:
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        n += len(_STUB_PATTERNS.findall(text))
    return n


def has_index(app_dir: Path) -> bool:
    return (app_dir / "index.html").is_file()


def has_readme(app_dir: Path) -> bool:
    return (app_dir / "README.md").is_file()


def total_size_kb(app_dir: Path) -> float:
    """Sum of top-level index.html + *.js + *.css. Top level only (not recursive)."""
    if not app_dir.exists() or not app_dir.is_dir():
        return 0.0
    total = 0
    for p in app_dir.iterdir():
        if not p.is_file():
            continue
        if p.name == "index.html" or p.suffix.lower() in (".js", ".css"):
            try:
                total += p.stat().st_size
            except OSError:
                continue
    return round(total / 1024.0, 2)


def last_touched_unix(app_dir: Path, repo_root: Path) -> int | None:
    """Most recent commit timestamp touching this folder. None on failure."""
    try:
        res = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", str(app_dir.relative_to(repo_root))],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
        return None
    out = (res.stdout or "").strip()
    if not out:
        return None
    try:
        return int(out)
    except ValueError:
        return None


_PARITY_TOKENS = ("metafor", "_parity", "_against_r", "_compare_r", "mada", "netmeta_compare")


def _iter_test_files(app_dir: Path):
    tests = app_dir / "tests"
    if not tests.is_dir():
        return
    for p in tests.glob("test_*.py"):
        yield p
    for p in tests.glob("test_*.mjs"):
        yield p
    pw = tests / "playwright"
    if pw.is_dir():
        for p in pw.glob("*.spec.*"):
            yield p


def test_count(app_dir: Path) -> int:
    return sum(1 for _ in _iter_test_files(app_dir))


test_count.__test__ = False  # Prevent pytest from auto-collecting this signal extractor in test_*.py importers.


def has_r_parity(app_dir: Path) -> bool:
    for p in _iter_test_files(app_dir):
        name = p.name.lower()
        if any(tok in name for tok in _PARITY_TOKENS):
            return True
    return False


_NON_NUMERICAL_CATEGORIES = {
    "Reporting", "Screening & Extraction", "Search", "Planning",
    "Productivity", "Research Notes", "Qualitative Synthesis",
}


def load_playwright_report(report_path: Path) -> dict | None:
    if not report_path.is_file():
        return None
    try:
        return _json.loads(report_path.read_text(encoding="utf-8", errors="replace"))
    except (OSError, ValueError):
        return None


def playwright_pass(app_key: str, report: dict | None) -> bool | None:
    if not report:
        return None
    for suite in report.get("suites", []):
        if suite.get("title", "").lower() == app_key.lower():
            specs = suite.get("specs") or []
            if not specs:
                return None
            return all(bool(s.get("ok")) for s in specs)
    return None


def load_runtime_health(report_path: Path) -> dict | None:
    """Load runtime-health.json produced by Cycle 3.1 auditor.
    Returns the parsed dict on success or None on missing/malformed file."""
    if not report_path.is_file():
        return None
    try:
        return _json.loads(report_path.read_text(encoding="utf-8", errors="replace"))
    except (OSError, ValueError):
        return None


def runtime_health_state(app_key: str, runtime_data: dict | None) -> str | None:
    """Return the state string for app_key (e.g. 'OK', 'NEEDS-SERVICE') or
    None if the app is not present in the report or report is absent."""
    if not runtime_data:
        return None
    apps = runtime_data.get("apps") or {}
    entry = apps.get(app_key)
    if not entry:
        return None
    return entry.get("state") or None


def kind_from_category(category: str | None) -> str:
    if category and category in _NON_NUMERICAL_CATEGORIES:
        return "non-numerical"
    return "numerical"


def extract_signals(
    *,
    app_dir: Path,
    repo_root: Path,
    project_meta: dict | None,
    playwright_report: dict | None,
    runtime_health: dict | None = None,
) -> dict:
    """Compose all signals for a single app. Never raises; returns dict with
    nullable fields if a signal couldn't be computed."""
    key = (project_meta or {}).get("key") or app_dir.name
    cat = (project_meta or {}).get("category")
    return {
        "key": key,
        "stub_count": stub_count(app_dir),
        "has_index": has_index(app_dir),
        "has_readme": has_readme(app_dir),
        "total_size_kb": total_size_kb(app_dir),
        "last_touched_unix": last_touched_unix(app_dir, repo_root),
        "is_hub_linked": project_meta is not None,
        "featured_rank": (project_meta or {}).get("featuredRank"),
        "category": cat,
        "kind": kind_from_category(cat),
        "test_count": test_count(app_dir),
        "has_r_parity": has_r_parity(app_dir),
        "playwright_pass": playwright_pass(key, playwright_report),
        "runtime_health": runtime_health_state(key, runtime_health),
    }
