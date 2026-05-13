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
    """Best-effort JS-object-literal -> JSON. Quotes bare keys, swaps single quotes,
    strips trailing commas before } or ]. Does not handle template literals or comments."""
    blob = re.sub(r"/\*.*?\*/", "", blob, flags=re.DOTALL)
    blob = re.sub(r"(^|\s)//[^\n]*", "", blob)
    blob = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', blob)
    blob = blob.replace("'", '"')
    blob = re.sub(r",(\s*[}\]])", r"\1", blob)
    return blob


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
