// Run directly with node, or import the same checks from the Playwright spec.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapter = new URL('../../../../../../influence/alm-features.js', import.meta.url);
function setup() {
  const source = { value: '0.1, 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C', dispatchEvent() {} };
  const baseline = source.value, snapshots = [], modules = {}, notes = [];
  const axes = { min: { value: '', dispatchEvent() {} }, max: { value: '', dispatchEvent() {} }, log: { checked: false, dispatchEvent() {} } };
  let studies, runs = 0, testMode = false;
  // Read the engine's actual parser: this test must detect future parser divergence.
  const html = fs.readFileSync(new URL('../../../../../../influence/index.html', import.meta.url), 'utf8');
  const parserSource = html.slice(html.indexOf('function parse(text) {'), html.indexOf('// Cycle 7.13:'));
  const parse = vm.runInNewContext('(' + parserSource.trim() + ')');
  const run = { click() { studies = parse(source.value); runs++; } };
  const context = {
    document: {
      getElementById: id => id === 'src' ? source : run,
      querySelector: selector => axes[/data-edge="(\w+)"/.exec(selector)?.[1]],
      documentElement: { hasAttribute: name => name === 'data-alm-test' && testMode },
      createElement: () => ({ textContent: '', className: '' })
    },
    Event: class {},
    alm: { resetUndo: { snapshot() { snapshots.push(source.value); } } },
    _almStudies: () => studies,
    _almLastInfluence: () => ({ mu: .2, seMu: .05, tau2: .01, Q: 2, df: studies.length - 1 }),
    _almLastDiag: () => studies.map(s => ({ te: s.te, influential: false })),
    AlmFeatures: { register() {}, registerModule: (key, value) => { modules[key] = value; } },
    AlmTextUI: { mount: () => ({ root: { appendChild: n => notes.push(n.textContent) }, regenerate() {} }) }
  };
  run.click(); vm.runInNewContext(fs.readFileSync(adapter, 'utf8'), context);
  return { context, spec: context.AlmInfluenceFeatures, source, baseline, snapshots, modules, notes,
    run, runs: () => runs, enableTestMode: () => { testMode = true; } };
}
const records = [{ study: 'Smith 2019', yi: .25, sei: .08 }, { study: 'Jones 2020', yi: .18, sei: .1 }, { study: 'Lee 2021', yi: .3, sei: .09 }];

export const regressions = [
  ['REVIEW undo snapshots the previous input only after batch validation', () => {
    const h = setup();
    assert.throws(() => h.spec.entry.apply(records.map((r, i) => i === 1 ? { ...r, sei: 0 } : r)));
    assert.equal(h.snapshots.length, 0); assert.equal(h.source.value, h.baseline);
    h.spec.entry.apply(records);
    assert.deepEqual(h.snapshots, [h.baseline]); assert.equal(h.runs(), 2);
  }],
  ['REVIEW extra label fields retain report text for the analysis the engine ran', () => {
    const h = setup(); h.source.value = '0.25, 0.08, Smith, 2019\n0.18, 0.1, Jones\n0.3, 0.09, Lee'; h.run.click();
    assert.equal(h.context._almStudies()[0].label, 'Smith');
    assert.ok(h.spec.text.results(), 'An analysed comma-containing label must not hide the report');
    h.source.value = h.source.value.replace('0.25', '0.35');
    assert.equal(h.spec.text.results(), null); // Pending numeric edits still fail closed.
  }],
  ['REVIEW share validation and report guard use the engine parseFloat semantics', () => {
    const h = setup();
    for (const literal of ['0x10', '0.25suffix', '2e-1']) {
      h.spec.share.set({ src: literal + ', 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C', axis: { min: '', max: '', log: false } });
      assert.equal(h.context._almStudies()[0].te, parseFloat(literal));
      assert.ok(h.spec.text.results(), literal + ' must agree with the actual engine parser');
    }
    const before = h.source.value, runs = h.runs();
    for (const literal of ['NaN', 'Infinity', '']) {
      assert.throws(() => h.spec.share.set({ src: literal + ', 0.1, A\n0.2, 0.1, B\n0.3, 0.1, C', axis: { min: '', max: '', log: false } }));
      assert.equal(h.source.value, before); assert.equal(h.runs(), runs);
    }
  }],
  ['REVIEW perturbations require explicit test mode', () => {
    const h = setup(), original = h.spec.text.results();
    for (const key of ['mu', 'tau2', 'Q', 'df', 'k', 'flagged', 'ciLevel']) {
      h.context.__almTextPerturb = { key, delta: 1 };
      assert.equal(h.spec.text.results()[key], original[key], key + ' was changed outside test mode');
    }
    h.enableTestMode(); h.context.__almTextPerturb = { key: 'mu', delta: .1 };
    assert.equal(h.spec.text.results().mu, original.mu + .1);
  }],
  ['REVIEW text panel explains which values can be checked against the page', () => {
    const h = setup(); h.modules.text.render({}, { app: 'influence', block: h.spec.text });
    assert.match(h.notes.join(' '), /Only values displayed in the diagnostics table are cross-checked against the page/);
  }],
  ['REVIEW bad labels identify the offending study and row without changing data', () => {
    const h = setup();
    for (const study of ['Smith, 2019', '', 'Smith\n2019']) {
      assert.throws(() => h.spec.entry.apply(records.map((r, i) => i === 1 ? { ...r, study } : r)), error =>
        error.message.includes('Row 2') && error.message.includes(JSON.stringify(study)));
      assert.equal(h.source.value, h.baseline); assert.equal(h.snapshots.length, 0); assert.equal(h.runs(), 1);
    }
  }]
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failures = 0;
  for (const [name, check] of regressions) {
    try { check(); console.log('PASS ' + name); }
    catch (error) { failures++; console.error('FAIL ' + name + '\n' + error.message); }
  }
  console.log(`REVIEW ${regressions.length - failures}/${regressions.length}`);
  process.exitCode = failures ? 1 : 0;
}
