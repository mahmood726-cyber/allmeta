"""Wire `Try with: <dataset> ▾` hero selectors into curated apps.

Each entry: { app, adapter, textarea_selector, extras (optional) }.
The codemod injects the two scripts + the mount div + the attachHero
call right after the existing first <label> in the input panel.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

WIRINGS = [
    {"app": "forest-plot",        "adapter": "forest",         "ta": "#f-data"},
    {"app": "funnel-plot",        "adapter": "forest",         "ta": "#f-data"},
    {"app": "heterogeneity",      "adapter": "forest",         "ta": "#f-data"},
    {"app": "meta-regression",    "adapter": "forest",         "ta": "#f-data"},
    {"app": "cumulative-subgroup","adapter": "forest",         "ta": "#f-data"},
    {"app": "bayesian-ma",        "adapter": "forest",         "ta": "#f-data"},
    {"app": "tsa",                "adapter": "forest",         "ta": "#f-data"},
    {"app": "workbench",          "adapter": "forest",         "ta": "#f-data"},
    {"app": "bma-tau-priors",     "adapter": "bma",            "ta": "#src"},
    {"app": "rare-events-glmm",   "adapter": "glmm",           "ta": "#src"},
    {"app": "cross-design",       "adapter": "cross-design",   "ta": "#src"},
    {"app": "cross-network",      "adapter": "cross-network",  "ta": "#src"},
    {"app": "sequential-ma",      "adapter": "sequential",     "ta": "#src"},
    {"app": "personalised-te",    "adapter": "personalised",   "ta": "#src"},
    {"app": "influence",          "adapter": "forest",         "ta": "#src"},
    {"app": "copas",              "adapter": "forest",         "ta": "#src"},
    {"app": "limit-ma",           "adapter": "forest",         "ta": "#src"},
    {"app": "pet-peese",          "adapter": "forest",         "ta": "#src"},
    {"app": "pubbias-tests",      "adapter": "forest",         "ta": "#src"},
    {"app": "gosh",               "adapter": "forest",         "ta": "#src"},
]

SCRIPT_TAGS = (
    '  <script src="../shared/canonical-datasets.js"></script>\n'
    '  <script src="../shared/hero-examples.js"></script>\n'
)
MOUNT_HTML_TEMPLATE = '<div id="alm-hero-mount" aria-label="Load a famous benchmark dataset"></div>\n'
INIT_TEMPLATE = """
<script>
(function () {{
  function ready(fn) {{
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }}
  ready(function () {{
    if (window.AlmHero && typeof AlmHero.attachHero === "function") {{
      AlmHero.attachHero({{
        container: "#alm-hero-mount",
        textarea: "{ta}",
        adapter: "{adapter}",
      }});
    }}
  }});
}})();
</script>
"""


def patch(html: str, wiring: dict) -> tuple[str, str]:
    if "alm-hero-mount" in html:
        return html, "already"
    if "</head>" not in html:
        return html, "no-head"
    if "shared/canonical-datasets.js" not in html:
        html = html.replace("</head>", SCRIPT_TAGS + "</head>", 1)
    # Mount point: insert right after the textarea's closing tag.
    ta_id = wiring["ta"].lstrip("#")
    ta_pattern = re.compile(
        r'(<textarea[^>]*\bid=["\']' + re.escape(ta_id) + r'["\'][^>]*>.*?</textarea>)',
        re.DOTALL,
    )
    m = ta_pattern.search(html)
    if not m:
        return html, "no-textarea"
    insertion = m.end()
    html = html[:insertion] + "\n        " + MOUNT_HTML_TEMPLATE + html[insertion:]

    init = INIT_TEMPLATE.format(ta=wiring["ta"], adapter=wiring["adapter"])
    # Use the LAST </body> — workbench has a "</body></html>" literal inside
    # a JS template string that would otherwise get matched first.
    if "</body>" in html:
        last = html.rfind("</body>")
        html = html[:last] + init + html[last:]
    else:
        html = html + init
    return html, "wired"


def main() -> int:
    wired = 0
    skipped = 0
    for w in WIRINGS:
        idx = ROOT / w["app"] / "index.html"
        if not idx.is_file():
            print(f"MISSING: {w['app']}/index.html")
            continue
        original = idx.read_text(encoding="utf-8")
        new_html, status = patch(original, w)
        if status == "wired":
            idx.write_text(new_html, encoding="utf-8")
            print(f"WIRED: {w['app']} ({w['adapter']})")
            wired += 1
        elif status == "already":
            print(f"SKIP (already wired): {w['app']}")
            skipped += 1
        else:
            print(f"OTHER ({status}): {w['app']}")
    print(f"\nSummary: wired={wired} already_wired={skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
