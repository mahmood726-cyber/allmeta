"""Wire shared/autosave.js into every form-heavy numerical app.

For each app in WIRINGS:
  - inserts `<script src="../shared/autosave.js"></script>` before </head>
  - inserts an init block before the LAST </body> (workbench has a JS
    template-literal containing "</body></html>" that the FIRST match
    would corrupt — use rfind)

Idempotent: any app that already mentions `AlmAutosave.install` is skipped.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Each entry: app dir name → autosave key (defaults to the app dir name).
WIRINGS = [
    "forest-plot", "funnel-plot", "heterogeneity", "meta-regression",
    "cumulative-subgroup", "influence", "copas", "limit-ma", "pet-peese",
    "pubbias-tests", "gosh", "gosh-metareg", "bayesian-ma", "bayesian-mcmc",
    "bma-tau-priors", "rve-meta", "cross-design", "cross-network",
    "personalised-te", "tsa", "sequential-ma", "workbench",
    "multi-outcome-ma", "multi-outcome-nma", "rare-events-glmm",
    "everything-model", "bayesian-nma", "component-nma", "nma-inconsistency",
    "nma-global-inconsistency", "bucher", "nma-meta-reg",
    "p-curve", "mh-peto", "proportion-ma", "multilevel-ma", "hsroc",
    "dta-sroc", "effect-size-converter", "dosehtml",
]

SCRIPT_TAG = '  <script src="../shared/autosave.js"></script>\n'

def _init_for(app_key: str) -> str:
    return f"""
<script>
(function () {{
  function ready(fn) {{
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }}
  ready(function () {{
    if (window.AlmAutosave && typeof AlmAutosave.install === "function") {{
      AlmAutosave.install({{ appKey: {app_key!r} }});
    }}
  }});
}})();
</script>
"""


def patch(html: str, app_key: str) -> tuple[str, str]:
    if "AlmAutosave.install" in html:
        return html, "already"
    if "</head>" not in html:
        return html, "no-head"
    if "shared/autosave.js" not in html:
        html = html.replace("</head>", SCRIPT_TAG + "</head>", 1)
    init = _init_for(app_key)
    if "</body>" in html:
        last = html.rfind("</body>")
        html = html[:last] + init + html[last:]
    else:
        html = html + init
    return html, "wired"


def main() -> int:
    wired = 0
    skipped = 0
    missing = 0
    for app in WIRINGS:
        idx = ROOT / app / "index.html"
        if not idx.is_file():
            print(f"MISSING: {app}/index.html")
            missing += 1
            continue
        original = idx.read_text(encoding="utf-8")
        new_html, status = patch(original, app)
        if status == "wired":
            idx.write_text(new_html, encoding="utf-8")
            print(f"WIRED: {app}")
            wired += 1
        elif status == "already":
            print(f"SKIP (already wired): {app}")
            skipped += 1
        else:
            print(f"OTHER ({status}): {app}")
    print(f"\nSummary: wired={wired} already={skipped} missing={missing}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
