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


def _span(c, attr: str) -> int:
    try:
        return max(1, min(int(c.get(attr, "1")), 40))
    except (ValueError, TypeError):
        return 1


def _cells(tr) -> list[tuple[str, bool]]:
    """(text, is_header) per cell, expanding @colspan so column indices line up."""
    out: list[tuple[str, bool]] = []
    for c in tr:
        tag = c.tag.split("}")[-1]
        if tag not in ("td", "th"):
            continue
        val = (_text(c), tag == "th")
        out.extend([val] * _span(c, "colspan"))
    return out


def _compose_header(head_rows) -> list[str]:
    """Flatten a MULTI-ROW header into one label per column.

    Why this is not a nicety: measured on our own harvested corpus, **37.9%** of
    tables have a <thead> with more than one <tr> (and 60.4% use colspan/rowspan
    somewhere). Taking only the first header row — which is what a naive parser
    does, and what ours did — gets both halves wrong at once:

        row 1  |        | Artemether-Lumefantrine |   Placebo   |   <- kept
        row 2  | Timept |  n (%)  |  N  |  n (%)  |  N  |         <- became DATA
                                                       ^^^^ a header row silently
                                                            entering the results

    So the column labels lose the arm names AND a fake data row appears. That is
    the direct cause of arm-assignment precision collapsing (reported 37.5%
    elsewhere): "n (%)" alone cannot tell you WHICH arm it belongs to — only the
    row above it can.

    Composition rules:
      * colspan expands horizontally (an arm name spanning 2 columns labels both)
      * rowspan fills downward (a stub label spanning 2 header rows labels both)
      * parts are joined top-to-bottom with " | ", empties dropped, dupes collapsed
        so "Placebo | Placebo" stays "Placebo"
    """
    if not head_rows:
        return []
    grid: list[list[str]] = []
    # (col_index -> remaining rowspan, text) carried down between header rows
    carry: dict[int, tuple[int, str]] = {}
    for tr in head_rows:
        row: list[str] = []
        col = 0
        cells = [c for c in tr if c.tag.split("}")[-1] in ("td", "th")]
        ci = 0
        while ci < len(cells) or col in carry:
            if col in carry:
                left, txt = carry[col]
                row.append(txt)
                if left - 1 > 0:
                    carry[col] = (left - 1, txt)
                else:
                    del carry[col]
                col += 1
                continue
            if ci >= len(cells):
                break
            c = cells[ci]
            ci += 1
            txt = _text(c)
            cs, rs = _span(c, "colspan"), _span(c, "rowspan")
            for _ in range(cs):
                row.append(txt)
                if rs > 1:
                    carry[col] = (rs - 1, txt)
                col += 1
        grid.append(row)

    width = max((len(r) for r in grid), default=0)
    out: list[str] = []
    for i in range(width):
        parts: list[str] = []
        for r in grid:
            v = (r[i] if i < len(r) else "").strip()
            if v and (not parts or parts[-1] != v):
                parts.append(v)
        out.append(" | ".join(parts))
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

        # A row is the header row if it is a pure-<th> row OR if it lives inside
        # <thead> at all. The <thead> arm is not belt-and-braces: PLOS — one of
        # the largest OA publishers — marks up header rows as
        # <thead><tr><td>…</td></tr></thead>, using <td>, not <th>. Keying only
        # on <th> silently returns headers=[] for every PLOS table and demotes
        # the real header into `rows` as if it were data. Measured on the first
        # 12 OA trial papers harvested here: 39 of 40 tables came back
        # header-less, and column-semantic detection is impossible without the
        # header (that is the entire reason the JATS tier is preferred over BioC).
        # ALL <thead> rows are header rows — not just the first. Measured on our
        # own corpus, 37.9% of tables carry a multi-row <thead>; keeping only row
        # 1 loses the arm names AND injects the remaining header rows into the
        # data as if they were results. See _compose_header.
        head_trs: list = []
        head_ids = set()
        for sect in tw.iter():
            if sect.tag.split("}")[-1] == "thead":
                for tr in sect.iter():
                    if tr.tag.split("}")[-1] == "tr":
                        head_trs.append(tr)
                        head_ids.add(id(tr))

        rows: list[list[str]] = []
        headers: list[str] = []
        if head_trs:
            headers = _compose_header(head_trs)
        for tr in tw.iter():
            if tr.tag.split("}")[-1] != "tr":
                continue
            if id(tr) in head_ids:
                continue                      # already consumed as header
            cs = _cells(tr)
            if not cs:
                continue
            # No <thead>: a LEADING all-<th> row is the header. Only leading —
            # an all-<th> row further down is a section divider, not the header,
            # and promoting it would silently drop a data row.
            if not headers and not rows and all(h for _, h in cs):
                headers = [v for v, _ in cs]
            else:
                rows.append([v for v, _ in cs])
        # The raw <table-wrap> fragment travels with the parsed form. Two
        # reasons, both learned the hard way:
        #  1. Downstream extractors take `tables_xml=` and do their own, better
        #     parsing. Handing them our lossy summary throws away the 25-38pp of
        #     extraction they measured they could get from the real markup
        #     (malaria 50.0->79.2%, TB 20.7->51.2%, NCD 23.3->61.7%).
        #  2. A store that keeps only shape (n_rows/n_cols/headers) and drops the
        #     CELLS is not a table store. Ours held 37,850 tables describing
        #     647,445 rows and zero values.
        try:
            raw = ET.tostring(tw, encoding="unicode")
        except Exception:
            raw = ""
        tables.append({"label": label, "caption": caption,
                       "headers": headers, "rows": rows, "xml": raw})
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
