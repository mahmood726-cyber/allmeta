"""The exported R script (generateRCode) must be valid R, and its heterogeneity test must be the standard Cochran Q.

Before: the coefficient print lines were joined by the two characters backslash-n instead of a newline, so every exported
script stopped with "Error: unexpected '\'" at the coefficient block (R 4.6.0) and never printed Q; and in the default
(fixed DL tau2) branch Q was the residual at tau2_fixed with df = (studies - 1) * p, not Q_E with df = n - p.
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / 'dose-response-pro.html').read_text(encoding='utf-8')


def _coefficient_lines():
    m = re.search(r"const coefficientOutputLines = isLinearModel\s*\?\s*('(?:[^'\\]|\\.)*')\s*:\s*('(?:[^'\\]|\\.)*');", HTML)
    assert m, 'coefficientOutputLines not found'
    out = subprocess.run(['node', '-e', 'process.stdout.write(JSON.stringify([%s, %s]))' % (m.group(1), m.group(2))],
                         capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_coefficient_print_lines_are_separate_r_statements():
    for value in _coefficient_lines():
        lines = value.split('\n')
        assert len(lines) >= 2
        for line in lines:
            assert line.startswith('cat("') and line.endswith(', "' + chr(92) + 'n")') and chr(92) + 'ncat(' not in line, line


def test_fixed_tau2_branch_reports_standard_q():
    i = HTML.find('# Fixed tau2 GLS to mirror app')
    j = HTML.find('# DISPLAY RESULTS', i)
    branch = HTML[i:j]
    k = branch.rfind('Q <- ')
    assert k > 0
    tail = branch[k:]
    assert 'Vinv_q' in tail and 'df_q <- nrow(X_total) - ncol(X_total)' in tail


# ---- the exported script, run end to end in R ------------------------------------------------------------------
import os
import shutil
import tempfile

import pytest

HERE = Path(__file__).resolve().parent
EMIT = ('\ncat("\nRESULT_JSON", jsonlite::toJSON(list(beta = beta, se = se, tau2 = tau2, Q = Q, df = df_q, '
        'pi_lower = pi_lower, pi_upper = pi_upper, pi_df = pi_df), '
        'digits = I(17), auto_unbox = TRUE), "\n")\n')


def _rscript():
    for cand in (os.environ.get('RSCRIPT'), shutil.which('Rscript'), 'C:/Program Files/R/R-4.6.0/bin/Rscript.exe'):
        if cand and Path(cand).exists():
            return cand
    return None


def _export_runs():
    out = subprocess.run(['node', str(HERE / 'rcode_export_harness.cjs')], capture_output=True, text=True,
                         timeout=300, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    cases = json.loads(out.stdout)
    rs = _rscript()
    if rs is None:
        pytest.skip('Rscript not found (set RSCRIPT): the exported R script was NOT run')
    runs = {}
    with tempfile.TemporaryDirectory() as tmp:
        for key, case in cases.items():
            f = Path(tmp) / (key + '.R')
            extra = ''
            if key.startswith('REML'):
                # restricted log-likelihood at R's REML tau2 and at the page's (same model, sigma2 fixed)
                extra = ('cat("\\nREML_LL", sprintf("%%.15f %%.15f", as.numeric(logLik(fit)), '
                         'as.numeric(logLik(update(fit, sigma2 = %r)))), "\\n")\n' % case['page']['tau2'])
            f.write_text(case['code'] + EMIT + extra, encoding='utf-8')
            r = subprocess.run([rs, '--no-environ', str(f)], capture_output=True, text=True, timeout=300,
                               encoding='utf-8', errors='replace', cwd=tmp)
            runs[key] = (case['page'], r)
    return runs


@pytest.fixture(scope='module')
def export_runs():
    return _export_runs()


def _rel(a, b):
    return abs(a - b) / max(abs(b), 1e-12)


@pytest.mark.parametrize('key', ['DL_quadratic', 'DL_linear', 'REML_quadratic', 'REML_linear'])
def test_exported_script_runs_to_the_end_and_matches_the_page(export_runs, key):
    page, r = export_runs[key]
    assert r.returncode == 0, r.stdout[-1500:] + r.stderr[-1500:]
    assert '=== POOLED ESTIMATE ===' in r.stdout and 'RESULT_JSON' in r.stdout
    res = json.loads(r.stdout.split('RESULT_JSON', 1)[1].strip().splitlines()[0])
    # DL: the export fixes tau2 at the page's value, so everything agrees to rounding. REML: metafor's default nlminb
    # stops within ~2e-6 (relative) of the maximiser on these flat profiles, while the page bisects the exact score to
    # floating-point resolution; so tau2/beta/SE are compared at 1e-5 and the page's tau2 must have a restricted
    # log-likelihood (evaluated by metafor) at least as high as metafor's own estimate.
    tol = 1e-5 if key.startswith('REML') else 1e-8
    if key.startswith('REML'):
        ll_r, ll_page = map(float, r.stdout.split('REML_LL', 1)[1].split()[:2])
        assert ll_page >= ll_r - 1e-10, (ll_page, ll_r)
    assert _rel(res['tau2'], page['tau2']) <= tol, (res['tau2'], page['tau2'])
    for a, b in zip(res['beta'], page['beta']):
        assert _rel(a, b) <= tol, (res['beta'], page['beta'])
    for a, b in zip(res['se'], page['se']):
        assert _rel(a, b) <= tol, (res['se'], page['se'])
    assert _rel(res['Q'], page['Q']) <= 1e-8 and res['df'] == page['df'], (res['Q'], res['df'], page['Q'], page['df'])


@pytest.mark.parametrize('key', ['DL_quadratic', 'DL_linear', 'REML_quadratic', 'REML_linear'])
def test_exported_script_prints_the_pages_prediction_interval_t_k_minus_1(export_runs, key):
    # Before: the exported script printed no prediction interval, and the page used t on k - 2 df. Now both use
    # t_{k-1}, k = number of studies (Cochrane Handbook v6.5).
    page, r = export_runs[key]
    assert r.returncode == 0, r.stdout[-1500:] + r.stderr[-1500:]
    assert '95%% PI (new study, dose 1 vs 0; t on %d df)' % (page['nStudies'] - 1) in r.stdout
    res = json.loads(r.stdout.split('RESULT_JSON', 1)[1].strip().splitlines()[0])
    assert res['pi_df'] == page['nStudies'] - 1
    tol = 1e-5 if key.startswith('REML') else 1e-8
    assert _rel(res['pi_lower'], page['piLower']) <= tol and _rel(res['pi_upper'], page['piUpper']) <= tol, (
        res['pi_lower'], res['pi_upper'], page['piLower'], page['piUpper'])
