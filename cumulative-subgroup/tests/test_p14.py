"""P14 engine parity and browser contract. Generate the R reference first."""
import csv
import hashlib
import io
import json
import math
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import subprocess
import threading

import pytest

APP = Path(__file__).resolve().parents[1]
REPO = APP.parent
FIXTURE = APP / "tests" / "fixtures" / "p14-fixtures.json"
GENERATOR = APP / "validate" / "p14-reference.R"
REFERENCE = APP / "validate" / "p14-reference.json"
FIX = json.loads(FIXTURE.read_text(encoding="utf-8"))
NUMBERS = ("estimate", "se", "lb", "ub", "tau2")

ENGINE = r"""
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = input.root;
const context = vm.createContext({window: {}});
for (const name of ['ma-core.js', 'build-info.js'])
  vm.runInContext(fs.readFileSync(path.join(root, 'shared', name), 'utf8'), context);
const html = fs.readFileSync(path.join(root, 'cumulative-subgroup/index.html'), 'utf8');
const match = html.match(/<script id="p14-engine">([\s\S]*?)<\/script>/);
if (!match) throw Error('P14 engine script missing');
vm.runInContext(match[1], context);
const api = context.window.AlmP14;
"""


def node(code, payload=None, engine=True, timeout=120):
    executable = shutil.which("node")
    assert executable, "Node is required; P14 validation must not silently skip."
    proc = subprocess.run(
        [executable, "-e", (ENGINE if engine else "") + code],
        input=json.dumps({"root": str(REPO), **(payload or {})}),
        text=True, encoding="utf-8", capture_output=True,
        cwd=REPO / "hub" / "shared" / "tests", timeout=timeout,
    )
    assert proc.returncode == 0, proc.stdout + "\n" + proc.stderr
    return json.loads(proc.stdout)


@pytest.fixture(scope="module")
def reference():
    assert REFERENCE.is_file(), "Generate validate/p14-reference.json with p14-reference.R first."
    ref = json.loads(REFERENCE.read_text(encoding="utf-8"))
    assert ref["schema"] == "cumsub-p14-reference-v1"
    assert ref["fixture_md5"] == hashlib.md5(FIXTURE.read_bytes()).hexdigest()
    assert ref["generator_md5"] == hashlib.md5(GENERATOR.read_bytes()).hexdigest()
    assert ref["versions"]["R"].startswith("R version")
    assert ref["versions"]["metafor"]
    expected = {
        f'{d["id"]}/{s["model"]}/{s["ci"]}'
        for d in FIX["datasets"] for s in FIX["settings"]
    } | {f["id"] for f in FIX["faults"]}
    assert {c["id"] for c in ref["cases"]} == expected
    assert len(ref["cases"]) == len(expected)
    return ref


@pytest.fixture(scope="module")
def results(reference):
    return node(r"""
const datasets = new Map(input.fixtures.datasets.map(d => [d.id, d]));
const outputs = {};
for (const c of input.cases) {
  const data = datasets.get(c.dataset).rows;
  const failCounts = c.fail_years.map(y => data.filter(r => r.year <= y).length);
  const core = context.window.AlmMaCore, original = core.pool;
  try {
    // Fault injection is confined to the harness, never a production setting.
    core.pool = function(yi, vi, opts) {
      if (failCounts.includes(yi.length)) throw RangeError('Forced REML non-convergence');
      return original(yi, vi, opts);
    };
    const settings = {model: c.model, ci: c.ci};
    const result = api.analyze(data, settings);
    const reversed = api.analyze(data.slice().reverse(), settings);
    if (JSON.stringify(result) !== JSON.stringify(reversed))
      throw Error('Within-year permutation changed results: ' + c.id);
    if (result.app_version !== context.window.AlmBuildInfo.version)
      throw Error('Missing app version');
    outputs[c.id] = {result, csv: api.csv(result)};
  } finally { core.pool = original; }
}
process.stdout.write(JSON.stringify(outputs));
""", {"fixtures": FIX, "cases": reference["cases"]})


def test_every_year_block_matches_metafor(reference, results):
    for case in reference["cases"]:
        actual = results[case["id"]]["result"]
        assert actual["settings"] == {
            "model": case["model"], "ci": case["ci"], "level": 0.95, "null": 0
        }
        assert len(actual["blocks"]) == len(case["blocks"])
        for got, want in zip(actual["blocks"], case["blocks"]):
            where = (case["id"], want["year"])
            assert got.keys() == want.keys(), where
            for key in got:
                if key not in NUMBERS or want[key] is None:
                    assert got[key] == want[key], (where, key, got[key], want[key])
                else:
                    assert isinstance(got[key], (float, int)) and math.isfinite(got[key])
                    tolerance = 1e-6 if key == "tau2" else 1e-9 * (1 + abs(want[key]))
                    assert abs(got[key] - want[key]) <= tolerance, (where, key, got[key], want[key])
        for name in ("primary", "sensitivity_a"):
            assert actual[name] == case[name], (case["id"], name)


def test_reference_covers_named_behaviors(results):
    def result(name, model="FE", ci="wald"):
        return results[f"{name}/{model}/{ci}"]["result"]
    sustained = result("sustained_missing_n_sensitivity")
    assert sustained["blocks"][0]["status"] == "NOT_EVALUATED"
    assert sustained["blocks"][0]["evaluated"] is False
    assert sustained["primary"]["year_star"] == 2001
    assert sustained["primary"]["N_later"] is None
    assert sustained["primary"]["N_later_incomplete"] is True
    assert sustained["sensitivity_a"]["year_star"] == 2004
    assert sustained["sensitivity_a"]["N_later_incomplete"] is False
    assert sustained["sensitivity_a"]["K_lag2"] == 1
    transient = result("transient")
    assert transient["blocks"][0]["status"] == "ABOVE"
    assert transient["blocks"][-1]["status"] == "INCLUDES"
    for name in ("transient", "null_final", "final_only", "single", "one_block"):
        assert result(name)["primary"]["result"] == "NOT_CONCLUSIVE"
    assert result("final_only")["blocks"][-1]["status"] == "ABOVE"
    fault = results["forced_reml_final"]["result"]
    assert fault["blocks"][-1]["status"] == "UNDEFINED"
    assert fault["primary"]["result"] == "INDETERMINATE"
    for model in ("DL", "REML"):
        assert result("zero_residual_hk", model, "hk")["blocks"][0]["se"] == 0
        assert result("zero_residual_hk", model, "hk")["blocks"][0]["status"] == "ABOVE"
    assert result("heterogeneous", "DL")["blocks"][-1]["tau2"] > 0
    assert result("heterogeneous", "REML")["blocks"][-1]["tau2"] > 0
    assert result("heterogeneous", "DL")["blocks"][-1]["tau2"] != result("heterogeneous", "REML")["blocks"][-1]["tau2"]


def test_exact_zero_comparisons_and_undefined_suffixes(reference):
    got = node(r"""
const comparisons = input.fixtures.comparisons.map(p => api.classify(p));
const decisions = input.fixtures.decisions.map(f => {
  const blocks = f.statuses.map((status, i) =>
    ({year: 2000 + i, k: i + 2, evaluated: true, status}));
  const rows = [{year: 2000, n: 10}].concat(blocks.map(b => ({year: b.year, n: 10})));
  return api.decide(blocks, rows, 2);
});
process.stdout.write(JSON.stringify({comparisons, decisions}));
""", {"fixtures": FIX})
    assert got["comparisons"] == reference["comparisons"]
    assert got["decisions"] == reference["decisions"]
    assert got["comparisons"] == [p["expected"] for p in FIX["comparisons"]]
    for decision, fixture in zip(got["decisions"], FIX["decisions"]):
        assert decision["result"] == fixture["expected"]
        assert decision["j_star"] == fixture["j_star"]


def test_refuse_bad_input_and_invalid_model():
    errors = node(r"""
const base = {yi: 0.5, sei: 0.2, year: 2000};
const rows = [
  [{...base, year: null}], [{...base, year: 2000.5}], [{...base, year: '2000'}],
  [{...base, year: 0}], [{...base, year: 10000}], [{yi: 0.5, sei: 0.2}],
  [{...base, yi: null}], [{...base, sei: 0}], [{...base, sei: -1}],
  [{...base, sei: 1e-300}], [{...base, vi: 0.04}], [{...base, n: -1}],
  [{...base, n: 1.5}], [{...base, n: '100'}], [{...base, label: 4}], []
];
const errors = rows.map(data => {
  try { api.analyze(data, {model: 'FE', ci: 'wald'}); return null; }
  catch (e) { return e.message; }
});
for (const settings of [{model: 'FE', ci: 'hk'}, {model: 'PM', ci: 'wald'},
                        {model: 'DL', ci: 'other'}]) {
  try { api.analyze([base], settings); errors.push(null); }
  catch (e) { errors.push(e.message); }
}
for (const value of [NaN, Infinity, -Infinity])
  if (api.classify({estimate: value, se: 1, lb: -1, ub: 1}) !== 'UNDEFINED')
    throw Error('Non-finite value accepted');
process.stdout.write(JSON.stringify(errors));
""")
    assert len(errors) == 19
    assert all(isinstance(e, str) and e for e in errors)


def test_csv_contains_all_blocks_and_both_summaries(results):
    def cell(value):
        if value is None:
            return ""
        if isinstance(value, bool):
            return str(value).lower()
        return str(value)
    for exported in results.values():
        result = exported["result"]
        rows = list(csv.DictReader(io.StringIO(exported["csv"])))
        assert len(rows) == len(result["blocks"])
        for row, block in zip(rows, result["blocks"]):
            assert row["app_version"] == result["app_version"]
            assert row["model"] == result["settings"]["model"]
            assert row["ci"] == result["settings"]["ci"]
            for name in ("primary", "sensitivity_a"):
                for key, value in result[name].items():
                    assert row[f"{name}.{key}"] == cell(value)
            for key, value in block.items():
                if key in NUMBERS and value is not None:
                    assert float(row[key]) == value
                else:
                    assert row[key] == cell(value)


@pytest.fixture(scope="module")
def app_url():
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(("127.0.0.1", 8000), partial(Handler, directory=str(REPO)))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield "http://127.0.0.1:8000/cumulative-subgroup/index.html"
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)


def test_browser_panel_exports_refusal_and_legacy_isolation(app_url):
    outcome = node(r"""
const fs = require('node:fs'), assert = require('node:assert/strict');
const {chromium} = require('@playwright/test');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
(async () => {
  const browser = await chromium.launch({headless: true, channel: process.env.PW_CHANNEL || undefined});
  try {
    const page = await browser.newPage({acceptDownloads: true});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(input.url);
    await page.waitForFunction(() => !!window._almLastCumSub && !!window._almLastCumSub());
    const legacy = () => page.evaluate(() => ({
      results: window._almLastCumSub(), svg: document.getElementById('svg-host').innerHTML,
      data: document.getElementById('f-data').value
    }));
    const before = await legacy();
    assert.equal(await page.locator('#p14-data').count(), 0);
    await page.locator('#p14-panel > summary').click();
    await page.locator('#p14-data').fill(JSON.stringify(input.rows));
    await page.locator('#p14-run').click();
    assert.match(await page.locator('#p14-message').innerText(), /Primary: CONCLUSIVE/);
    assert.equal(await page.locator('#p14-ci').isDisabled(), true);
    assert.equal(await page.locator('#p14-steps tr').count(), new Set(input.rows.map(r => r.year)).size);
    async function download(id) {
      const pending = page.waitForEvent('download');
      await page.locator(id).click();
      const item = await pending, chunks = [];
      for await (const chunk of await item.createReadStream()) chunks.push(chunk);
      return Buffer.concat(chunks).toString('utf8');
    }
    const json = JSON.parse(await download('#p14-json'));
    const csv = await download('#p14-csv');
    const expected = await page.evaluate(rows => AlmP14.analyze(rows, {model:'FE',ci:'wald'}), input.rows);
    assert.deepEqual(json, expected);
    assert.equal(csv, await page.evaluate(r => AlmP14.csv(r), expected));
    await page.locator('#p14-model').selectOption('REML');
    assert.equal(await page.locator('#p14-json').isDisabled(), true);
    assert.equal(await page.locator('#p14-ci').isEnabled(), true);
    await page.locator('#p14-ci').selectOption('hk');
    await page.locator('#p14-run').click();
    assert.match(await page.locator('#p14-message').innerText(), /REML \/ hk/);
    await page.locator('#p14-data').fill('[{"yi":0.3,"sei":0.1}]');
    await page.locator('#p14-run').click();
    assert.match(await page.locator('#p14-message').innerText(), /valid integer year/);
    assert.equal(await page.locator('#p14-steps tr').count(), 0);
    assert.equal(await page.locator('#p14-json').isDisabled(), true);
    assert.equal(await page.locator('#p14-csv').isDisabled(), true);
    await page.locator('#p14-data').fill('invalid json');
    await page.locator('#p14-run').click();
    assert.match(await page.locator('#p14-message').innerText(), /P14 refused/);
    assert.deepEqual(await legacy(), before);
    assert.deepEqual(errors, []);
    process.stdout.write(JSON.stringify({ok: true}));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
""", {"url": app_url, "rows": FIX["datasets"][0]["rows"]}, engine=False)
    assert outcome == {"ok": True}
