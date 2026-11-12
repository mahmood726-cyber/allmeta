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

Behaviour in real Chrome is checked by hub/shared/tests/_validator_handoff.mjs
(tools/userpath/validator-handoff.cjs); these are the static guards that run in CI.
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


def test_tsa_sends_its_fixed_effect_pool_model_on_every_path():
    html = _app("tsa")
    assert 'window.__almValidatorModel = function () { return { method: "FE", test: "z" }; };' in html
    call = re.search(r"MaStudies\.attachVerifyInRButton\(\{ btn: \"#btn-verify-in-r\",.*?\}\);", html, re.S).group(0)
    assert "__almValidatorModel().method" in call and "__almValidatorModel().test" in call


def test_pet_peese_sends_its_fixed_effect_pool_model():
    html = _app("pet-peese")
    assert 'window.__almValidatorModel = function () { return { method: "FE", test: "z" }; };' in html
    call = re.search(r"MaStudies\.attachVerifyInRButton\(\{ btn: \"#btn-verify-in-r\",.*?\}\);", html, re.S).group(0)
    assert "__almValidatorModel().method" in call and "__almValidatorModel().test" in call


def test_copas_sends_the_tau2_estimator_it_selects():
    html = _app("copas")
    assert "window.__almValidatorModel = function () {" in html
    model = re.search(r"window\.__almValidatorModel = function \(\) \{(.*?)\n    \};", html, re.S).group(1)
    assert "opt-tau" in model and '"z"' in model
    call = re.search(r"MaStudies\.attachVerifyInRButton\(\{ btn: \"#btn-verify-in-r\",.*?\}\);", html, re.S).group(0)
    assert "__almValidatorModel().method" in call and "__almValidatorModel().test" in call


def test_bayesian_ma_sends_pm_only_when_its_tau2_is_pm():
    html = _app("bayesian-ma")
    model = re.search(r"window\.__almValidatorModel = function \(\) \{(.*?)\n    \};", html, re.S).group(1)
    assert '"PM"' in model and "f-tau-method" in model
    call = re.search(r"MaStudies\.attachVerifyInRButton\(\{ btn: \"#btn-verify-in-r\",.*?\}\);", html, re.S).group(0)
    assert "__almValidatorModel().method" in call
    bar = re.search(r"AlmFlow\.attachContinueBar\(\{.*?\}\);", html, re.S).group(0)
    assert "getValidatorModel" in bar


def test_banner_names_the_matching_row_only_when_the_model_was_sent():
    assert "const SAME_ROW = {" in PAGE
    for app in ("tsa", "pet-peese", "copas", "bayesian-ma"):
        assert re.search(r'^\s*"' + re.escape(app) + r'":\s*\{', PAGE[PAGE.index("const SAME_ROW = {"):], re.M), app
    # Only when the URL carried a method (the app sent its model), never on the PM default.
    assert 'params.get("method")' in PAGE and "showSourceBanner(params.get(\"from\"), sent)" in PAGE
