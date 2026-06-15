"""
md2pdf.py -- dependency-light Markdown -> PDF builder (reportlab only).

A small, self-contained renderer for the manuscript Markdown subset used by the
truth-recovery compendia: ATX headings (#..####), paragraphs, **bold**, *italic*,
`inline code`, fenced ```code``` blocks, GitHub pipe tables, ordered / unordered
lists, blockquotes (>), horizontal rules (---), images ![alt](path) and links
[text](url).

This exists because the build hosts have neither pandoc nor a LaTeX toolchain;
reportlab is the one PDF dependency that is reliably installed. The output is a
clean, page-numbered A4 PDF -- a faithful, reproducible rendering of the
manuscript that anyone can regenerate with

    python tools/md2pdf.py paper/manuscript.md paper/manuscript.pdf

If pandoc IS available, the Makefile `paper-pandoc` target produces a
journal-styled PDF instead; this module guarantees a PDF either way.
"""
from __future__ import annotations

import html
import os
import re
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
_BASE = getSampleStyleSheet()


def _styles():
    s = {}
    s["body"] = ParagraphStyle("body", parent=_BASE["BodyText"], fontName="Times-Roman",
                               fontSize=10, leading=14, spaceAfter=6, alignment=4)
    s["h1"] = ParagraphStyle("h1", parent=_BASE["Heading1"], fontName="Times-Bold",
                             fontSize=17, leading=21, spaceBefore=14, spaceAfter=8)
    s["h2"] = ParagraphStyle("h2", parent=_BASE["Heading2"], fontName="Times-Bold",
                             fontSize=13, leading=17, spaceBefore=12, spaceAfter=6)
    s["h3"] = ParagraphStyle("h3", parent=_BASE["Heading3"], fontName="Times-Bold",
                             fontSize=11, leading=15, spaceBefore=10, spaceAfter=4)
    s["h4"] = ParagraphStyle("h4", parent=_BASE["Heading4"], fontName="Times-Italic",
                             fontSize=10, leading=14, spaceBefore=8, spaceAfter=3)
    s["quote"] = ParagraphStyle("quote", parent=s["body"], leftIndent=18,
                                textColor=colors.HexColor("#444444"),
                                fontName="Times-Italic")
    s["code"] = ParagraphStyle("code", parent=_BASE["Code"], fontName="Courier",
                               fontSize=8.5, leading=11, backColor=colors.HexColor("#f4f4f4"),
                               borderPadding=5, spaceAfter=6, leftIndent=4)
    s["li"] = ParagraphStyle("li", parent=s["body"], leftIndent=16, bulletIndent=4,
                             spaceAfter=2)
    s["cell"] = ParagraphStyle("cell", parent=s["body"], fontSize=8.5, leading=11,
                               spaceAfter=0, alignment=TA_LEFT if False else 0)
    s["cellh"] = ParagraphStyle("cellh", parent=s["cell"], fontName="Times-Bold")
    return s


_INLINE_CODE = re.compile(r"`([^`]+)`")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_ITAL = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def _inline(text: str) -> str:
    """Convert inline markdown to reportlab mini-HTML, escaping first."""
    # protect inline code spans from escaping the rest
    parts = []
    last = 0
    for m in _INLINE_CODE.finditer(text):
        parts.append(("t", text[last:m.start()]))
        parts.append(("c", m.group(1)))
        last = m.end()
    parts.append(("t", text[last:]))

    out = []
    for kind, chunk in parts:
        if kind == "c":
            out.append('<font face="Courier" size="8.5">%s</font>' % html.escape(chunk))
            continue
        esc = html.escape(chunk)
        esc = _BOLD.sub(r"<b>\1</b>", esc)
        esc = _ITAL.sub(r"<i>\1</i>", esc)
        esc = _LINK.sub(r'<link href="\2" color="blue">\1</link>', esc)
        out.append(esc)
    return "".join(out)


def _split_row(line: str):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def _is_table_sep(line: str) -> bool:
    return bool(re.match(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$", line))


def build(md_path: str, pdf_path: str, title: str | None = None):
    with open(md_path, encoding="utf-8") as f:
        lines = f.read().split("\n")

    s = _styles()
    flow = []
    i = 0
    n = len(lines)

    def flush_para(buf):
        if buf:
            flow.append(Paragraph(_inline(" ".join(buf)), s["body"]))
            buf.clear()

    para_buf: list[str] = []

    while i < n:
        line = lines[i]
        stripped = line.strip()

        # fenced code
        if stripped.startswith("```"):
            flush_para(para_buf)
            i += 1
            code = []
            while i < n and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            i += 1
            esc = html.escape("\n".join(code)).replace(" ", "&nbsp;").replace("\n", "<br/>")
            flow.append(Paragraph(esc, s["code"]))
            continue

        # table
        if "|" in line and i + 1 < n and _is_table_sep(lines[i + 1]):
            flush_para(para_buf)
            header = _split_row(line)
            i += 2
            rows = []
            while i < n and "|" in lines[i] and lines[i].strip():
                rows.append(_split_row(lines[i]))
                i += 1
            data = [[Paragraph(_inline(c), s["cellh"]) for c in header]]
            for r in rows:
                while len(r) < len(header):
                    r.append("")
                data.append([Paragraph(_inline(c), s["cell"]) for c in r[:len(header)]])
            ncol = len(header)
            avail = A4[0] - 4 * cm
            tbl = Table(data, colWidths=[avail / ncol] * ncol, repeatRows=1)
            tbl.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#bbbbbb")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ]))
            flow.append(Spacer(1, 4))
            flow.append(tbl)
            flow.append(Spacer(1, 6))
            continue

        # image  ![alt](path)
        mimg = re.match(r"^!\[[^\]]*\]\(([^)]+)\)\s*$", stripped)
        if mimg:
            flush_para(para_buf)
            path = mimg.group(1)
            if not os.path.isabs(path):
                path = os.path.join(os.path.dirname(os.path.abspath(md_path)), path)
            if os.path.exists(path):
                avail = A4[0] - 4 * cm
                try:
                    from reportlab.lib.utils import ImageReader
                    iw, ih = ImageReader(path).getSize()
                    w = min(avail, iw)
                    h = w * ih / iw
                    flow.append(Spacer(1, 4))
                    flow.append(Image(path, width=w, height=h))
                    flow.append(Spacer(1, 6))
                except Exception:
                    pass
            i += 1
            continue

        # horizontal rule
        if re.match(r"^\s*(-{3,}|\*{3,}|_{3,})\s*$", line):
            flush_para(para_buf)
            from reportlab.platypus import HRFlowable
            flow.append(Spacer(1, 4))
            flow.append(HRFlowable(width="100%", thickness=0.6,
                                   color=colors.HexColor("#999999")))
            flow.append(Spacer(1, 6))
            i += 1
            continue

        # headings
        mh = re.match(r"^(#{1,4})\s+(.*)$", line)
        if mh:
            flush_para(para_buf)
            level = len(mh.group(1))
            txt = mh.group(2).strip()
            if level == 1 and not flow:
                flow.append(Spacer(1, 6))
            flow.append(Paragraph(_inline(txt), s[f"h{level}"]))
            i += 1
            continue

        # blockquote
        if stripped.startswith(">"):
            flush_para(para_buf)
            flow.append(Paragraph(_inline(stripped.lstrip("> ").rstrip()), s["quote"]))
            i += 1
            continue

        # lists
        mul = re.match(r"^\s*[-*+]\s+(.*)$", line)
        mol = re.match(r"^\s*(\d+)\.\s+(.*)$", line)
        if mul:
            flush_para(para_buf)
            flow.append(Paragraph(_inline(mul.group(1)), s["li"], bulletText="•"))
            i += 1
            continue
        if mol:
            flush_para(para_buf)
            flow.append(Paragraph(_inline(mol.group(2)), s["li"],
                                  bulletText=mol.group(1) + "."))
            i += 1
            continue

        # blank line -> paragraph break
        if not stripped:
            flush_para(para_buf)
            i += 1
            continue

        para_buf.append(stripped)
        i += 1

    flush_para(para_buf)

    def _footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Times-Roman", 8)
        canvas.setFillColor(colors.HexColor("#888888"))
        canvas.drawCentredString(A4[0] / 2, 1.0 * cm, f"{doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(pdf_path, pagesize=A4,
                            leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm,
                            title=title or os.path.basename(md_path))
    doc.build(flow, onFirstPage=_footer, onLaterPages=_footer)
    return pdf_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: python md2pdf.py <input.md> <output.pdf> [title]")
        sys.exit(2)
    title = sys.argv[3] if len(sys.argv) > 3 else None
    out = build(sys.argv[1], sys.argv[2], title)
    print("wrote", out)
