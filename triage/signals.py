"""Signal extractors. Each function takes a Path to an app folder and returns a
single signal value. Functions fail soft (return null-equivalent) on missing
data; they fail closed (raise) only on operator error."""

from __future__ import annotations
from pathlib import Path
import re

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
