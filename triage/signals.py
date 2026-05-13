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
