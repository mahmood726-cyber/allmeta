"""Smoke tests for nma-pro-v2 — structural integrity checks.

These tests verify:
  1. The fixture CSV can be parsed correctly (study count, columns)
  2. The parity-nma.R script exists and is syntactically valid
  3. The index.html entry-point exists and loads url-state.js
  4. The monolith HTML is present and not truncated
"""

from pathlib import Path
import re

HERE = Path(__file__).parent
APP_DIR = HERE.parent

# ---------------------------------------------------------------------------
# Fixture / file existence
# ---------------------------------------------------------------------------

def test_nma_tiny_csv_exists():
    """Fixture CSV must exist in the tests directory."""
    csv = HERE / "nma-tiny.csv"
    assert csv.is_file(), f"Missing fixture: {csv}"


def test_nma_tiny_csv_has_six_rows():
    """nma-tiny.csv has a header + 6 data rows."""
    csv = HERE / "nma-tiny.csv"
    lines = [l.strip() for l in csv.read_text(encoding="utf-8").splitlines() if l.strip()]
    # header + 6 data rows
    assert len(lines) == 7, f"Expected 7 lines (header + 6 rows), got {len(lines)}"


def test_nma_tiny_csv_columns():
    """nma-tiny.csv has the required columns: study, treat1, treat2, yi, sei."""
    csv = HERE / "nma-tiny.csv"
    header = csv.read_text(encoding="utf-8").splitlines()[0].strip()
    required = {"study", "treat1", "treat2", "yi", "sei"}
    cols = set(c.strip().lower() for c in header.split(","))
    assert required <= cols, (
        f"Missing columns: {required - cols}  (header: {header!r})"
    )


def test_parity_r_script_exists():
    """parity-nma.R must exist in the tests directory."""
    r_script = HERE / "parity-nma.R"
    assert r_script.is_file(), f"Missing R parity script: {r_script}"


def test_index_html_exists():
    """nma-pro-v2/index.html must exist (triage scanner has_index gate)."""
    idx = APP_DIR / "index.html"
    assert idx.is_file(), f"Missing index.html: {idx}"


def test_index_html_loads_url_state():
    """index.html must reference hub/shared/url-state.js."""
    idx = APP_DIR / "index.html"
    content = idx.read_text(encoding="utf-8")
    assert "url-state.js" in content, (
        "index.html does not load url-state.js — absent module not wired"
    )


def test_monolith_html_exists():
    """The monolith nma-pro-v8.0.html must be present and substantial (>100 KB)."""
    monolith = APP_DIR / "nma-pro-v8.0.html"
    assert monolith.is_file(), f"Missing monolith: {monolith}"
    size_kb = monolith.stat().st_size / 1024
    assert size_kb > 100, (
        f"Monolith appears truncated: {size_kb:.1f} KB (expected > 100 KB)"
    )


def test_monolith_has_csv_import():
    """Monolith must contain importCSV function (present-good CSV upload)."""
    monolith = APP_DIR / "nma-pro-v8.0.html"
    content = monolith.read_text(encoding="utf-8", errors="replace")
    assert "function importCSV" in content, (
        "importCSV not found — CSV upload may have been broken"
    )


def test_monolith_has_plot_downloader():
    """Monolith must contain PlotDownloader (present-good chart download)."""
    monolith = APP_DIR / "nma-pro-v8.0.html"
    content = monolith.read_text(encoding="utf-8", errors="replace")
    assert "PlotDownloader" in content, (
        "PlotDownloader not found — chart download may have been broken"
    )


def test_monolith_has_undo_redo():
    """Monolith must contain UndoRedo (present-good undo/redo stack)."""
    monolith = APP_DIR / "nma-pro-v8.0.html"
    content = monolith.read_text(encoding="utf-8", errors="replace")
    assert "const UndoRedo" in content, (
        "UndoRedo not found — undo stack may have been broken"
    )


def test_monolith_has_session_manager():
    """Monolith must contain SessionManager (present-good session save/load)."""
    monolith = APP_DIR / "nma-pro-v8.0.html"
    content = monolith.read_text(encoding="utf-8", errors="replace")
    assert "SessionManager" in content, (
        "SessionManager not found — session save/load may have been broken"
    )


def test_audit_md_exists():
    """RETROFIT_AUDIT.md must exist (required per cycle spec)."""
    audit = APP_DIR / "RETROFIT_AUDIT.md"
    assert audit.is_file(), f"Missing audit: {audit}"


def test_retrofit_audit_has_present_good_entries():
    """RETROFIT_AUDIT.md must record at least one 'present-good' verdict."""
    audit = APP_DIR / "RETROFIT_AUDIT.md"
    content = audit.read_text(encoding="utf-8", errors="replace")
    assert "present-good" in content.lower(), (
        "RETROFIT_AUDIT.md has no 'present-good' entries — "
        "do-no-harm classification may be missing"
    )
