"""Smoke tests for the WebR validator."""

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_IDS = (
    "f-data", "f-method", "f-test", "f-webr-url", "f-r-output", "f-acknowledge",
    "btn-run-webr", "btn-export-r", "btn-parse-r", "btn-bus-load",
    "btn-example", "btn-reset", "btn-cert",
    "compare-host", "rscript-host", "webr-log", "warn-banner", "status",
)

FORBIDDEN = ("{{", "}}", "REPLACE_ME", "__PLACEHOLDER__", "TODO:", "TBD:")


class TagCounter(HTMLParser):
    def __init__(self):
        super().__init__()
        self.counts = {}
        self.self_closing = {"br","hr","img","input","meta","link","source","area","base","col","embed","param","track","wbr"}
    def handle_starttag(self,tag,attrs):
        if tag in self.self_closing: return
        self.counts[tag] = self.counts.get(tag,0)+1
    def handle_endtag(self,tag):
        if tag in self.self_closing: return
        self.counts[tag] = self.counts.get(tag,0)-1


def test_index_exists(): assert INDEX.is_file() and INDEX.stat().st_size > 8000
def test_html_balance():
    p = TagCounter(); p.feed(INDEX.read_text(encoding="utf-8"))
    u = {t:n for t,n in p.counts.items() if n != 0}
    assert not u, u
def test_required_ids():
    text = INDEX.read_text(encoding="utf-8")
    missing = [i for i in EXPECTED_IDS if f'id="{i}"' not in text]
    assert not missing, missing
def test_no_placeholders():
    text = INDEX.read_text(encoding="utf-8")
    assert not [t for t in FORBIDDEN if t in text]


def test_webr_url_configurable_not_hardcoded_cdn_script():
    """WebR URL is a user-editable input. The inline <script> tag itself
    must NOT load WebR at parse time — only on explicit click, per
    html-apps.md 'no external CDN at runtime' for shipped assets.
    This is implemented by loading via dynamic import() after a user
    button press, not via a static <script src=...> tag."""
    text = INDEX.read_text(encoding="utf-8")
    # No static <script src=... webr ...> at top of the file
    assert not re.search(r'<script[^>]*src=["\'][^"\']*webr', text, re.IGNORECASE), \
        "WebR must not be loaded via static <script src>; use dynamic import on click"
    # Dynamic import on demand is fine
    assert "await import(" in text or "import(url)" in text, \
        "Must use dynamic import() for the WebR loader"


def test_webr_triggered_by_click_not_onload():
    """The only place WebR is instantiated must be inside a click handler,
    never during boot. Prevents silent 30 MB downloads on page open."""
    text = INDEX.read_text(encoding="utf-8")
    assert "ensureWebR" in text
    # ensureWebR must only be invoked from onRunWebR — and onRunWebR is
    # wired via addEventListener("click", onRunWebR)
    assert 'btn-run-webr").addEventListener("click", onRunWebR' in text


def test_rma_script_has_all_seven_fields():
    """Script emits estimate, se, ci.lb, ci.ub, tau^2, I^2, QE for diff."""
    text = INDEX.read_text(encoding="utf-8")
    for field in ("estimate=", "se=", "ci.lb=", "ci.ub=", "tau^2=", "I^2=", "QE="):
        assert field in text, f"Missing output field: {field}"


def test_r_output_parser_handles_scientific_notation():
    text = INDEX.read_text(encoding="utf-8")
    # Regex includes exponent [eE][-+]?\d+
    assert "[eE][-+]?" in text


def test_tolerance_is_4_decimal_places():
    """TruthCert contract: match to 4 decimal places (1e-4)."""
    text = INDEX.read_text(encoding="utf-8")
    assert "1e-4" in text


def test_cert_schema_is_truthcert_webr_v1():
    text = INDEX.read_text(encoding="utf-8")
    assert '"truthcert-webr-v1"' in text


def test_acknowledgement_gate_present():
    """Running WebR requires the user to check an acknowledgement box
    — a nudge that ~30 MB will be downloaded."""
    text = INDEX.read_text(encoding="utf-8")
    assert 'id="f-acknowledge"' in text
    assert "acknowledgement" in text.lower() or "acknowledge" in text.lower()


def test_bus_integration():
    text = INDEX.read_text(encoding="utf-8")
    assert '"ma-studies-v1"' in text
    assert "btn-bus-load" in text


def test_script_close_not_in_string():
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m and "</script>" not in m.group(1)
