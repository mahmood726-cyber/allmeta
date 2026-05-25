"""Wire a 'Cite as' button into every numerical app that has a hero-mount
(those are the apps with method-paper citations registered).

Inserts:
  - `<script src="../shared/citation.js"></script>` before </head>
  - `<div id="alm-cite-mount" style="margin-top:0.4rem"></div>` right after
    the hero mount (or before </main> if no hero mount exists)
  - AlmCitation.attachAuto({...}) init at end of body
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

APPS = [
    "forest-plot", "funnel-plot", "heterogeneity", "meta-regression",
    "cumulative-subgroup", "bayesian-ma", "tsa", "workbench",
    "bma-tau-priors", "rare-events-glmm", "cross-design", "cross-network",
    "sequential-ma", "personalised-te", "influence", "copas", "limit-ma",
    "pet-peese", "pubbias-tests", "gosh", "multi-outcome-ma",
    "multi-outcome-nma", "nma-meta-reg", "everything-model",
    "living-rob-pool",
]

SCRIPT_TAG = '  <script src="../shared/citation.js"></script>\n'
MOUNT_HTML = '<div id="alm-cite-mount" style="margin-top:0.4rem"></div>\n'
INIT_TEMPLATE = """
<script>
(function () {{
  function ready(fn) {{
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }}
  ready(function () {{
    if (window.AlmCitation && typeof AlmCitation.attachAuto === "function") {{
      AlmCitation.attachAuto({{ container: "#alm-cite-mount", app: "{app}" }});
    }}
  }});
}})();
</script>
"""


def patch(html: str, app: str) -> tuple[str, str]:
    if "alm-cite-mount" in html:
        return html, "already"
    if "</head>" not in html:
        return html, "no-head"
    if "shared/citation.js" not in html:
        html = html.replace("</head>", SCRIPT_TAG + "</head>", 1)

    # Prefer to mount right after #alm-hero-mount. If that's absent,
    # before </main>.
    if 'id="alm-hero-mount"' in html:
        html = re.sub(
            r'(<div id="alm-hero-mount"[^>]*></div>)',
            r'\1\n        ' + MOUNT_HTML.rstrip("\n"),
            html, count=1,
        )
    elif '</main>' in html:
        html = html.replace('</main>', MOUNT_HTML + '</main>', 1)
    else:
        return html, "no-anchor"

    init = INIT_TEMPLATE.format(app=app)
    # Use the LAST </body> so we don't accidentally inject inside a
    # JS template string that contains "</body></html>" — workbench has
    # exactly this trap (its buildReport returns an HTML report literal).
    if "</body>" in html:
        last = html.rfind("</body>")
        html = html[:last] + init + html[last:]
    else:
        html = html + init
    return html, "wired"


def main() -> int:
    wired = 0
    skipped = 0
    for app in APPS:
        idx = ROOT / app / "index.html"
        if not idx.is_file():
            continue
        original = idx.read_text(encoding="utf-8")
        new_html, status = patch(original, app)
        if status == "wired":
            idx.write_text(new_html, encoding="utf-8")
            print(f"WIRED: {app}")
            wired += 1
        elif status == "already":
            print(f"SKIP: {app}")
            skipped += 1
        else:
            print(f"OTHER ({status}): {app}")
    print(f"\nSummary: wired={wired} already={skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
