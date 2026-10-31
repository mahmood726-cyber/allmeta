import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const glossary = JSON.parse(read('hub/shared/glossary.json'));
const window = {};
vm.runInNewContext(read('hub/shared/tooltips.js'), { window });

// Execute the shipped registration and matcher: a known glossary key can still
// be the wrong concept for the result or method label shown by an application.
function resolve(app, text, source = read(`${app}/alm-glossary.js`)) {
  let terms;
  vm.runInNewContext(source, {
    window: { alm: { tooltips: options => { terms = options.terms; } } }
  });
  return Array.from(text.matchAll(window.alm.tooltips.buildMatcher(terms)), match => {
    const key = terms[match[0]];
    return { key, ...glossary[key] };
  });
}

function diagnosticLabels() {
  const nodes = new Map();
  const context = {
    document: { getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { addEventListener() {} });
      return nodes.get(id);
    } }
  };
  vm.runInNewContext(read('dta-sroc/plus-ui.js'), context);
  // Explicit rendering fixture, not an estimated or reference clinical result.
  const html = context.AlmDTAPlusUI.html({ studies: 0, coefficients: [], prediction: {
    sens: 0.8, spec: 0.9, positive: 0.5, negative: 0.1,
    regions: { confidence: [], prediction: [] }
  } });
  return Object.fromEntries(Array.from(
    html.matchAll(/<dt>([^<]+)<\/dt><dd data-value="prediction\.([^"]+)">/g),
    match => [match[2], match[1]]
  ));
}

const correlation = {};
vm.runInNewContext(read('correlation-ma/plus-core.js'), correlation);
const waldLabel = correlation.AlmCorrPlus.TEST_NAMES.z;

test('DTA diagnostic sensitivity result explains TP/(TP+FN), not sensitivity analysis', () => {
  const labels = diagnosticLabels();
  assert.equal(labels.sens, 'Sensitivity');
  const entries = resolve('dta-sroc', labels.sens);
  assert.deepEqual(entries.map(entry => entry.key), ['Se']);
  assert.match(entries[0].long, /TP\/\(TP\+FN\)/);
});

test('DTA controls retain specificity, lowercase sensitivity and sensitivity-analysis help in other apps', () => {
  assert.deepEqual(resolve('dta-sroc', diagnosticLabels().spec).map(entry => entry.key), ['Sp']);
  assert.deepEqual(resolve('dta-sroc', 'sensitivity Se').map(entry => entry.key), ['Se', 'Se']);
  assert.deepEqual(resolve('correlation-ma', 'Sensitivity analysis').map(entry => entry.key), ['Sensitivity']);
});

test('correlation CI method Wald z explains the normal test, not the Fisher transformation', () => {
  assert.equal(waldLabel, 'Wald z');
  const entries = resolve('correlation-ma', waldLabel);
  assert.deepEqual(entries.map(entry => entry.key), ['ZTest']);
  assert.equal(entries[0].short, 'Normal z statistic');
});

test('correlation controls retain Fisher-z effect-scale help and other CI methods', () => {
  assert.deepEqual(resolve('correlation-ma', 'Fisher z; z-scale; r').map(entry => entry.key),
    ['FisherZ', 'FisherZ', 'Correlation']);
  assert.deepEqual(resolve('correlation-ma', correlation.AlmCorrPlus.TEST_NAMES.knha).map(entry => entry.key), ['HKSJ']);
  assert.deepEqual(resolve('correlation-ma', 'z-test').map(entry => entry.key), ['ZTest']);
});

test('planted DTA alias regression is detected while the shipped registration passes', () => {
  const source = read('dta-sroc/alm-glossary.js');
  const marker = '"Sensitivity": "Se"';
  assert.equal(source.split(marker).length, 2);
  const gate = code => assert.deepEqual(
    resolve('dta-sroc', diagnosticLabels().sens, code).map(entry => entry.key), ['Se']);
  gate(source);
  assert.throws(() => gate(source.replace(marker, '"Sensitivity": "Sensitivity"')), { name: 'AssertionError' });
});

test('planted correlation alias regression is detected while the shipped registration passes', () => {
  const source = read('correlation-ma/alm-glossary.js');
  const marker = '"Wald z": "ZTest",';
  assert.equal(source.split(marker).length, 2);
  const gate = code => assert.deepEqual(
    resolve('correlation-ma', waldLabel, code).map(entry => entry.key), ['ZTest']);
  gate(source);
  assert.throws(() => gate(source.replace(marker, '')), { name: 'AssertionError' });
});
