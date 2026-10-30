import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('heterogeneity/index.html', root), 'utf8');
const dataFieldset = html.match(/<fieldset>\s*<legend>Data<\/legend>([\s\S]*?)<\/fieldset>/)?.[1];
assert.ok(dataFieldset, 'The study data fieldset must exist');
const textOf = markup => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('P05-D4 regression: adjacent guidance states log-ratio inputs, log-effect SE and analysis-scale outputs', () => {
  const guidance = textOf(dataFieldset);
  assert.match(guidance, /natural[- ]log/i, 'The input guidance must explain the natural-log scale for ratio measures');
  for (const measure of ['RR', 'OR', 'HR']) {
    assert.ok(guidance.includes('log(' + measure + ')'), 'The input guidance must name log(' + measure + ')');
  }
  assert.match(guidance, /SE of (?:that|the) log effect/i, 'SE must refer to the log effect');
  assert.match(guidance, /pooled estimates and intervals remain on the analysis scale/i);
});

test('P05-D4 regression: scale guidance is associated with the study input and preserves warning descriptions', () => {
  const textarea = dataFieldset.match(/<textarea\b[^>]*id="f-data"[^>]*>/)?.[0];
  assert.ok(textarea, 'The study input must exist');
  const descriptionIds = textarea.match(/aria-describedby="([^"]+)"/)?.[1].split(/\s+/) || [];
  assert.ok(descriptionIds.includes('warn-banner'), 'Validation warnings must remain associated');
  const descriptions = [...dataFieldset.matchAll(/<(span|p)\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g)];
  const help = descriptions.find(([, , , id, content]) => descriptionIds.includes(id) && /log\(RR\)/.test(textOf(content)));
  assert.ok(help, 'The study input must reference adjacent ratio-scale guidance with aria-describedby');
  assert.doesNotMatch(help[2], /\bhidden\b|aria-hidden="true"|display\s*:\s*none/i);
  assert.match(textOf(help[4]), /SE of (?:that|the) log effect/i);
  assert.match(textOf(help[4]), /analysis scale/i);
});

// Run the actual main page script and numerical modules without a browser.
// Only DOM/storage and unrelated UI hooks are stubbed; parsing, pooling and
// rendering execute unchanged. Lifecycle scheduling is synchronous here.
function appHarness() {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const listeners = new Map();
      const classes = new Set();
      elements.set(id, {
        value: id === 'f-tau2' ? 'pm' : '', innerHTML: '', textContent: '',
        classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
        setAttribute(name, value) { this[name] = value; },
        addEventListener(type, fn) { listeners.set(type, fn); },
        dispatchEvent(event) { listeners.get(event.type)?.(event); }
      });
    }
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element },
    localStorage: { getItem() { return null; }, setItem() {} },
    alm: { analysisLifecycle: render => render, plotExport() {} }
  });
  context.window = context;
  for (const file of ['shared/ma-core.js', 'shared/heterogeneity-ci.js']) {
    vm.runInContext(readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
  }
  const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .find(([, source]) => source.includes('function parseStudies('));
  assert.ok(main, 'The production analysis script must exist');
  vm.runInContext(main[1], context, { filename: 'heterogeneity/index.html' });
  return {
    run(data) {
      element('f-data').value = data;
      element('f-data').dispatchEvent({ type: 'input' });
      return {
        info: context._almLastFE(),
        studies: JSON.parse(JSON.stringify(context._almLastStudies())),
        warnings: element('warn-banner').innerHTML,
        stats: element('stats-wrap').innerHTML,
        invalid: element('f-data')['aria-invalid']
      };
    }
  };
}

test('P05-D4 control: positive generic effects are pooled as supplied without scale inference or warnings', () => {
  const result = appHarness().run('A,2,1\nB,4,1\nC,6,1');
  assert.deepEqual(result.studies.map(s => s.est), [2, 4, 6]);
  assert.deepEqual(result.studies.map(s => s.se), [1, 1, 1]);
  assert.equal(result.info.sum.k, 3);
  // Equal SEs give the arithmetic mean on the supplied scale (no R reference).
  assert.equal(result.info.sum.mu, 4);
  assert.match(result.stats, /4\.000/);
  assert.equal(result.warnings, '');
  assert.equal(result.invalid, 'false');
});

test('P05-D4 control: signed analysis-scale effects are retained without back-transformation', () => {
  const result = appHarness().run('A,-1,1\nB,0,1\nC,1,1');
  assert.deepEqual(result.studies.map(s => s.est), [-1, 0, 1]);
  assert.equal(result.info.sum.mu, 0);
  assert.equal(result.warnings, '');
  assert.equal(result.invalid, 'false');
});

test('P05-D4 control: malformed SE blocks pooling and clears the previous result', () => {
  const app = appHarness();
  assert.ok(app.run('A,2,1\nB,4,1\nC,6,1').info);
  const result = app.run('A,2,1\nB,4,broken\nC,6,1');
  assert.equal(result.info, null);
  assert.deepEqual(result.studies, []);
  assert.equal(result.stats, '');
  assert.match(result.warnings, /Analysis blocked/);
  assert.equal(result.invalid, 'true');
});
