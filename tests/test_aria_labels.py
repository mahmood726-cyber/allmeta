"""Portfolio-wide guard: a labelled control's aria-label must match its visible label.

Pattern across the suite: <label><span class="lbl">VISIBLE</span><input|select|textarea
... aria-label="ARIA"> ...</label>. Because aria-label OVERRIDES the wrapping <label> in
the accessible-name computation, a shifted/placeholder aria-label makes screen-reader users
hear the wrong field name — and on data-entry forms (five-number summaries, 2x2 counts,
PRISMA boxes) that silently corrupts the result. On 2026-05-28 a generation/template error had
shifted 116 aria-labels by one across 23 apps; this test blocks regressions.

Run from repo root:  python -m pytest tests/test_aria_labels.py -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAT = re.compile(
    r'<span class="lbl">([^<]+)</span>\s*<(?:input|select|textarea)\b[^>]*?\baria-label="([^"]*)"'
)


def _html_files():
    for p in ROOT.rglob("*.html"):
        parts = {x.lower() for x in p.parts}
        if "node_modules" in parts or "submission" in parts or "e156-submission" in parts:
            continue
        yield p


def test_aria_labels_match_visible_labels():
    mismatches = []
    for p in _html_files():
        try:
            html = p.read_text(encoding="utf-8")
        except Exception:
            continue
        for vis, aria in PAT.findall(html):
            if vis.strip() != aria.strip():
                mismatches.append(f"{p.relative_to(ROOT).as_posix()}: '{vis.strip()}' != aria '{aria.strip()}'")
    assert not mismatches, "aria-label != visible label (screen readers announce the wrong field):\n" + "\n".join(mismatches)
