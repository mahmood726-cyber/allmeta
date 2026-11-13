"""Lane estho (2026-11-12): the estimator hand-off.

Pages hand the validator their studies plus (optionally) a method and a test. Before:

* tsa, pet-peese and copas each show an inverse-variance pool on the page (tsa "Pooled mu",
  the cumulative fixed-effect pool; pet-peese "FE meta-analysis"; copas "Unadjusted
  random-effects pooled effect", tau^2 REML or DL as the page selects), but sent no model, so
  the validator re-fitted PM/z and could not reproduce any number on those pages.
* bayesian-ma's plug-in tau^2 is Paule-Mandel, and it sent no model either.
* The banner for every app whose own model the validator cannot fit ended "use \"Validate
  this analysis in R\" on that page" -- a control that tsa, pet-peese, copas, bayesian-ma,
  bayesian-mcmc, bma-tau-priors, cross-design and gosh-metareg do not have.

Review of PR #537: pet-peese and copas re-read the input box when "Verify in R" was pressed,
so an input edited after Run reached R while the page showed the earlier row, and copas sent
the estimator the (debounced) selector named rather than the one the displayed row used.

Behaviour in real Chrome is checked by hub/shared/tests/_validator_handoff.mjs
(tools/userpath/validator-handoff.cjs, tools/userpath/estimator-handoff.cjs, and the
estimator-handoff / validator-handoff specs); these are the static guards that run in CI,
and they check that every row a banner names is covered by those browser checks.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = (ROOT / "webr-validator" / "index.html").read_text(encoding="utf-8")


def _app(name):
    p = ROOT / name / "index.html"
    return p.read_text(encoding="utf-8") if p.exists() else None


def _js_set(name):
    m = re.search(r"const " + name + r" = new Set\(\[([^\]]*)\]\)", PAGE)
    assert m, name + " is not declared in the validator"
    return set(re.findall(r'"([a-z0-9-]+)"', m.group(1)))


def _not_iv_pool_keys():
    block = re.search(r"const NOT_IV_POOL = \{(.*?)\n    \};", PAGE, re.S).group(1)
    keys = set(re.findall(r'"([a-z0-9-]+)":\s*"', block))
    assert len(keys) >= 15, keys
    return keys


def test_banner_names_the_live_control_only_for_apps_that_have_it():
    live = _js_set("HAS_LIVE_R_CHECK")
    checked = 0
    for app in sorted(_not_iv_pool_keys()):
        html = _app(app)
        if html is None:
            continue  # sparse checkout; CI has every page
        checked += 1
        has = "alm-validate.js" in html
        assert (app in live) == has, (app, "HAS_LIVE_R_CHECK disagrees with the page loading shared/alm-validate.js")
    assert checked > 0
    # The pointer to the control is only ever said for an app in that set.
    i = PAGE.index('use \\"Validate this analysis in R\\" on that page')
    assert "HAS_LIVE_R_CHECK.has(from)" in PAGE[max(0, i - 400):i]


HARNESS = (ROOT / "hub" / "shared" / "tests" / "_validator_handoff.mjs").read_text(encoding="utf-8")
SPEC = (ROOT / "hub" / "shared" / "tests" / "estimator-handoff.spec.mjs").read_text(encoding="utf-8")


def _same_row():
    """{app: {estimator, ...}} from the validator's SAME_ROW table."""
    block = PAGE[PAGE.index("const SAME_ROW = {"):]
    block = block[:block.index("\n    };")]
    out = {}
    for m in re.finditer(r'^\s*"([a-z0-9-]+)":\s*\{(.*?)\]\s*\}', block, re.M | re.S):
        out[m.group(1)] = set(re.findall(r'\b([A-Z]{2,4}):\s*\["', m.group(2)))
    assert out, "SAME_ROW is empty"
    return out


def test_same_row_claims_name_estimators_the_validator_fits():
    # A banner may say R "should equal" a row only for an app whose own model it is not
    # (NOT_IV_POOL) and only under an estimator the validator accepts from the URL.
    allow = set(re.findall(r'"([A-Z]{2,4})"', re.search(r"if \(m && \[([^\]]+)\]\.includes\(m\)\)", PAGE).group(1)))
    for app, ests in _same_row().items():
        assert app in _not_iv_pool_keys(), app
        assert ests and ests <= allow, (app, ests, allow)


def test_every_same_row_claim_is_checked_against_the_displayed_row_in_chrome():
    # The requirement is behavioural, so it is tested in a browser: for every app whose
    # banner names a row, (1) the validator's fit equals the row the page SHOWS after the
    # input is edited without re-running (checkEditedInput), (2) the model the hand-off
    # sends is one the banner names (APPS[app].model.method), and (3) for copas the
    # estimator follows the displayed fit: DL -> DL and REML -> REML, also while the
    # debounced refit is pending (checkCopasModelFollowsDisplay).
    rows = _same_row()
    shown = set(re.findall(r"^\s*'?([a-z0-9-]+)'?:\s*\{\s*d:\s*\d", HARNESS[HARNESS.index("export const SHOWN"):], re.M))
    assert set(rows) == shown, (set(rows), shown)
    for app, ests in rows.items():
        cfg = re.search(r"^\s*'" + re.escape(app) + r"':\s*\{[^\n]*\n(?:\s*//[^\n]*\n)*\s*model:\s*\{\s*method:\s*'([A-Z]+)'", HARNESS, re.M)
        assert cfg and cfg.group(1) in ests, (app, cfg and cfg.group(1), ests)
    assert "checkEditedInput" in SPEC and "Object.keys(SHOWN)" in SPEC
    assert "checkCopasModelFollowsDisplay" in SPEC and "toEqual(['DL', 'REML'])" in SPEC
    for k in ("DL", "REML"):
        assert k in rows["copas"], rows["copas"]


def test_run_button_pages_hand_off_the_analysed_studies_not_the_input_box():
    # pet-peese and copas analyse on Run (copas also on a debounced option change), so the
    # input box can differ from what the page shows. Their hand-off must come from the
    # analysed result, never from re-reading the input box when the control is pressed.
    for app in ("pet-peese", "copas"):
        html = _app(app)
        if html is None:
            continue
        body = re.search(r"window\.__almValidatorStudies = function \(\) \{(.*?)\n    \};", html, re.S).group(1)
        assert "getElementById" not in body and ".value" not in body, (app, body)
        # one-line form (pet-peese: a constant) or a block (copas: the recorded estimator)
        model = (re.search(r"window\.__almValidatorModel = function \(\) \{([^\n]*)\};\n", html)
                 or re.search(r"window\.__almValidatorModel = function \(\) \{\n(.*?)\n    \};", html, re.S))
        assert model, app
        assert "getElementById" not in model.group(1), (app, model.group(1))
