"""Parse hub/projects.js without executing JS. Tolerates the trailing comma /
single-quote / no-quotes-on-keys idioms that show up in this file."""

from __future__ import annotations
from pathlib import Path
import json
import re
from urllib.parse import urlparse


def path_to_key(path: str) -> str:
    """Canonical app key = folder name. Strips ./ prefix and /index.html suffix.
    For http(s) URLs, uses the last non-empty path segment."""
    if not path:
        return ""
    if path.startswith(("http://", "https://")):
        parts = [p for p in urlparse(path).path.split("/") if p]
        return parts[-1] if parts else ""
    p = path
    if p.startswith("./"):
        p = p[2:]
    if p.endswith("/index.html"):
        p = p[: -len("/index.html")]
    return p.strip("/").split("/")[0]


_ARRAY_RE = re.compile(r"window\.HTML_APPS_PROJECTS\s*=\s*(\[.*?\]);?\s*$", re.DOTALL)


def _js_to_json(blob: str) -> str:
    """Best-effort JS-object-literal -> JSON. Quotes bare keys, swaps single-quoted
    string delimiters to double quotes, strips trailing commas before } or ].

    Handles the apostrophe-in-double-quoted-string case: bare apostrophes that appear
    inside already-double-quoted JS strings (e.g. ``"Cook's distance"``) must NOT be
    converted to double-quotes. We do a state-machine scan instead of a blanket replace.
    Does not handle template literals.
    """
    blob = re.sub(r"/\*.*?\*/", "", blob, flags=re.DOTALL)
    blob = re.sub(r"(^|\s)//[^\n]*", "", blob)
    blob = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', blob)
    blob = _swap_single_quoted_strings(blob)
    blob = re.sub(r",(\s*[}\]])", r"\1", blob)
    return blob


def _swap_single_quoted_strings(blob: str) -> str:
    """Replace single-quote string delimiters with double-quotes while leaving
    apostrophes that appear inside double-quoted strings untouched.

    Strategy: walk character by character tracking whether we are inside a
    double-quoted string or a single-quoted string.  Only emit ``"`` for the
    opening/closing single-quote of a single-quoted string; leave bare apostrophes
    inside double-quoted strings as-is (they are valid JSON content).
    """
    result: list[str] = []
    i = 0
    n = len(blob)
    in_dq = False  # inside a "..." string
    in_sq = False  # inside a '...' string

    while i < n:
        ch = blob[i]

        if ch == "\\" and (in_dq or in_sq):
            # Escape sequence — emit as-is and skip next char
            result.append(ch)
            i += 1
            if i < n:
                result.append(blob[i])
                i += 1
            continue

        if ch == '"' and not in_sq:
            in_dq = not in_dq
            result.append(ch)
            i += 1
            continue

        if ch == "'" and not in_dq:
            # Single-quote delimiter → emit double-quote
            in_sq = not in_sq
            result.append('"')
            i += 1
            continue

        # Plain character (may be apostrophe inside a double-quoted string — keep it)
        result.append(ch)
        i += 1

    return "".join(result)


def load_projects(projects_js: Path) -> list[dict]:
    text = projects_js.read_text(encoding="utf-8", errors="replace")
    m = _ARRAY_RE.search(text)
    if not m:
        raise ValueError(f"Could not locate window.HTML_APPS_PROJECTS = [...] in {projects_js}")
    arr = json.loads(_js_to_json(m.group(1)))
    rows = []
    for entry in arr:
        key = path_to_key(entry.get("path", ""))
        rows.append({
            "key": key,
            "name": entry.get("name", ""),
            "path": entry.get("path", ""),
            "category": entry.get("category"),
            "subcategory": entry.get("subcategory"),
            "featured": bool(entry.get("featured")),
            "featuredRank": entry.get("featuredRank"),
            "mode": entry.get("mode"),
            "collection": entry.get("collection"),
        })
    return rows
