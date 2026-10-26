import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../../../../mh-peto/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*(\(function \(\) \{[\s\S]*?)<\/script>/)[1];
const appScript = script.slice(0, script.indexOf('    // ---- module init ----')) + '\n})();';
const adapterScript = readFileSync(new URL('../../../../mh-peto/validate/adapter.js', import.meta.url), 'utf8');
const clean = 'A,1,100,10,100\nB,10,100,1,100';
const warned = clean + '\nZero,0,100,0,100';

function setup(input, measure) {
  const nodes = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    innerHTML: '', innerText: '', textContent: '', hidden: true, value: '', checked: false,
    addEventListener() {},
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] ?? null; },
    removeAttribute(k) { delete this[k]; },
    setSelectionRange() {},
  }]));
  const window = { alm: { analysisLifecycle: fn => fn, urlState: { write() {} } }, scrollTo() {} };
  const document = { getElementById: id => nodes[id], querySelector: () => null, querySelectorAll: () => [] };
  const interruption = new Error('Stop replay after its first rendered configuration');
  const context = {
    window, document, alm: window.alm, scrollX: 0, scrollY: 0,
    AlmFragility: { fragility() {} },
    // Stop at the first numerical check: exercise the actual replay's finally
    // restoration without pretending this synthetic fixture is an R oracle.
    AlmValidate: { mount() {}, compare() { throw interruption; } },
  };
  runInNewContext(appScript, context);
  nodes.src.value = input;
  nodes.measure.value = measure;
  window.__mhValidation.run();
  runInNewContext(adapterScript, context);
  return { window, nodes, interruption };
}

function replayInput(text) {
  const rows = text.split('\n').map((line, i) => {
    const [, a, n1, c, n2] = line.split(',').map(Number);
    return { source_row: i + 1, ai: a, bi: n1 - a, ci: c, di: n2 - c };
  });
  const fields = { est: 0, lo: 0, hi: 0, zval: 0, pval: 0, beta: 0, se: 0 };
  return {
    'validate/corpus/corpus.json': [{ id: 'synthetic', rows }],
    'validate/corpus/reference.json': ['OR', 'RR', 'RD', 'PETO'].map(m => ({
      id: 'synthetic|' + m, k_input: rows.length, ...fields, studies: rows.map(() => ({ ...fields })),
    })),
    'validate/corpus/fragility-reference.json': ['OR', 'RR', 'RD'].map(m => ({
      id: 'synthetic|' + m, FI: 0, FQ: 0, beta: 0, lo: 0, hi: 0,
    })),
  };
}

for (const [name, input, measure, replay] of [
  ['restore OR warning', warned, 'OR', clean],
  ['restore RR warning', warned, 'RR', clean],
  ['clear replay warning for clean OR', clean, 'OR', warned],
  ['clear replay warning for RD', warned, 'RD', warned],
  ['clear replay warning for empty input', '', 'OR', warned],
  ['control: clean OR remains clear', clean, 'OR', clean],
  ['control: warned OR remains warned', warned, 'OR', warned],
]) {
  test('validation replay: ' + name, async () => {
    const app = setup(input, measure);
    const originalResult = app.window._almLastMhPeto();
    const originalWarning = app.nodes['het-warning'].textContent;
    const originalHidden = app.nodes['het-warning'].hidden;
    const originalTable = app.nodes['het-body'].innerHTML;
    await assert.rejects(app.window.AlmMhPetoValidationAdapter.corpus.run(replayInput(replay), () => {}),
      error => error === app.interruption);
    assert.equal(app.nodes.src.value, input);
    assert.equal(app.nodes.measure.value, measure);
    assert.equal(app.window._almLastMhPeto(), originalResult);
    assert.equal(app.nodes['het-body'].innerHTML, originalTable);
    assert.equal(app.nodes['het-warning'].textContent, originalWarning);
    assert.equal(app.nodes['het-warning'].hidden, originalHidden);
  });
}
