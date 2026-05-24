"""Add a "Verify in R" deep-link button to every numerical app that already
participates in the ma-studies-v1 bus.

Strategy:
  - Skip apps that don't include shared/ma-studies-v1.js (only target bus
    participants — others have no studies to verify).
  - Skip webr-validator itself (target of the link).
  - For each candidate, inject a `<button id="btn-verify-in-r">` next to
    btn-bus-save if present, or otherwise next to the first .actions block.
  - Append a tiny script that wires the button via
    MaStudies.attachVerifyInRButton(...).

Idempotent: skip files that already contain "btn-verify-in-r".
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

BUTTON_HTML = (
    '<button type="button" id="btn-verify-in-r" '
    'title="Push current studies to the shared bus and open WebR Studio '
    'pre-loaded with metafor — independent R verification in your browser." '
    'style="background:#2a6cae;color:#fff;border:1px solid #2a6cae;border-radius:6px;'
    'padding:0.45rem 0.85rem;font-weight:600;cursor:pointer;">'
    'Verify in R</button>'
)

WIRING_SCRIPT = """
<script>
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    if (!window.MaStudies || typeof MaStudies.attachVerifyInRButton !== "function") return;
    MaStudies.attachVerifyInRButton({ btn: "#btn-verify-in-r" });
  });
})();
</script>
"""

SKIP = {"webr-validator"}

# Selectors we'll try to find an injection point next to (most-preferred first).
INJECTION_RE = [
    re.compile(r'(<button[^>]*\bid=["\']btn-bus-save["\'][^>]*>[^<]*</button>)'),
    re.compile(r'(<button[^>]*\bid=["\']btn-bus-load["\'][^>]*>[^<]*</button>)'),
]


def patch(html: str) -> tuple[str, str]:
    if "btn-verify-in-r" in html:
        return html, "already-has-button"
    for rx in INJECTION_RE:
        m = rx.search(html)
        if m:
            # Insert AFTER the matched bus button.
            ins = m.end()
            new_html = html[:ins] + BUTTON_HTML + html[ins:]
            # Append wiring script just before </body> (or end of file).
            if "</body>" in new_html:
                new_html = new_html.replace("</body>", WIRING_SCRIPT + "</body>", 1)
            else:
                new_html = new_html + WIRING_SCRIPT
            return new_html, "wired"
    return html, "no-injection-point"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    root = Path(__file__).resolve().parent.parent

    wired, skipped, missing = 0, 0, 0
    for p in sorted(root.glob("*/index.html")):
        app = p.parent.name
        if app in SKIP:
            continue
        text = p.read_text(encoding="utf-8")
        if "shared/ma-studies-v1.js" not in text:
            continue  # not a bus participant
        new_text, status = patch(text)
        if status == "already-has-button":
            print(f"SKIP (already wired): {app}")
            skipped += 1
            continue
        if status == "no-injection-point":
            print(f"SKIP (no bus button to anchor next to): {app}")
            missing += 1
            continue
        if args.dry_run:
            print(f"WOULD WIRE: {app}")
        else:
            p.write_text(new_text, encoding="utf-8")
            print(f"WIRED: {app}")
        wired += 1

    print(f"\nSummary: wired={wired} skipped={skipped} missing_anchor={missing}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
