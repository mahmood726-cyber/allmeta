"""Signal extractors. Each function takes a Path to an app folder and returns a
single signal value. Functions fail soft (return null-equivalent) on missing
data; they fail closed (raise) only on operator error."""

from __future__ import annotations
from pathlib import Path
import re
import subprocess

_STUB_PATTERNS = re.compile(
    r"\bTODO\b|\bstub\b|placeholder|REPLACE_ME|__PLACEHOLDER__|not implemented|"
    r"throw new Error\(.unimpl",
    re.IGNORECASE,
)

_SCAN_SUFFIXES = (".html", ".js", ".css", ".py", ".md")


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
