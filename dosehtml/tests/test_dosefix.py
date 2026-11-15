"""Lane dosefix (re-review rrevdose, items F2-F7): the page's exported R script, inference under HK/SJ and CI level,
logLik, and the restricted cubic spline basis, each checked against R (metafor / Hmisc) on the built-in sample.

Before (origin/main 8b30aa1b, sample data):
  F2  with study 1 excluded the page fit k=4 (b1 -0.01063, Q 5.88 on 7 df) but the exported script contained all
      5 studies and printed b1 -0.00246, Q 26.59 on 11 df (tau2 taken from the 4-study fit).
  F3  the script's "POOLED ESTIMATE" was exp(beta[2]) with a Wald z 95% CI; the page shows exp(c'b) for the dose 1 vs 0
      contrast (c = (0,1) linear, (0,1,1) quadratic), HK-scaled with t on n - p df when HK/SJ is on, at the CI level.
  F4  with HK/SJ on, the trend p-value (interpretation and report card) used pnorm while its CI used t on n - p df.
  F5  coefficient table / report coefficients / curve band stayed Wald z under HK/SJ; subgroup CIs used a fixed 95% z.
  F6  logLik used only diag(V): sample linear DL -7.59 vs the Gaussian log-likelihood -7.5139 (metafor ML at the same
      tau2); quadratic fits returned no logLik at all.
  F7  the "restricted" cubic spline was not linear beyond the last knot (second differences of the fitted sample
      curve -0.44 .. -4.85); basis now equals Hmisc::rcspline.eval(inclx = TRUE) (rms::rcs, dosresmeta).
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent


@pytest.fixture(scope='module')
def page():
    out = subprocess.run(['node', str(HERE / 'dosefix_harness.cjs')], capture_output=True, text=True,
                         timeout=300, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


def _rel(a, b):
    return abs(a - b) / max(abs(b), 1e-12)


def _rscript():
    for cand in (os.environ.get('RSCRIPT'), shutil.which('Rscript'), 'C:/Program Files/R/R-4.6.0/bin/Rscript.exe'):
        if cand and Path(cand).exists():
            return cand
    return None


# ---------------------------------------------------------------- node-only checks (no R needed) ---------------

def test_f2_export_contains_only_active_studies(page):
    for key, c in page['cases'].items():
        if not key.endswith('_EXCL'):
            continue
        code = c['code']
        sid = c['excludedId']
        line = next(l for l in code.splitlines() if l.strip().startswith('study_id = c('))
        ids = [s.strip().strip('"') for s in line.split('c(', 1)[1].rsplit(')', 1)[0].split(',')]
        assert sid not in ids, (key, sid, ids)
        assert len(set(ids)) == c['nStudies'], (key, ids, c['nStudies'])


def test_f4_trend_p_uses_t_under_hksj(page):
    # the trend test must use the same reference distribution as the CI: with HK/SJ, t on n - p df.
    from math import isfinite
    for key, c in page['cases'].items():
        pay = c['pay']
        if c['case']['hk']:
            assert pay['method'] == 'HK/SJ'
        p_txt = '%.3f' % pay['pTrend'] if pay['pTrend'] >= 0.001 else '<0.001'
        assert ('p = %s)' % p_txt) in c['interp'], (key, p_txt)
        assert isfinite(pay['pTrend'])


def test_f5_coefficient_table_header_follows_inference(page):
    for key, c in page['cases'].items():
        lab = '>t<' if c['case']['hk'] else '>z<'
        assert lab in c['coefHTML'], key
        assert ('%d%% CI' % c['case']['ci']) in c['coefHTML'], key


def test_f5_subgroup_ci_honours_level_and_hksj(page):
    from statistics import NormalDist
    sg = page['subgroup']
    w95, w90, h95 = sg['Wald_95'], sg['Wald_90'], sg['HK_95']
    for a, b, h in zip(w95, w90, h95):
        z95, z90 = NormalDist().inv_cdf(0.975), NormalDist().inv_cdf(0.95)
        import math
        assert _rel(a['rrCI'][0], math.exp(a['logRR'] - z95 * a['se'])) < 1e-12
        assert _rel(b['rrCI'][0], math.exp(b['logRR'] - z90 * b['se'])) < 1e-12   # was the 95% interval
        # HK: scaled SE and t on the subgroup's n - p df -> strictly different from Wald when s2 > 1 or df finite
        assert h['rrCI'][0] < a['rrCI'][0] - 1e-9 and h['rrCI'][1] > a['rrCI'][1] + 1e-9


def test_f7_spline_is_linear_beyond_last_knot(page):
    t = page['splineTail']
    d2 = [t[i + 2] - 2 * t[i + 1] + t[i] for i in range(len(t) - 2)]
    assert max(abs(v) for v in d2) < 1e-10, d2
    sp = page['spline']
    for d, row in zip(sp['grid'], sp['rows']):
        if d <= sp['knots'][0]:
            assert all(abs(v) < 1e-15 for v in row), (d, row)


# ---------------------------------------------------------------- R checks -------------------------------------

R_CHECK = r'''
suppressMessages({library(metafor); library(jsonlite); library(Matrix)})
args <- commandArgs(TRUE); o <- fromJSON(args[1], simplifyVector = FALSE)
num <- function(x) as.numeric(unlist(x)); out <- list()
EMIT <- paste0('\ncat("\\nRESULT_JSON", jsonlite::toJSON(list(beta = beta, se = se, tau2 = tau2, Q = Q, df = df_q, rr = rr, ',
  'ci_lower = ci_lower, ci_upper = ci_upper, p_trend = p_trend, k = n_model_studies), digits = I(17), auto_unbox = TRUE), "\\n")\n')
for (key in names(o$cases)) {
  pg <- o$cases[[key]]; cs <- pg$case; bl <- pg$blocks
  f <- file.path(args[2], paste0(key, ".R")); writeLines(c(pg$code, EMIT), f, useBytes = TRUE)
  so <- suppressWarnings(system2(file.path(R.home("bin"), "Rscript"), c("--no-environ", shQuote(f)), stdout = TRUE, stderr = TRUE))
  line <- grep("RESULT_JSON", so, value = TRUE)
  sc <- if (length(line)) fromJSON(sub(".*RESULT_JSON", "", line[1])) else list(error = paste(tail(so, 5), collapse = "\n"))
  y <- unlist(lapply(bl, function(b) num(b$y))); d <- unlist(lapply(bl, function(b) num(b$dose)))
  V <- as.matrix(bdiag(lapply(bl, function(b) matrix(num(b$V), b$n, b$n, byrow = TRUE))))
  X <- if (cs$model == "linear") cbind(1, d) else cbind(1, d, d^2); obs <- seq_along(y)
  cv <- rbind(if (cs$model == "linear") c(0, 1) else c(0, 1, 1)); test <- if (isTRUE(cs$hk)) "adhoc" else "z"
  fit <- suppressWarnings(rma.mv(y, V, mods = X, intercept = FALSE, random = ~ 1 | obs, sigma2 = pg$tau2, test = test, level = cs$ci))
  pr <- suppressWarnings(predict(fit, newmods = cv, level = cs$ci)); an <- anova(fit, X = cv)
  ml <- rma.mv(y, V, mods = X, intercept = FALSE, random = ~ 1 | obs, sigma2 = pg$tau2, method = "ML")
  out[[key]] <- list(script = sc, coef_se = fit$se, coef_lb = fit$ci.lb, coef_ub = fit$ci.ub, coef_p = fit$pval,
    ci = exp(c(pr$ci.lb, pr$ci.ub)), p_trend = an$QMp, logLik_ML = as.numeric(logLik(ml)))
}
sp <- o$spline
out$spline <- unname(as.matrix(Hmisc::rcspline.eval(num(sp$grid), knots = num(sp$knots), inclx = TRUE)[, -1, drop = FALSE]))
cat(toJSON(out, digits = I(17), auto_unbox = TRUE))
'''


@pytest.fixture(scope='module')
def rref(page):
    rs = _rscript()
    if rs is None:
        pytest.skip('Rscript not found (set RSCRIPT): the R comparison was NOT run')
    with tempfile.TemporaryDirectory() as tmp:
        jf = Path(tmp) / 'page.json'
        jf.write_text(json.dumps(page), encoding='utf-8')
        rf = Path(tmp) / 'check.R'
        rf.write_text(R_CHECK, encoding='utf-8')
        r = subprocess.run([rs, '--no-environ', str(rf), str(jf), tmp], capture_output=True, text=True, timeout=900,
                           encoding='utf-8', errors='replace', cwd=tmp)   # REML scripts draw a forest plot (Rplots.pdf)
        assert r.returncode == 0, r.stderr[-3000:]
        return json.loads(r.stdout)


def _tol(key):
    return 1e-5 if key.startswith('REML') else 1e-7


def test_f2_f3_exported_script_reproduces_the_page(page, rref):
    for key, c in page['cases'].items():
        sc = rref[key]['script']
        assert 'error' not in sc, (key, sc)
        tol = _tol(key)
        assert sc['k'] == c['nStudies'], key
        assert sc['df'] == c['df'] and _rel(sc['Q'], c['Q']) < 1e-8, (key, sc['Q'], c['Q'])
        assert abs(sc['tau2'] - c['tau2']) <= tol * max(c['tau2'], 1e-3), (key, sc['tau2'], c['tau2'])
        for a, b in zip(sc['beta'], c['beta']):
            assert _rel(a, b) < tol, (key, sc['beta'], c['beta'])
        pay = c['pay']
        assert _rel(sc['rr'], pay['rr']) < tol, (key, sc['rr'], pay['rr'])
        assert _rel(sc['ci_lower'], pay['ciLower']) < tol and _rel(sc['ci_upper'], pay['ciUpper']) < tol, (
            key, sc['ci_lower'], sc['ci_upper'], pay['ciLower'], pay['ciUpper'])
        assert _rel(sc['p_trend'], pay['pTrend']) < max(tol, 1e-6), (key, sc['p_trend'], pay['pTrend'])


def test_f3_f4_page_contrast_ci_and_trend_p_equal_metafor(page, rref):
    for key, c in page['cases'].items():
        ref = rref[key]
        assert _rel(c['pay']['ciLower'], ref['ci'][0]) < 1e-8 and _rel(c['pay']['ciUpper'], ref['ci'][1]) < 1e-8, key
        assert _rel(c['pay']['pTrend'], ref['p_trend']) < 1e-8, (key, c['pay']['pTrend'], ref['p_trend'])


def test_f5_coefficients_equal_metafor_wald_or_adhoc(page, rref):
    for key, c in page['cases'].items():
        ref = rref[key]
        for i, z in enumerate(c['pay']['coef']):
            assert _rel(z['se'], ref['coef_se'][i]) < 1e-8, (key, i, z['se'], ref['coef_se'][i])
            assert _rel(z['ciLower'], ref['coef_lb'][i]) < 1e-7 and _rel(z['ciUpper'], ref['coef_ub'][i]) < 1e-7, (key, i)
            assert _rel(z['p'], ref['coef_p'][i]) < 1e-7, (key, i, z['p'], ref['coef_p'][i])


def test_f6_loglik_is_full_v_gaussian_loglik(page, rref):
    for key, c in page['cases'].items():
        assert c['logLik'] is not None, key
        assert _rel(c['logLik'], rref[key]['logLik_ML']) < 1e-10, (key, c['logLik'], rref[key]['logLik_ML'])
    assert abs(page['cases']['DL_linear']['logLik'] - (-7.5139)) < 5e-5


def test_f7_spline_basis_equals_hmisc_rcspline_eval(page, rref):
    for row, ref in zip(page['spline']['rows'], rref['spline']):
        for a, b in zip(row, ref):
            assert abs(a - b) <= 1e-12 * max(1.0, abs(b)), (row, ref)
