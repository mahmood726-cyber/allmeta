import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('heterogeneity/index.html');
const adapter = read('heterogeneity/validate/adapter.js');
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'locate production code: ' + start);
  return source.slice(a, b);
}
function harness() {
  const ctx = vm.createContext({ window: {}, setTimeout, Event: class {} });
  for (const path of ['shared/ma-core.js', 'shared/heterogeneity-ci.js']) {
    vm.runInContext(read(path), ctx);
  }
  vm.runInContext('var Z975 = 1.959963984540054;\n' +
    section(html, '    function parseStudies(text)', '    function renderStats('), ctx);
  return ctx;
}

test('regression: verified BCG and ordinary-label corpus cases retain numerical references through strict parsing', async () => {
  const ctx = harness();
  const loaded = {};
  // Verify the shipped bytes exactly as the browser framework does before replay.
  const files = JSON.parse(adapter.match(/const files = (\[.*\]);/)[1]);
  for (const file of files) {
    const bytes = readFileSync(new URL('heterogeneity/' + file.path, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    loaded[file.path] = JSON.parse(bytes);
  }
  // Keep the quick gate bounded: one comma-label regression and one ordinary-label control.
  const ids = new Set(['dat.bcg#1', 'dat.aloe2013#1']);
  loaded[files[0].path] = loaded[files[0].path].filter(c => ids.has(c.id));
  loaded[files[1].path] = loaded[files[1].path].filter(r => ids.has(r.analysis));
  assert.equal(loaded[files[0].path].length, 2);
  const original = 'Control,-0.12,0.15\nOther,0.05,0.30';
  const data = { value: original, dispatchEvent() {} }, select = { value: 'reml' };
  ctx.document = { getElementById: id => id === 'f-data' ? data : select };
  ctx.AlmValidate = { compare(a, b, kind, tol) {
    const diff = Math.abs(a - b) / (kind === 'rel' ? Math.max(1, Math.abs(b)) : 1);
    return { diff, pass: Number.isFinite(diff) && diff <= tol };
  } };
  let displayInputs = 0;
  // Exercise the replay's displayed-input path, not browser rendering itself.
  ctx.displayAudit = result => {
    const shown = ctx.window.__almHetCompute(data.value, select.value);
    assert.deepEqual(shown, result);
    assert.deepEqual(ctx.parseStudies(data.value).studies.map(s => s.label), result.baujat.map(s => s.label));
    assert.equal(result.baujat[0].label, result.k === 13 ? 'Aronson, 1948' : '1');
    displayInputs++;
    return { numbers: 0, fails: [] };
  };
  vm.runInContext(section(adapter, '  const KEYS =', '  const repo =') +
    section(adapter, '  async function replay(', '  const adapter ='), ctx);
  const result = await ctx.replayWithoutWrites(loaded, () => {});
  // Each case: 9 common checks, 8 refusal checks, then 9 + 7*k per compared fit.
  const expectedChecks = (9 + 8 + 8 * (9 + 7 * 13)) + (9 + 8 + 7 * (9 + 7 * 5));
  assert.equal(result.checks, expectedChecks);
  assert.equal(result.passed, expectedChecks);
  assert.equal(result.failed.length, 0);
  assert.equal(result.refusals.configurations, 16);
  assert.equal(result.refusals.refused, 1);
  assert.equal(result.refusals.compared, 15);
  assert.equal(displayInputs, 16);
  assert.equal(data.value, original);
  assert.equal(select.value, 'reml');
});

test('control: user input still rejects ambiguous surplus fields; quoted labels preserve values', () => {
  const ctx = harness();
  for (const row of ['Jones,-0.12,0,15', 'Aronson, 1948,-0.12,0.15', 'Site A, Trial B,-0.12,0.15']) {
    const result = ctx.window.__almHetCompute(row + '\nOther,0.05,0.30', 'pm');
    assert.equal(result.notPooled, true);
    assert.equal(result.k, 0);
  }
  const parsed = ctx.parseStudies('"Aronson, 1948",-0.12,0.15\n"Study ""A"", team",0.05,0.30');
  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.studies[0].label, 'Aronson, 1948');
  assert.equal(parsed.studies[0].est, -0.12);
  assert.equal(parsed.studies[0].se, 0.15);
  assert.equal(parsed.studies[1].label, 'Study "A", team');
  assert.equal(parsed.studies[1].est, 0.05);
  assert.equal(parsed.studies[1].se, 0.30);
});
