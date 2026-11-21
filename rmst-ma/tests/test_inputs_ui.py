"""rmst-ma: what the user sees when input rows are refused or the fit fails (paper 37 limitation sweep).

Requirements:
- L02: a row that is not used must be named on the page (line number and reason); never a silent subset.
- L03: a row must have exactly three fields (label, RMST difference, SE). A fourth field (e.g. a horizon
  column) or decimal commas must not be silently re-read as other numbers.
- L04: an SE whose square is not a positive finite variance is refused by name; if pooling still fails,
  the page must not leave the previous analysis visible as if it were the current one.
Drives the real page in system Chrome (playwright-core from ALM_PLAYWRIGHT_CORE). Skips without it.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")
PW = os.environ.get("ALM_PLAYWRIGHT_CORE")
pytestmark = pytest.mark.skipif(not (NODE and PW and Path(PW).is_dir()),
                                reason="needs node and ALM_PLAYWRIGHT_CORE=<dir of playwright-core>")

DRIVER = r"""
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.ALM_PLAYWRIGHT_CORE);
const [root, casesJson] = process.argv.slice(1);
const cases = JSON.parse(casesJson);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch(process.env.ALM_CHROME ? { executablePath: process.env.ALM_CHROME, headless: true } : { channel: 'chrome', headless: true });
  const out = {};
  try {
    for (const c of cases) {
      const p = await b.newPage();
      await p.goto('http://127.0.0.1:' + srv.address().port + '/rmst-ma/', { waitUntil: 'load' });
      await p.waitForTimeout(200);
      if (c.js) await p.evaluate(c.js);
      if (c.click) { await p.click(c.click); await p.waitForTimeout(300); }
      if (c.text != null) { await p.fill('#f-data', c.text); await p.dispatchEvent('#f-data', 'input'); }
      await p.waitForTimeout(200);
      out[c.id] = await p.evaluate(() => ({
        headline: document.getElementById('headline').textContent,
        rows: document.querySelectorAll('#res-body tr').length,
        forest: document.getElementById('forest-host').innerHTML.length,
        notes: (document.getElementById('parse-notes') || { textContent: null }).textContent,
        last: window._almLastRMST(), rstate: window.__almRmstRState(),
        rout: (document.getElementById('rcheck-out') || {}).textContent || '',
        rstatus: (document.getElementById('rcheck-status') || {}).textContent || '',
        webrDisabled: !!(document.getElementById('rcheck-webr') || {}).disabled }));
      await p.close();
    }
  } finally { await b.close(); srv.close(); }
  process.stdout.write(JSON.stringify(out));
});
"""

GOOD = "A, 1.2, 0.4\nB, 0.8, 0.5\nC, 2.1, 0.6"
STUB = ("window.AlmWebR = { runR: function () { return Promise.resolve({ ok: true, stdout: 'R says\\nMATCH 9/9', "
        "versions: { webR: 'stub' } }); } };")
CASES = [
    {"id": "default", "text": None},
    {"id": "L02", "text": "A, 1.2, 0.4\nB, 0.8\nC, x, 0.6\nD, 0.5, -1\nE, 1.5, 0.55"},
    {"id": "L03-horizon", "text": "A, 12, 1.2, 0.4\nB, 12, 0.8, 0.5\nC, 12, 2.1, 0.6"},
    {"id": "L03-deccomma", "text": GOOD + "\nD, 1,2, 0,4"},
    {"id": "L04-range", "text": GOOD + "\nD, 1, 1e200\nE, 1, 1e-200"},
    # pooling that throws: make ma-core's pool throw for this run only
    {"id": "L04-throw", "js": "window.AlmMaCore.pool = function () { throw new RangeError('planted failure'); };",
     "text": GOOD},
    # L14: a completed R verdict (stubbed WebR runner) must not survive an edit of the analysis
    {"id": "L14-control", "js": STUB, "click": "#rcheck-webr", "text": None},
    {"id": "L14-edit", "js": STUB, "click": "#rcheck-webr", "text": GOOD},
    # review of PR #647: an edit while WebR is still running must not re-enable Verify (run never settles here)
    {"id": "L14-inflight", "js": "window.AlmWebR = { runR: function () { return new Promise(function () {}); } };",
     "click": "#rcheck-webr", "text": GOOD},
    {"id": "L04-overflow", "text": "A, 1e308, 1\nB, 1.7e308, 1\nC, 1.7e308, 1"},
]


@pytest.fixture(scope="module")
def driven():
    r = subprocess.run([NODE, "-e", DRIVER, str(ROOT), json.dumps(CASES)], capture_output=True, text=True, encoding="utf-8",
                       timeout=300, env=dict(os.environ))
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_default_example_unchanged(driven):
    d = driven["default"]
    assert d["headline"] == ("k = 6 · pooled RMST difference = 1.083 [0.739, 1.427] · τ² = 0.0000 · I² = 0.0% "
                             "· 95% PI [0.631, 1.535]")
    assert d["notes"] == ""


def test_L02_refused_rows_are_named(driven):
    d = driven["L02"]
    assert d["last"]["k"] == 2
    n = d["notes"]
    for line in ("line 2", "line 3", "line 4"):
        assert line in n, n
    assert "3 rows not used" in n or "3 of 5 rows not used" in n, n


def test_L03_extra_column_refused(driven):
    d = driven["L03-horizon"]
    assert d["last"] is None and d["rstate"] is None
    assert "4 fields" in d["notes"], d["notes"]


def test_L03_decimal_comma_refused(driven):
    d = driven["L03-deccomma"]
    assert d["last"]["k"] == 3
    assert [s["label"] for s in d["last"]["studies"]] == ["A", "B", "C"]
    assert "line 4" in d["notes"] and "5 fields" in d["notes"], d["notes"]


def test_L04_out_of_range_se_refused(driven):
    d = driven["L04-range"]
    assert d["last"]["k"] == 3
    assert "line 4" in d["notes"] and "line 5" in d["notes"], d["notes"]


def test_L04_failed_fit_clears_display(driven):
    d = driven["L04-throw"]
    assert d["last"] is None and d["rstate"] is None
    assert d["rows"] == 0 and d["forest"] == 0
    assert "k = " not in d["headline"] and "planted failure" in d["headline"], d["headline"]


def test_L04_non_finite_result_not_displayed(driven):
    d = driven["L04-overflow"]
    assert d["last"] is None and d["rows"] == 0 and d["forest"] == 0
    assert "k = " not in d["headline"], d["headline"]


def test_L14_stub_verdict_shown_without_edit(driven):
    # control: the stubbed runner's verdict is displayed when nothing changes
    assert "MATCH 9/9" in driven["L14-control"]["rout"]


def test_L14_completed_verdict_cleared_by_edit(driven):
    d = driven["L14-edit"]
    assert "MATCH" not in d["rout"] and "MATCH" not in d["rstatus"], (d["rout"], d["rstatus"])


def test_L14_verify_stays_disabled_while_run_in_flight(driven):
    assert driven["L14-inflight"]["webrDisabled"] is True
