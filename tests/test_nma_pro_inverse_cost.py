"""nma-pro-v8.0 Matrix.inverse re-factorised the matrix once per column.

Matrix.inverse(A) called Matrix.solve(A, e_j) for every column j, and Matrix.solve runs a fresh
Matrix.lu(A) each time, so an n x n inverse cost n LU factorisations (O(n^4)). fitGLS inverts the
n x n contrast covariance on every call, and since the REML/ML rewrite (ecffd5fc, 2026-11-12) one
estimateTau2 makes ~145 fitGLS calls (grid of 81 + golden section) instead of ~25, so the
post-analysis robustness suite (181 bootstrap fits) took the thrombolytics run from ~4 s to ~12 s
on pc2 and pushed tests/playwright/nma-pro-session-plots.spec.mjs past its 5 s overlay wait on CI.

The fix factorises once and runs the same forward/back substitution per column. The substitution
for column j starts from (P e_j)_i = P[i][j], which is exactly what Matrix.multiply(P, e_j) yields
(sums of 0*x and one 1*1), so the inverse is bit-identical, not just close; the tests check that
bit for bit, and that analyze() gives byte-identical JSON under the old and new inverse.
"""
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CHROME = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
APP = "nma-pro-v2/nma-pro-v8.0.html"

# The pre-fix implementation, verbatim, used as the reference.
OLD_INVERSE = """A => { const n = A.length, I = Matrix.identity(n), inv = Matrix.zeros(n, n);
  for (let j = 0; j < n; j++) { const col = Matrix.solve(A, I.map(r => r[j])); for (let i = 0; i < n; i++) inv[i][j] = col[i]; }
  return inv; }"""


@pytest.fixture(scope="module")
def pg():
    sync_api = pytest.importorskip("playwright.sync_api")
    if not CHROME.exists():
        pytest.skip("system Chrome not found")
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = partial(Quiet, directory=str(ROOT))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    pw = sync_api.sync_playwright().start()
    br = pw.chromium.launch(executable_path=str(CHROME), headless=True)
    page = br.new_page()
    page.goto(f"http://127.0.0.1:{srv.server_address[1]}/{APP}", wait_until="load", timeout=120000)
    page.wait_for_function("() => typeof FrequentistNMA !== 'undefined' && typeof BenchmarkDatasets !== 'undefined'")
    yield page
    br.close()
    pw.stop()
    srv.shutdown()


def test_inverse_factorises_once(pg):
    calls = pg.evaluate("""() => { const lu = Matrix.lu; let k = 0; Matrix.lu = function (...a) { k++; return lu.apply(this, a); };
        const n = 12, A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? n : 0) + 1 / (1 + i + 2 * j)));
        try { Matrix.inverse(A); } finally { Matrix.lu = lu; } return k; }""")
    assert calls == 1, f"Matrix.inverse of a 12 x 12 matrix ran Matrix.lu {calls} times (one LU per column)"


def test_inverse_is_bit_identical_to_column_solves(pg):
    bad = pg.evaluate("""old => { const oldInv = eval(old); let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5;
        const out = [];
        for (let rep = 0; rep < 200; rep++) { const n = 1 + rep % 15, A = Array.from({ length: n }, () => Array.from({ length: n }, rnd));
          if (rep % 2) for (let i = 0; i < n; i++) { for (let j = 0; j < i; j++) A[i][j] = A[j][i]; A[i][i] += n; }   // SPD-ish half
          if (rep % 7 === 3 && n > 2) A[1] = A[0].slice();                                                        // singular case
          const a = oldInv(A), b = Matrix.inverse(A);
          for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!Object.is(a[i][j], b[i][j])) out.push([rep, n, i, j, a[i][j], b[i][j]]); }
        return out.slice(0, 5).concat([out.length]); }""", OLD_INVERSE)
    assert bad == [0], f"inverse differs from the column-solve reference: {bad}"


@pytest.mark.parametrize("dataset", ["thrombolytics", "painkillers"])
def test_analyze_output_unchanged(pg, dataset):
    same = pg.evaluate("""([ds, old]) => { BenchmarkDatasets.loadDataset(ds);
        const o = { reference: document.getElementById('referenceSelect').value, effectMeasure: document.getElementById('effectMeasureSelect').value,
                    estimator: 'REML', smallStudyCorrection: 'hksj', predictionIntervals: true };
        const run = () => JSON.stringify(FrequentistNMA.analyze(AppState.studies, o));
        const cur = Matrix.inverse, a = run(); Matrix.inverse = eval(old);
        let b; try { b = run(); } finally { Matrix.inverse = cur; }
        return { same: a === b, len: a.length }; }""", [dataset, OLD_INVERSE])
    assert same["len"] > 1000 and same["same"], same
