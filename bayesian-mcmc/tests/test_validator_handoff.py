"""RC5 hand-off guard (lane rc5, 2026-11-12): the WebR validator gets THIS page's analysis.

Live site, real Chrome, BCG pasted (tools/userpath/validator-handoff.cjs): "Verify in R"
alerted "No studies on the shared bus yet" for a new user and opened the validator on an
earlier session's 3 studies for a returning user, because the button read the saved
shared bus instead of the page.
The page's model is not an inverse-variance pool, so the validator must say so (banner).
Browser check of the same path: hub/shared/tests/validator-handoff.spec.mjs.
"""
import re
from pathlib import Path

APP = "bayesian-mcmc"
HERE = Path(__file__).resolve().parent
SRC = (HERE.parent / "index.html").read_text(encoding="utf-8")
VALIDATOR = (HERE.parent.parent / "webr-validator" / "index.html").read_text(encoding="utf-8")
MODEL = None


def _call(fn):
    m = re.search(re.escape(fn) + r"\(\{(.*?)\}\);", SRC, re.S)
    return m.group(1) if m else ""


def test_verify_in_r_hands_over_the_studies_on_screen():
    verify = _call("attachVerifyInRButton")
    assert "getStudies" in verify and "__almValidatorStudies" in verify, verify
    assert "window.__almValidatorStudies = function" in SRC
    if MODEL:
        assert "__almValidatorModel" in verify and "method" in verify and "test" in verify, verify


def test_validator_model_is_the_headline_model():
    if MODEL:
        pat = r'window\.__almValidatorModel = function \(\) \{ return \{ method: "%s", test: "%s" \}; \};' % MODEL
        assert re.search(pat, SRC), pat
        sel_m = re.search(r'<select id="f-method".*?</select>', VALIDATOR, re.S).group(0)
        sel_t = re.search(r'<select id="f-test".*?</select>', VALIDATOR, re.S).group(0)
        allow_m = re.search(r'if \(m && \[([^\]]+)\]\.includes\(m\)\)', VALIDATOR).group(1)
        allow_t = re.search(r'if \(t && \[([^\]]+)\]\.includes\(t\)\)', VALIDATOR).group(1)
        assert f'value="{MODEL[0]}"' in sel_m and f'"{MODEL[0]}"' in allow_m
        assert f'value="{MODEL[1]}"' in sel_t and f'"{MODEL[1]}"' in allow_t
    else:
        # Not an inverse-variance pool: the validator must say it is not this app's model.
        table = re.search(r"const NOT_IV_POOL = \{(.*?)\};", VALIDATOR, re.S).group(1)
        assert f'"{APP}"' in table


def test_validate_and_continue_hand_over_the_page():
    if 'id="btn-validate-webr"' in SRC:
        assert not re.search(r'window\.open\("\.\./webr-validator/index\.html\?fromBus=1', SRC)
        h = re.search(r'getElementById\("btn-validate-webr"\)\.addEventListener\("click", function \(\) \{(.*?)\n      \}\);', SRC, re.S).group(1)
        assert "openInWebR" in h and "__almValidatorStudies" in h, h
        if MODEL:
            assert "__almValidatorModel" in h, h
    bar = _call("attachContinueBar")
    if '"webr-validator"' in bar:
        assert "getStudies" in bar, bar
        if MODEL:
            assert "getValidatorModel" in bar, bar


def test_refused_input_hands_over_nothing():
    # Codex review (rc5): a getter that only parses would open the validator on input
    # the page itself refuses to analyse. It must return [] unless the page shows a
    # result (here: '!_lastMCMC'); openInWebR / the Continue bar then refuse to open.
    body = re.search(r"window\.__almValidatorStudies = function \(\) \{(.*?)\n\s*\};", SRC, re.S).group(1)
    assert '!_lastMCMC' in body, body
