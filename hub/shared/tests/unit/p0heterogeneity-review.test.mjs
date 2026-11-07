import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../heterogeneity/index.html', import.meta.url), 'utf8');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'locate production code: ' + start);
  return html.slice(a, b);
}
const parser = section('    function parseStudies(text) {', '    function weightedSums(');
function harness() {
  const input = { value: '', dispatchEvent() {} };
  const ctx = vm.createContext({
    window: {}, document: { getElementById: () => input }, Event: class {},
    Toast: { show(message) { assert.fail(message); } }, render() {},
  });
  vm.runInContext(parser, ctx);
  vm.runInContext(section('    window.__almLoad = function (rows) {', '    // Return the last pooled result'), ctx);
  vm.runInContext(section('    function onBusLoad() {', '    function onBusSave() {'), ctx);
  return { ctx, input, parse: text => JSON.parse(JSON.stringify(ctx.parseStudies(text))) };
}
const valid = 'Smith,-0.31,0.21\nLee,0.05,0.30';

for (const row of [
  'Jones\t\t-0.12\t0.15',
  'Jones\t-0.12\t\t0.15',
  'Jones\t-0.12\t0.15\t',
  '\tJones\t-0.12\t0.15',
  'Jones,\t-0.12,0.15',
]) {
  test('empty surplus fields cannot bypass validation: ' + JSON.stringify(row), () => {
    const result = harness().parse(valid + '\n' + row);
    assert.deepEqual(result.studies, []);
    assert.match(result.warnings.join(' '), /Line 3.*exactly.*3.*fields/);
  });
}

test('control: whitespace around three fields and CRLF retain their values', () => {
  for (const delimiter of [',', '\t']) {
    const result = harness().parse(' # comment\r\n study' + delimiter + 'estimate' + delimiter + 'se\r\n'
      + [' Jones ', ' -1.2e-1 ', ' .15 '].join(delimiter) + '\r\n');
    assert.deepEqual(result.warnings, []);
    assert.equal(result.studies.length, 1);
    assert.equal(result.studies[0].label, 'Jones');
    assert.equal(result.studies[0].est, -0.12);
    assert.equal(result.studies[0].se, 0.15);
  }
});

for (const label of ['Study, A', 'Study "A", team', 'Ordinary study']) {
  for (const source of ['CSV', 'shared bus']) {
    test(source + ' preserves label and all numerical fields: ' + label, () => {
      const h = harness();
      if (source === 'CSV') {
        h.ctx.window.__almLoad([{ study: label, yi: -0.5, vi: 0.010000000000001 }, { study: 'B', yi: 0.1, vi: 0.16 }]);
      } else {
        h.ctx.MaStudies = h.ctx.window.MaStudies = { read: () => [
          { label, est: -0.5, se: Math.sqrt(0.010000000000001) }, { label: 'B', est: 0.1, se: 0.4 },
        ] };
        h.ctx.onBusLoad();
      }
      const result = h.parse(h.input.value);
      assert.deepEqual(result.warnings, []);
      assert.equal(result.studies.length, 2);
      assert.equal(result.studies[0].label, label);
      assert.equal(result.studies[0].est, -0.5);
      assert.equal(result.studies[0].se, Math.sqrt(0.010000000000001));
      assert.equal(result.studies[1].est, 0.1);
      assert.equal(result.studies[1].se, 0.4);
    });
  }
}

test('control: quoting a label does not hide extra numeric fields or a decimal comma', () => {
  for (const row of ['"Study, A",-0.12,0,15', '"Study, A",extra,-0.12,0.15']) {
    const result = harness().parse(valid + '\n' + row);
    assert.deepEqual(result.studies, []);
    assert.match(result.warnings.join(' '), /exactly.*3.*fields/);
  }
});
