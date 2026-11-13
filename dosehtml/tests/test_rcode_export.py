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
