import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const controls = Object.fromEntries(['f-data', 'f-view', 'f-title'].map(id => [id, { value: 'original', dispatchEvent() {} }]));
  const axes = ['min', 'max'].map(() => ({ value: '', dispatchEvent() {} }));
  const context = {
    document: {
      getElementById: id => controls[id],
      querySelector: selector => axes[selector.includes('"min"') ? 0 : 1]
    },
    Event: class { constructor(type) { this.type = type; } },
    // share set() now runs the page's row checker (index.html parseStudies) first; this adapter-only fixture has no page,
    // so it supplies a checker that accepts the rows: these tests are about the axis and control fields only.
    __almCumSubParse: () => ({ studies: [], warnings: [] })
  };
  vm.runInNewContext(readFileSync(new URL('../../../../cumulative-subgroup/alm-features.js', import.meta.url), 'utf8'), context);
  return { share: context.AlmCumSubFeatures.share, controls, axes };
}

// Number() accepts these strings, but input[type=number] sanitizes them to empty.
// A share link must fail atomically instead of silently dropping a bound.
test('share rejects axis strings that HTML number inputs cannot preserve', () => {
  for (const value of ['0x10', '0b10', '0o10', ' 1', '1 ', '+1', '1.']) {
    const { share } = fixture();
    const before = JSON.stringify(share.get());
    assert.throws(() => share.set({ data: 'new data', view: 'subgroup', title: 'new title', axis: [value, '20'] }), /axis limits/, value);
    assert.equal(JSON.stringify(share.get()), before, value + ' must not mutate any controls');
  }
});

test('share preserves empty, decimal and exponent axis bounds, including refused ranges', () => {
  for (const bounds of [['', ''], ['-.5', '2.5'], ['-1e+2', '2E-1'], ['2', '1']]) {
    const { share } = fixture();
    const state = { data: 'A, 0.1, 0.2', view: 'cumulative', title: 'Control', axis: bounds };
    share.set(state);
    assert.equal(JSON.stringify(share.get()), JSON.stringify(state));
  }
});

// Run the production parser, pooling, render and feature adapter. The DOM facade
// reads the cards and text nodes emitted by render(), rather than inventing their values.
function reportFixture({ group = 'Low', title = 'Subgroup analysis' } = {}) {
  const read = path => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');
  const html = read('cumulative-subgroup/index.html');
  const nodes = Object.fromEntries(['f-data', 'f-view', 'f-title', 'warn-banner', 'svg-host', 'stats-wrap', 'preview-heading']
    .map(id => [id, { value: '', innerHTML: '', classList: { add() {}, remove() {} } }]));
  nodes['f-data'].value = `A, -0.2, 0.1, 2020, "${group}"\nB, -0.1, 0.1, 2021, "${group}"\nC, 0.2, 0.1, 2022, Z\nD, 0.3, 0.1, 2023, Z`;
  nodes['f-view'].value = 'subgroup';
  nodes['f-title'].value = title;
  const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const document = {
    getElementById: id => nodes[id],
    querySelectorAll(selector) {
      if (selector === '#stats-wrap .stat') {
        return Array.from(nodes['stats-wrap'].innerHTML.matchAll(/<span class="k">(.*?)<\/span><span class="v">(.*?)<\/span>/g),
          match => ({ querySelector: key => ({ textContent: decode(match[key === '.k' ? 1 : 2]) }) }));
      }
      if (selector.startsWith('#svg-host svg text')) {
        const attribute = selector.match(/\[([^=]+)="([^"]+)"\]/);
        return Array.from(nodes['svg-host'].innerHTML.matchAll(/<text\b([^>]*)>(.*?)<\/text>/g))
          .filter(match => !attribute || match[1].includes(`${attribute[1]}="${attribute[2]}"`))
          .map(match => ({ textContent: decode(match[2]) }));
      }
      throw new Error('Unexpected selector: ' + selector);
    }
  };
  const context = vm.createContext({ document, TextEncoder, Z975: 1.959963984540054,
    localStorage: { setItem() {} }, alm: { urlState: { write() {}, withoutWrites: fn => fn() } } });
  context.window = context;
  vm.runInContext(read('shared/ma-core.js'), context);
  vm.runInContext(html.slice(html.indexOf('    const LS_KEY ='), html.indexOf('    function rScript(')), context);
  vm.runInContext(html.slice(html.indexOf('    window._almLastCumSub ='), html.indexOf('    // Validation observes the autosave draft banner')), context);
  vm.runInContext(read('shared/alm-text.js'), context);
  vm.runInContext(read('cumulative-subgroup/alm-features.js'), context);
  context.render();
  const spec = context.AlmCumSubFeatures.text;
  const results = spec.results();
  const rendered = context.AlmText.render(spec.templates, results, {});
  return { nodes, spec, results, audit: () => context.AlmText.audit(rendered, results, { dom: spec.dom() }) };
}

for (const [name, options] of [
  ['numeric subgroup label', { group: '0.5 [0.1, 0.9]' }],
  ['numeric plot title', { title: '9.0 [8.0, 10.0]' }]
]) test('report audit does not read a ' + name + ' as an estimate', () => {
  const { audit, spec, results } = reportFixture(options);
  const checked = audit();
  assert.equal(checked.ok, true, JSON.stringify(checked.failures));
  assert.equal(spec.dom().group0mu.text, results.group0mu.toFixed(3));
  assert.equal(spec.dom().group1mu.text, results.group1mu.toFixed(3));
  assert.equal(Object.keys(spec.dom()).filter(key => /^group\d+mu$/.test(key)).length, 2);
});

test('report audit checks ordinary subgroup estimates and rejects a corrupted plotted estimate', () => {
  const { audit, nodes } = reportFixture();
  assert.equal(audit().ok, true);
  const before = nodes['svg-host'].innerHTML;
  nodes['svg-host'].innerHTML = before.replace('>-0.150 [', '>0.850 [');
  assert.notEqual(nodes['svg-host'].innerHTML, before, 'plant corruption in the actual rendered estimate');
  const checked = audit();
  assert.equal(checked.ok, false);
  assert.ok(checked.failures.some(failure => failure.check === 'dom:group0mu'));
});
