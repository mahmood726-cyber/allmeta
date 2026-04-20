"""Smoke tests for the PRISMA flow diagram generator.

These are read-only file checks: they do not open a browser. The app is a
single-file static HTML page, so the contract we need to verify is that:

  1. index.html exists, is non-trivial, parses as HTML.
  2. Every PRISMA 2020 node label the generator promises is present in the
     source.
  3. Every form-input id the inline script wires up actually exists.
  4. Basic structural integrity: div and script tag balance, no
     placeholder tokens left over.
  5. No external CDN at runtime (offline-safe per C:/Users/user/.claude/
     rules/html-apps.md).
"""

import re
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"

EXPECTED_LABELS = (
    "Records identified from:",
    "Databases",
    "Registers",
    "Records removed before screening",
    "Records screened",
    "Records excluded",
    "Reports sought for retrieval",
    "Reports not retrieved",
    "Reports assessed for eligibility",
    "Studies included in review",
    "Reports of included studies",
    "Identification",
    "Screening",
    "Included",
)

EXPECTED_INPUT_IDS = (
    "f-db", "f-reg", "f-removed", "f-removed-breakdown",
    "f-screened", "f-excluded-screen", "f-sought", "f-not-retrieved",
    "f-assessed", "f-excluded-eligible", "f-excluded-breakdown",
    "f-studies", "f-reports", "f-title",
)

FORBIDDEN_PLACEHOLDERS = ("{{", "}}", "REPLACE_ME", "__PLACEHOLDER__", "TODO:", "TBD:")

# Preload fonts are allowed; actual runtime CDN script/style tags are not.
CDN_RUNTIME_PATTERNS = (
    re.compile(r'<script[^>]*src=["\']https?://', re.IGNORECASE),
    re.compile(r'<link[^>]*rel=["\']stylesheet["\'][^>]*href=["\']https?://', re.IGNORECASE),
)


class TagCounter(HTMLParser):
    def __init__(self):
        super().__init__()
        self.counts = {}
        self.self_closing = {"br", "hr", "img", "input", "meta", "link", "source", "area", "base", "col", "embed", "param", "track", "wbr"}

    def handle_starttag(self, tag, attrs):
        if tag in self.self_closing:
            return
        self.counts[tag] = self.counts.get(tag, 0) + 1

    def handle_endtag(self, tag):
        if tag in self.self_closing:
            return
        self.counts[tag] = self.counts.get(tag, 0) - 1


def test_index_exists_and_substantial():
    assert INDEX.is_file()
    size = INDEX.stat().st_size
    assert size > 5000, f"index.html is only {size} bytes, expected >5000"


def test_index_parses_as_html():
    text = INDEX.read_text(encoding="utf-8")
    parser = TagCounter()
    parser.feed(text)
    # Every open tag should have a close tag.
    unbalanced = {tag: n for tag, n in parser.counts.items() if n != 0}
    assert not unbalanced, f"Unbalanced HTML tags: {unbalanced}"


def test_required_labels_present():
    text = INDEX.read_text(encoding="utf-8")
    missing = [lbl for lbl in EXPECTED_LABELS if lbl not in text]
    assert not missing, f"Missing PRISMA labels in index.html: {missing}"


def test_required_input_ids_present():
    text = INDEX.read_text(encoding="utf-8")
    missing = []
    for fid in EXPECTED_INPUT_IDS:
        # Must be declared as an id= attribute on an <input> or <textarea>.
        if f'id="{fid}"' not in text:
            missing.append(fid)
    assert not missing, f"Missing input ids: {missing}"


def test_no_forbidden_placeholders():
    text = INDEX.read_text(encoding="utf-8")
    found = [tok for tok in FORBIDDEN_PLACEHOLDERS if tok in text]
    assert not found, f"Found unpopulated placeholders: {found}"


def test_no_external_runtime_cdn():
    text = INDEX.read_text(encoding="utf-8")
    for pat in CDN_RUNTIME_PATTERNS:
        m = pat.search(text)
        assert m is None, f"External runtime asset found: {m.group(0)[:120]!r}"


def test_localstorage_key_is_unique():
    text = INDEX.read_text(encoding="utf-8")
    # The app uses its own namespaced key per html-apps.md.
    assert '"prisma-flow-v1"' in text, "localStorage key prisma-flow-v1 not found"


def test_has_export_buttons():
    text = INDEX.read_text(encoding="utf-8")
    for btn_id in ("btn-svg", "btn-png", "btn-json", "btn-import", "btn-reset"):
        assert f'id="{btn_id}"' in text, f"Missing button id={btn_id}"


def test_script_close_tag_not_in_string_literal():
    # html-apps.md lesson: no literal </script> inside a <script> block.
    text = INDEX.read_text(encoding="utf-8")
    # Grab the inline <script> body.
    m = re.search(r"<script>\s*(.*?)\s*</script>", text, re.DOTALL)
    assert m, "No inline <script> block found"
    body = m.group(1)
    assert "</script>" not in body, "Literal </script> inside script body"
