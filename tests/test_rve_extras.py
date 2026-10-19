"""Tests for shared/rve-extras.js (rve-meta parsing, conditioning, centring, R script).

Requirements asserted:
- the parser accepts header rows, tab/semicolon delimiters, quoted labels and an
  SE column, and refuses bad rows with a row- and column-specific message;
- kappa equals the 2-norm condition number of X'WX at the fitted weights;
- centring leaves slopes, their SEs and df and tau^2 unchanged;
- the R script escapes labels so that no label can terminate an R string.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _node(script: str):
    boot = f"""
      require({json.dumps(str(ROOT / 'shared' / 'stats-qt.js'))});
      const M = require({json.dumps(str(ROOT / 'shared' / 'rve.js'))});
      const E = require({json.dumps(str(ROOT / 'shared' / 'rve-extras.js'))});
      {script}
    """
    r = subprocess.run([NODE, "-e", boot], capture_output=True, text=True, timeout=60, check=False)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_parser_header_tab_semicolon_quotes_and_se_column():
    out = _node(r"""
      const a = E.parseStudies("study\tyi\tvi\tdose\nA\t0.1\t0.04\t1\nB\t0.2\t0.05\t2");
      const b = E.parseStudies('"Smith, 2010";0.2;0.04\n"Smith, 2010";0.3;0.05\nLee;0.1;0.02');
      const c = E.parseStudies("cluster,yi,se,x\na,0.1,0.2,1\nb,0.2,0.1,2");
      console.log(JSON.stringify({a, b, c}));
    """)
    assert out["a"]["header"] and out["a"]["delimiter"] == "tab"
    assert out["a"]["predictorNames"] == ["dose"]
    assert out["a"]["rows"][1] == {"cluster": "B", "yi": 0.2, "vi": 0.05, "X": [1, 2]}
    assert out["b"]["delimiter"] == "semicolon"
    assert [r["cluster"] for r in out["b"]["rows"]] == ["Smith, 2010", "Smith, 2010", "Lee"]
    assert out["c"]["seColumn"] is True
    assert abs(out["c"]["rows"][0]["vi"] - 0.04) < 1e-15


@pytest.mark.parametrize("text,needle", [
    ("a,0.1,-0.04", "positive sampling variance"),
    ("a,0.1,0.04,NA\nb,0.2,0.03,1", "column 4"),
    ("NA,NA,NA", "is not a number"),           # a bad first row is refused, never taken as a header
    ("a;0,45;0,04", "Decimal commas"),
    ("a,0.1", "at least 3"),
    ("a,0.1,0.04,1\nb,0.2,0.03", "inconsistent number of columns"),
    ('"open,0.1,0.04', "unclosed double quote"),
])
def test_parser_refusals_are_specific(text, needle):
    out = _node(f"""
      let msg = null; try {{ E.parseStudies({json.dumps(text)}); }} catch (e) {{ msg = e.message; }}
      console.log(JSON.stringify({{ msg }}));
    """)
    assert out["msg"] is not None and needle in out["msg"], out["msg"]


def test_kappa_matches_numpy_condition_number():
    np = pytest.importorskip("numpy")
    out = _node(r"""
      const rows = E.parseStudies("a,.2,.03,1990\na,.25,.03,1991\nb,.4,.04,1995\nc,.1,.02,2004\nd,.6,.05,2003\ne,.3,.03,1999").rows;
      const f = M.fitCORR(rows, {rho: 0.8});
      console.log(JSON.stringify({X: rows.map(r => r.X), w: f.weights, kappa: E.kappaXtWX(rows, f.weights)}));
    """)
    X = np.array(out["X"], dtype=float)
    w = np.array(out["w"], dtype=float)
    k_np = np.linalg.cond(X.T @ (w[:, None] * X), 2)
    assert out["kappa"] > E_THRESHOLD
    # kappa ~ 1e11 here, so both carry relative rounding error up to ~kappa*u ~ 1e-5.
    assert abs(out["kappa"] / k_np - 1) < 1e-4


E_THRESHOLD = 1e-9 / 2.0 ** -53


def test_centring_preserves_slope_se_df_tau2_and_fixes_conditioning():
    out = _node(r"""
      const rows = E.parseStudies("a,.2,.03,1990\na,.25,.03,1991\nb,.4,.04,1995\nb,.35,.045,1995\nc,.1,.02,2004\nd,.6,.05,2003\ne,.3,.03,1999\nf,.18,.025,2010").rows;
      const u = M.fitCORR(rows, {rho: 0.8}), cen = E.centreRows(rows), c = M.fitCORR(cen.rows, {rho: 0.8});
      console.log(JSON.stringify({u: [u.beta[1], u.se_robust[1], u.df[1], u.tau2], c: [c.beta[1], c.se_robust[1], c.df[1], c.tau2],
        ku: E.kappaXtWX(rows, u.weights), kc: E.kappaXtWX(cen.rows, c.weights), mean: cen.means[0],
        meanX: cen.rows.reduce((s, r) => s + r.X[1], 0)}));
    """)
    for a, b in zip(out["u"], out["c"]):
        assert abs(a - b) <= 1e-6 * max(1.0, abs(a)), (a, b)
    assert out["ku"] > E_THRESHOLD > out["kc"]
    assert abs(out["meanX"]) < 1e-9


def test_r_string_escaping_cannot_break_out():
    out = _node(r"""
      const labels = ['a"); system("echo pwned"); ("', 'back\\slash', 'new\nline', 'tab\there', 'é ü 中', '\u{1F600}', '\x01ctrl'];
      console.log(JSON.stringify(labels.map(l => [l, E.rString(l)])));
    """)
    for raw, lit in out:
        assert lit.startswith('"') and lit.endswith('"')
        body = lit[1:-1]
        # every double quote inside the literal is escaped
        i = 0
        while i < len(body):
            if body[i] == "\\":
                i += 2
                continue
            assert body[i] != '"', lit
            assert body[i] not in "\n\r", lit
            assert ord(body[i]) < 128, lit
            i += 1


def test_r_script_contains_reference_calls_and_centring():
    out = _node(r"""
      const rows = E.parseStudies("a,.2,.03,1990\nb,.4,.04,1995\nc,.1,.02,2004\nd,.6,.05,2003").rows;
      console.log(JSON.stringify({s: E.toRScript({rows, names: ['year'], rho: 0.5, centred: true, version: 'test', generated: 'T'})}));
    """)
    s = out["s"]
    assert "d$year_c <- d$year - mean(d$year)" in s
    assert "robu(yi ~ year_c, data = d, studynum = cluster, var.eff.size = vi," in s
    assert 'modelweights = "CORR", rho = 0.5, small = TRUE)' in s
    assert 'coef_test(fit, vcov = "CR2", test = "Satterthwaite")' in s
    assert s.rstrip().endswith("sessionInfo()")


def test_r_column_names_avoid_robu_internal_columns():
    # robu() builds an internal data frame with columns study, k, weights, pred, e;
    # a predictor with one of those names must be renamed in the script.
    out = _node(r"""
      console.log(JSON.stringify(E.rColumnNames(['study', 'k', 'weights', 'e', 'pred', 'year', 'year', 'TRUE', '2x', 'a b'])));
    """)
    assert out[0] != "study" and out[1] != "k" and out[2] != "weights" and out[3] != "e" and out[4] != "pred"
    assert out[5] == "year" and out[6] != "year"
    assert len(set(out)) == len(out)
    assert out[7] == "TRUE_" and out[8] == "x_2x" and out[9] == "a_b"
