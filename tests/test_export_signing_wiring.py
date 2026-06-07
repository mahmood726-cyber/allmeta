"""Regression: numerical apps that export charts must sign them (Phase 1b).

The TruthCert-on-export rollout binds a verifiable receipt to every downloaded
artifact. This guards the wiring so it can't silently regress: each listed app
must load shared/truthcert-export.js and pass a getReceiptInput callback to the
shared chart-download helper (which stamps SVG/PNG/PDF), and forest-plot must
stamp its own bespoke export path.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Apps wired to embed a TruthCert receipt in their shared chart export.
CHART_SIGNED = [
    "proportion-ma", "mh-peto", "copas",
    "cumulative-subgroup", "gosh", "limit-ma", "multilevel-ma", "pubbias-tests",
]


def test_chart_export_apps_pass_receipt_input():
    for app in CHART_SIGNED:
        html = (ROOT / app / "index.html").read_text(encoding="utf-8")
        assert "truthcert-export.js" in html, f"{app} must load the export signer"
        assert "getReceiptInput" in html, f"{app} chartDownload must pass getReceiptInput"


def test_receipt_input_does_not_bind_stale_bus():
    """A receipt must bind the CURRENT analysis, never the (possibly stale)
    shared bus. getReceiptInput must not read MaStudies.read() for `studies`,
    and must guard on _lastResults so an invalid input produces no stale receipt."""
    import re
    for app in CHART_SIGNED:
        html = (ROOT / app / "index.html").read_text(encoding="utf-8")
        m = re.search(r"getReceiptInput:\s*function\s*\(\)\s*\{(.*?)\n\s{6}\}", html, re.S)
        assert m, f"{app}: could not locate getReceiptInput body"
        body = m.group(1)
        assert "MaStudies.read()" not in body, \
            f"{app}: getReceiptInput binds the stale bus (MaStudies.read()) — bind the current analysis"
        assert "_lastResults" in body, f"{app}: getReceiptInput must guard on _lastResults"


def test_chart_download_helper_supports_signing():
    js = (ROOT / "hub" / "shared" / "chart-download.js").read_text(encoding="utf-8")
    assert "getReceiptInput" in js, "chart-download must accept a receipt-input hook"
    assert "AlmTruthCertExport" in js and "stampSVG" in js, "chart-download must stamp via the signer"


# Apps with bespoke (non chart-download) export handlers that sign in-line.
BESPOKE_SIGNED = ["forest-plot", "funnel-plot", "heterogeneity"]


def test_bespoke_export_apps_signed():
    for app in BESPOKE_SIGNED:
        html = (ROOT / app / "index.html").read_text(encoding="utf-8")
        assert "truthcert-export.js" in html, f"{app} must load the export signer"
        assert "AlmTruthCertExport.stampSVG" in html, f"{app} must stamp its SVG/PNG"
        assert "out.truthcert =" in html, f"{app} JSON export must embed the receipt"
