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
CHART_SIGNED = ["proportion-ma", "mh-peto", "copas"]


def test_chart_export_apps_pass_receipt_input():
    for app in CHART_SIGNED:
        html = (ROOT / app / "index.html").read_text(encoding="utf-8")
        assert "truthcert-export.js" in html, f"{app} must load the export signer"
        assert "getReceiptInput" in html, f"{app} chartDownload must pass getReceiptInput"


def test_chart_download_helper_supports_signing():
    js = (ROOT / "hub" / "shared" / "chart-download.js").read_text(encoding="utf-8")
    assert "getReceiptInput" in js, "chart-download must accept a receipt-input hook"
    assert "AlmTruthCertExport" in js and "stampSVG" in js, "chart-download must stamp via the signer"


def test_forest_plot_bespoke_export_signed():
    html = (ROOT / "forest-plot" / "index.html").read_text(encoding="utf-8")
    assert "AlmTruthCertExport.stampSVG" in html
    assert "out.truthcert =" in html
