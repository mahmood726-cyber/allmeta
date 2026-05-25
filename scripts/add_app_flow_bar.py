"""Wire the cross-app `Continue with` bar into every numerical app.

Inserts:
  - `<script src="../shared/app-flow.js"></script>` before </head>
  - `<div id="alm-flow-mount" aria-live="polite"></div>` after the
    primary results / preview panel
  - `AlmFlow.attachContinueBar({...})` init call before </body>

Idempotent: any app that already has `alm-flow-mount` is skipped.
Per-app suggestion list is curated below so each app's "Continue
with" row points at sensible next steps in the analysis pipeline.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Per-app curated suggestion lists. Each is the set of downstream apps
# that meaningfully consume the same bus state.
SUGGESTIONS = {
    "funnel-plot":         ["forest-plot", "pubbias-tests", "copas", "limit-ma",
                            "pet-peese", "influence", "webr-validator"],
    "heterogeneity":       ["forest-plot", "cumulative-subgroup", "gosh",
                            "meta-regression", "bma-tau-priors", "webr-validator"],
    "meta-regression":     ["forest-plot", "heterogeneity", "gosh-metareg",
                            "bma-tau-priors", "webr-validator"],
    "cumulative-subgroup": ["forest-plot", "heterogeneity", "tsa",
                            "sequential-ma", "webr-validator"],
    "influence":           ["forest-plot", "funnel-plot", "gosh", "copas"],
    "copas":               ["forest-plot", "funnel-plot", "pubbias-tests",
                            "limit-ma", "pet-peese"],
    "limit-ma":            ["forest-plot", "funnel-plot", "copas", "pet-peese"],
    "pet-peese":           ["forest-plot", "funnel-plot", "copas", "limit-ma"],
    "pubbias-tests":       ["forest-plot", "funnel-plot", "copas", "limit-ma",
                            "pet-peese"],
    "gosh":                ["forest-plot", "heterogeneity", "influence"],
    "gosh-metareg":        ["meta-regression", "forest-plot", "heterogeneity"],
    "bayesian-ma":         ["forest-plot", "heterogeneity", "bma-tau-priors",
                            "bayesian-mcmc", "webr-validator"],
    "bayesian-mcmc":       ["forest-plot", "heterogeneity", "bma-tau-priors",
                            "bayesian-ma", "webr-validator"],
    "bma-tau-priors":      ["forest-plot", "heterogeneity", "bayesian-ma",
                            "cross-design", "webr-validator"],
    "rve-meta":            ["forest-plot", "meta-regression", "personalised-te",
                            "cross-design"],
    "cross-design":        ["forest-plot", "cross-network", "bma-tau-priors",
                            "webr-validator"],
    "personalised-te":     ["forest-plot", "rve-meta", "everything-model",
                            "cross-design"],
    "tsa":                 ["forest-plot", "sequential-ma", "cumulative-subgroup"],
    "sequential-ma":       ["tsa", "cumulative-subgroup", "forest-plot"],
    "workbench":           ["forest-plot", "funnel-plot", "heterogeneity",
                            "cumulative-subgroup", "tsa"],
    "multi-outcome-ma":    ["forest-plot", "heterogeneity", "multi-outcome-nma"],
    "multi-outcome-nma":   ["nma-pro-v2", "nma-inconsistency", "multi-outcome-ma",
                            "cross-network"],
    "nma":                 ["nma-pro-v2", "nma-inconsistency", "bucher",
                            "nma-meta-reg"],
    "bayesian-nma":        ["nma-pro-v2", "nma-inconsistency", "nma-meta-reg"],
    "component-nma":       ["nma-pro-v2", "nma", "nma-inconsistency"],
    "nma-inconsistency":   ["nma-pro-v2", "nma", "nma-global-inconsistency",
                            "bucher"],
    "nma-global-inconsistency": ["nma-pro-v2", "nma-inconsistency", "nma"],
    "bucher":              ["nma-pro-v2", "nma", "nma-inconsistency"],
    "nma-meta-reg":        ["nma-pro-v2", "nma", "meta-regression"],
    "rare-events-glmm":    ["forest-plot", "heterogeneity", "bma-tau-priors"],
    "everything-model":    ["living-rob-pool", "forest-plot",
                            "personalised-te"],
    "cross-network":       ["nma-pro-v2", "cross-design", "multi-outcome-nma"],
}

# Best-effort mount point: insert just before the first </section> that
# contains a recognised plot host id. Falls back to before </main>.
MOUNT_HTML = '\n      <div id="alm-flow-mount" aria-live="polite"></div>\n'
SCRIPT_TAG = '  <script src="../shared/app-flow.js"></script>\n'
INIT_TEMPLATE = """
<script>
(function () {{
  function ready(fn) {{
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }}
  ready(function () {{
    if (window.AlmFlow && typeof AlmFlow.attachContinueBar === "function") {{
      AlmFlow.attachContinueBar({{
        container: "#alm-flow-mount",
        suggestions: {suggestions_json},
      }});
    }}
  }});
}})();
</script>
"""


def patch(html: str, app_key: str) -> tuple[str, str]:
    """Returns (new_html, status). status ∈ {wired, already, no-anchor}."""
    if "alm-flow-mount" in html:
        return html, "already"
    if app_key not in SUGGESTIONS:
        return html, "no-suggestion-list"
    # 1. Script tag
    if "shared/app-flow.js" not in html:
        if "</head>" in html:
            html = html.replace("</head>", SCRIPT_TAG + "</head>", 1)
        else:
            return html, "no-head"
    # 2. Mount point — try common results-panel signatures.
    anchors = [
        ('id="svg-host">', '">'),     # forest-plot pattern (already handled separately)
        ('id="plot-host"', None),     # nma-meta-reg / sequential-ma / living-rob
        ('</tbody></table>', None),   # tables-only apps
        ('id="results"', None),
        ('id="body">', '>'),
        ('id="results-host"', None),
    ]
    inserted = False
    for needle, _ in anchors:
        if needle in html and 'id="alm-flow-mount"' not in html:
            idx = html.find(needle)
            # Walk forward to the next </section> closing.
            end = html.find('</section>', idx)
            if end != -1:
                html = html[:end] + MOUNT_HTML + html[end:]
                inserted = True
                break
    if not inserted:
        # Fall back to before </main>.
        if '</main>' in html:
            html = html.replace('</main>', MOUNT_HTML + '</main>', 1)
            inserted = True
    if not inserted:
        return html, "no-anchor"

    # 3. Init script — before the LAST </body>. Some apps (workbench)
    # embed "</body></html>" inside a JS template string for a self-
    # contained HTML report; the first-match replace would corrupt them.
    suggestions_json = "[" + ", ".join(f'"{s}"' for s in SUGGESTIONS[app_key]) + "]"
    init = INIT_TEMPLATE.format(suggestions_json=suggestions_json)
    if "</body>" in html:
        last = html.rfind("</body>")
        html = html[:last] + init + html[last:]
    else:
        html = html + init
    return html, "wired"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    root = Path(__file__).resolve().parent.parent
    wired = 0
    skipped = 0
    no_anchor = 0
    for app_key in sorted(SUGGESTIONS.keys()):
        idx = root / app_key / "index.html"
        if not idx.is_file():
            print(f"MISSING: {app_key}/index.html")
            continue
        original = idx.read_text(encoding="utf-8")
        new_html, status = patch(original, app_key)
        if status == "wired":
            if args.dry_run:
                print(f"WOULD WIRE: {app_key}")
            else:
                idx.write_text(new_html, encoding="utf-8")
                print(f"WIRED: {app_key}")
            wired += 1
        elif status == "already":
            print(f"SKIP (already wired): {app_key}")
            skipped += 1
        elif status == "no-anchor":
            print(f"NO ANCHOR: {app_key} (manual wiring needed)")
            no_anchor += 1
        else:
            print(f"OTHER ({status}): {app_key}")
    print(f"\nSummary: wired={wired} already_wired={skipped} no_anchor={no_anchor}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
