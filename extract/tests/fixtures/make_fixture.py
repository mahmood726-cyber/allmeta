"""Generate a minimal, valid single-page PDF fixture with known extractable text.

Committed alongside the .pdf it produces so the PDF-ingestion test has a
deterministic input without vendoring a PDF-builder dependency. Re-run with
`python make_fixture.py` if the expected text changes.
"""
from pathlib import Path

TEXT = ("Hazard ratio 0.86 (95% CI 0.78 to 0.95). "
        "4744 patients were randomized in this double-blind, placebo-controlled trial.")


def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build() -> bytes:
    content = f"BT /F1 12 Tf 72 720 Td ({_esc(TEXT)}) Tj ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    pdf = "%PDF-1.4\n"
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(pdf))
        pdf += f"{i} 0 obj\n{body}\nendobj\n"
    xref_pos = len(pdf)
    n = len(objs) + 1
    pdf += f"xref\n0 {n}\n0000000000 65535 f \n"
    for off in offsets:
        pdf += f"{off:010d} 00000 n \n"
    pdf += f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF"
    return pdf.encode("latin-1")


if __name__ == "__main__":
    out = Path(__file__).parent / "sample-rct.pdf"
    out.write_bytes(build())
    print(f"wrote {out} ({out.stat().st_size} bytes)")
