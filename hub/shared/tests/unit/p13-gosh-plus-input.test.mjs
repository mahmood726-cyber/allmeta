import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const load = require('../../../../gosh/tests/input-harness.cjs');
const page = fileURLToPath(new URL('../../../../gosh/index.html', import.meta.url));
const plus = readFileSync(new URL('../../../../gosh/plus.js', import.meta.url), 'utf8');
const invalidRows = require('../../../../gosh/tests/fixtures/input-validation.json');
const data = ['0.1, 0.2, Zeta', '-0.4, 0.3, Alpha', '0.8, 0.4, Beta'];
const plain = data.join('\n');
const copy = value => JSON.parse(JSON.stringify(value));

// Execute both production scripts. Only DOM/shared-UI plumbing is stubbed;
// parsing, validation, subset membership and extras arithmetic are unchanged.
function harness() {
  const h = load(page);
  for (const id of ['src', 'model', 'n-sample']) {
    let value = h.nodes[id].value;
    Object.defineProperty(h.nodes[id], 'value', {
      get: () => value,
      set: next => { value = String(next); }
    });
  }
  const node = () => ({
    value: '', textContent: '', innerHTML: '', style: {},
    replaceChildren() { this.innerHTML = ''; }
  });
  h.nodes['alm-plus'].isConnected = true;
  for (const id of ['plus-refresh', 'plus-status', 'plus-study', 'plus-het', 'plus-counts', 'plus-plot']) {
    h.nodes[id] = node();
  }
  h.nodes['plus-table'] = { tBodies: [node()], tHead: { rows: [node()] } };
  h.window.alm.urlState.withoutWrites = fn => fn();
  h.axisError = '';
  vm.runInNewContext(plus, {
    ...h.window,
    window: h.window,
    document: {
      getElementById: id => h.nodes[id],
      querySelector: selector => {
        assert.equal(selector, '#alm-axis-mount [data-error]');
        return h.axisError ? { textContent: h.axisError } : null;
      }
    }
  }, { filename: 'gosh/plus.js' });
  h.capture = (...args) => copy(h.window.AlmGoshPlus.capture(...args));
  h.snapshot = () => copy(h.window.__almGoshValidationSnapshot());
  return h;
}

function assertThreeStudies(extras, model, labels) {
  assert.equal(extras.k, 3);
  assert.equal(extras.model, model);
  assert.equal(extras.sampled, false);
  assert.deepEqual(extras.labels, labels);
  assert.deepEqual(extras.points.map(p => p.members), [[1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]]);
  assert.deepEqual(extras.rows.map(r => [r.study, r.with_n, r.without_n]), [[1, 4, 3], [2, 4, 3], [3, 4, 3]]);
  for (const row of extras.rows) assert.ok(Object.values(row).every(Number.isFinite));
}

for (const model of ['FE', 'DL']) {
  test(`P13-R4 ${model}: header-free extras control has all seven subsets and 4/3 inclusion counts`, () => {
    const h = harness();
    h.nodes.model.value = model;
    assert.equal(h.run(plain).k, 3);
    const before = h.snapshot();
    const extras = h.capture();
    assertThreeStudies(extras, model, ['Zeta', 'Alpha', 'Beta']);
    assert.deepEqual(h.snapshot(), before);
  });

  for (const [name, text] of [
    ['header alone', 'effect, SE, label\n' + plain],
    ['interior blank alone', [data[0], '', data[1], data[2]].join('\n')],
    ['header and whitespace with CRLF', [' ', 'yi, SE, label', data[0], ' \t', data[1], data[2], ''].join('\r\n')]
  ]) {
    test(`P13-R4 ${model}: extras accept ${name} exactly like the main analysis`, () => {
      const h = harness();
      const control = h.capture(plain, model);
      h.nodes.model.value = model;
      const main = h.run(text);
      assert.equal(main.k, 3, 'main analysis accepts this formatting');
      const before = h.snapshot();
      const extras = h.capture();
      assertThreeStudies(extras, model, copy(main.studies.map(s => s.label)));
      assert.deepEqual(extras, control, 'formatting changes no numeric result or membership');
      assert.deepEqual(h.snapshot(), before, 'capture restores the main analysis');
      assert.deepEqual(h.capture(text, model), control, 'explicit input uses the same parser');
    });
  }

  test(`P13-R4 ${model}: extras preserve canonical default labels and row order`, () => {
    const h = harness();
    const text = '\nte, SE, label\n0.1, 0.2\n\n-0.4, 0.3, Alpha\n0.8, 0.4\n';
    h.nodes.model.value = model;
    const main = h.run(text);
    assert.equal(main.k, 3);
    const labels = main.studies.map(s => s.label);
    assert.deepEqual(copy(labels), ['S2', 'Alpha', 'S5']);
    const control = h.capture(main.studies.map(s => `${s.te}, ${s.se}, ${s.label}`).join('\n'), model);
    const extras = h.capture(text, model);
    assertThreeStudies(extras, model, copy(labels));
    assert.deepEqual(extras, control);
  });

  test(`P13-R4 ${model}: the 100-study limit counts parsed rows instead of physical lines`, () => {
    const h = harness();
    const input = Array.from({ length: 100 }, (_,i) => `${i / 100}, 0.2, Study ${i + 1}`).join('\n');
    const control = h.capture(input, model, 512);
    assert.equal(control.k, 100);
    assert.equal(control.sampled, true);
    assert.equal(control.points.length, 512);
    const text = 'effect, SE, label\n\n' + input + '\n';
    h.nodes.model.value = model;
    h.nodes['n-sample'].value = 512;
    assert.equal(h.run(text).k, 100);
    assert.deepEqual(h.capture(text, model, 512), control);
  });
}

test('P13-R4 control: invalid study rows remain refused, including after accepted formatting', () => {
  const h = harness();
  const cases = [...invalidRows, { name: 'hexadecimal effect', line: '0x10, 0.2, Bad' }];
  for (const c of cases) {
    for (const prefix of ['', 'effect, SE, label\n\n']) {
      const text = prefix + plain + '\n' + c.line;
      assert.equal(h.run(text), null, c.name);
      assert.match(h.nodes['input-error'].textContent, /Line /, c.name);
      h.run(plain);
      const before = h.snapshot();
      assert.throws(() => h.capture(text, 'FE'), /Need 3 through 100 valid/, c.name);
      assert.deepEqual(h.snapshot(), before, 'refused capture restores the main analysis: ' + c.name);
      assertThreeStudies(h.capture(), 'FE', ['Zeta', 'Alpha', 'Beta']);
    }
  }
});

test('P13-R4 control: empty, fewer than three and more than 100 studies remain refused', () => {
  const h = harness();
  for (const input of ['', data[0], data.slice(0, 2).join('\n'), Array(101).fill(data[0]).join('\n')]) {
    for (const prefix of ['', 'effect, SE, label\n\n']) {
      assert.equal(h.run(prefix + input), null);
      assert.throws(() => h.capture(prefix + input), /Need 3 through 100 valid/);
    }
  }
});

test('P13-R4 control: invalid axis limits still refuse extras before capture', () => {
  const h = harness();
  h.run(plain);
  const before = h.snapshot();
  h.axisError = 'Invalid axis limits';
  assert.throws(() => h.capture(), /Correct invalid axis limits before validating/);
  assert.deepEqual(h.snapshot(), before);
});
