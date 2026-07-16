"""JATS parsing — structured tables (with column headers) + reference PMIDs.

Why this module exists: BioC linearises a table into tab-separated text, which
destroys the column headers. Without headers a regex cannot tell an events/N cell
from an 80/20 train-test split or a 5405/3395 male/female count — which is exactly
why the text-scoped detectors were false-positive-dominated. The efetch JATS tier
preserves <table-wrap>/<thead>/<th>, so a cell can be attributed to its column and
tested only when the column actually means "events over participants".

Handles the JATS shapes efetch actually ships: header cells may live in <thead> or
in the first <tr> as <th>; rows may carry @colspan (we expand) and stub columns.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET


def _text(el) -> str:
    """All descendant text of an element, whitespace-collapsed."""
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


def _cells(tr) -> list[tuple[str, bool]]:
    """(text, is_header) per cell, expanding @colspan so column indices line up."""
    out: list[tuple[str, bool]] = []
    for c in tr:
        tag = c.tag.split("}")[-1]
        if tag not in ("td", "th"):
            continue
        try:
            span = max(1, min(int(c.get("colspan", "1")), 40))
        except ValueError:
            span = 1
        val = (_text(c), tag == "th")
        out.extend([val] * span)
    return out


def parse_tables(xml_bytes: bytes) -> list[dict]:
    """Return [{label, caption, headers[], rows[[str]]}] for each <table-wrap>."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []
    tables = []
    for tw in root.iter():
        if tw.tag.split("}")[-1] != "table-wrap":
            continue
        label = caption = ""
        for ch in tw:
            t = ch.tag.split("}")[-1]
            if t == "label":
                label = _text(ch)
            elif t == "caption":
                caption = _text(ch)

        rows: list[list[str]] = []
        headers: list[str] = []
        for tr in tw.iter():
            if tr.tag.split("}")[-1] != "tr":
                continue
            cs = _cells(tr)
            if not cs:
                continue
            if not headers and all(h for _, h in cs):
                headers = [v for v, _ in cs]      # a pure-<th> row = the header
            else:
                rows.append([v for v, _ in cs])
        tables.append({"label": label, "caption": caption,
                       "headers": headers, "rows": rows})
    return tables


def ref_pmids(xml_bytes: bytes) -> set[str]:
    """PMIDs from <ref-list>: <pub-id pub-id-type="pmid">12345678</pub-id>."""
    out: set[str] = set()
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return out
    for el in root.iter():
        if el.tag.split("}")[-1] != "pub-id":
            continue
        if (el.get("pub-id-type") or "").lower() == "pmid":
            v = (el.text or "").strip()
            if v.isdigit():
                out.add(v)
    return out


def all_text(xml_bytes: bytes) -> str:
    try:
        return _text(ET.fromstring(xml_bytes))
    except ET.ParseError:
        return ""
