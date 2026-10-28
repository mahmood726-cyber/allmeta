import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('dta-sroc/index.html');

// Execute the production constructors without the page's DOM/event setup.
// These tests inspect generated SVG markup, not a browser accessibility tree.
function excerpt(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Constructor boundaries: ${start}`);
  return html.slice(from, to);
}
const main = vm.createContext({ window: {}, matchMedia: () => ({ matches: false }) });
vm.runInContext(read('shared/dta-bivariate.js'), main);
vm.runInContext(excerpt('    function faganSvg(', '    const statsWrap ='), main);
vm.runInContext(excerpt('    function escapeXml(', '    function statCard('), main);

const nodes = new Map();
const extras = vm.createContext({
  document: {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { innerHTML: '', addEventListener() {} });
      return nodes.get(id);
    }
  }
});
vm.runInContext(read('dta-sroc/plus-ui.js'), extras);

function rootAttributes(svg) {
  const opening = svg.match(/<svg\b([^>]*)>/);
  assert.ok(opening, 'Constructor returns an SVG root');
  assert.match(svg, /<\/svg>\s*$/);
  return Object.fromEntries(Array.from(
    opening[1].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g),
    match => [match[1], match[3]]
  ));
}

const studies = [{ tp: 80, fp: 10, fn: 20, tn: 90, se: 0.8, fpr: 0.1 }];
const charts = [
  ['SROC without a plot title', () => main.buildSvg({ title: '' }, studies, null, null), /\bSROC\b|receiver operating characteristic/i],
  ['SROC with a plot title', () => main.buildSvg({ title: 'Diagnostic example' }, studies, null, null), /\bSROC\b|receiver operating characteristic/i],
  ['Fagan', () => main.faganSvg({ lrPos: 4, lrNeg: 0.25 }), /\bFagan\b/i],
  ['Deeks', () => main.deeksSvg({ x: [0.1, 0.2], y: [1, 2], intercept: 0.5, slope: 5, p: 0.25 }), /\bDeeks\b/i]
];

for (const [name, render, expectedName] of charts) {
  test(`P03-R2: ${name} SVG has a meaningful programmatic chart name`, () => {
    assert.match(rootAttributes(render())['aria-label'] || '', expectedName);
  });
  test(`P03-R2: ${name} SVG has image semantics`, () => {
    assert.equal(rootAttributes(render()).role, 'img');
  });
}

test('control: extras ROC SVG retains its programmatic name and image semantics', () => {
  const svg = extras.AlmDTAPlusUI.plot({
    sens: 0.8, spec: 0.9,
    regions: {
      confidence: [[0.7, 0.1], [0.8, 0.2], [0.9, 0.1]],
      prediction: [[0.6, 0.05], [0.8, 0.3], [0.95, 0.05]]
    }
  });
  const attrs = rootAttributes(svg);
  assert.equal(attrs['aria-label'], 'Conditional ROC regions');
  assert.equal(attrs.role, 'img');
});

test('control: main chart constructors still emit plot content and finite geometry', () => {
  for (const [, render] of charts) {
    const svg = render();
    assert.match(svg, /<(circle|line)\b/);
    assert.match(svg, /<text\b/);
    assert.doesNotMatch(svg, /NaN|Infinity/);
  }
});
