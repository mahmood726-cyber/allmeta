"""/rob/ must start and work when browser storage is denied (P39 limitation sweep L23).

Requirement: with localStorage throwing (blocked site data, some private modes), the page still
starts (render + test hook), a study can be added, and the user is told that saving failed.
Before the fix, an unguarded localStorage.getItem("rob-ai-key") at startup threw and stopped the
rest of the script. Drives system Chrome via playwright-core (ALM_PLAYWRIGHT_CORE); skips without it.
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
const root = process.argv[1];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch(process.env.ALM_CHROME ? { executablePath: process.env.ALM_CHROME, headless: true } : { channel: 'chrome', headless: true });
  try {
    const p = await b.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } }); });
    await p.goto('http://127.0.0.1:' + srv.address().port + '/rob/', { waitUntil: 'load' });
    await p.waitForTimeout(300);
    const hook = await p.evaluate(() => !!window.__almRob);
    let added = null;
    if (hook) {
      await p.fill('#add-label', 'Smith 2019');
      await p.fill('#add-text', 'Randomisation used a computer-generated sequence; allocation was concealed with opaque sealed envelopes.');
      await p.click('#btn-add'); await p.waitForTimeout(300);
      added = await p.evaluate(() => window.__almRob.state().studies.length);
    }
    const toast = await p.evaluate(() => (document.getElementById('__toast') || {}).textContent || '');
    process.stdout.write(JSON.stringify({ hook, added, toast, errs }));
  } finally { await b.close(); srv.close(); }
});
"""


@pytest.fixture(scope="module")
def run():
    r = subprocess.run([NODE, "-e", DRIVER, str(ROOT)], capture_output=True, text=True, encoding="utf-8",
                       timeout=180, env=dict(os.environ))
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_starts_with_storage_denied(run):
    assert run["hook"], run["errs"]
    assert not [e for e in run["errs"] if "SecurityError" in e or "denied" in e], run["errs"]


def test_study_added_and_save_failure_reported(run):
    assert run["added"] == 1
    assert "not saved" in run["toast"].lower(), run["toast"]
