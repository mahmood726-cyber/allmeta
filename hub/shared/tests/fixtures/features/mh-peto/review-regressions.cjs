// Runs in one Node process, including where browser/child-process creation is unavailable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../../../../..');
const AlmText = require(path.join(root, 'shared/alm-text.js'));
const AlmEntry = require(path.join(root, 'shared/alm-entry.js'));

function fixture() {
  const modules = {};
  function node(tag = 'div') {
    const handlers = {};
    return { tagName: tag.toUpperCase(), _text: '', children: [], value: '', checked: false,
      get textContent() { return this._text + this.children.map(c => c.textContent).join(''); },
      set textContent(value) { this._text = value; this.children = []; },
      get ownerDocument() { return context.document; },
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren(...children) { this.children = children; this.textContent = ''; },
      setAttribute() {}, addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
      async fire(type) { for (const fn of handlers[type] || []) await fn({ target: this }); },
      dispatchEvent() {}, click() {} };
  }
  const elements = Object.fromEntries(['src', 'measure', 'btn-run', 'fragility-note', 'alm-axis-mount'].map(id => [id, node()]));
  elements.src.value = 'Original, 3, 500, 8, 500'; elements.measure.value = 'OR';
  const axes = { min: node(), max: node(), log: node() };
  const last = { k: 5, measure: 'OR', mh_est: .299, mh_lo: .147, mh_hi: .609,
    mh_z: -3.33, mh_p: .00087544, peto_est: .339, peto_lo: .186, peto_hi: .619,
    peto_z: -3.53, peto_p: .00042212, fragility_index: null };
  const context = { AlmText, AlmEntry, AlmFeaturesState: { entryLog: [] }, Event: class {},
    AlmFeatures: { register() {}, registerModule(key, mod) { modules[key] = mod; }, verifiedCurrent() { return false; } },
    AlmEntryUI: { mount() { return {}; } }, _almLastMhPeto: () => last,
    document: { getElementById: id => elements[id], createElement: node,
      querySelector: selector => axes[/data-edge="(.*?)"/.exec(selector)[1]],
      querySelectorAll: selector => selector === '#per-body tr' ? Array(last.k).fill({}) : [] }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'mh-peto/alm-features.js'), 'utf8'), context);
  const spec = context.AlmMhPetoFeatures;
  function render() {
    const r = spec.text.results(), ctx = { app: 'mh-peto', entryLog: [], verify: null };
    const out = AlmText.render(spec.text.templates, r, ctx);
    return { out, audit: AlmText.audit(out, r, { ctx, dom: spec.text.dom() }) };
  }
  return { context, spec, render, last, modules, node, elements };
}

async function confirmedWorkflow(plantDrift = false) {
  const f = fixture();
  let source = fs.readFileSync(path.join(root, 'shared/alm-entry-ui.js'), 'utf8');
  if (plantDrift) {
    assert.ok(source.includes('row.raw[v.field]=v.value'));
    source = source.replace('row.raw[v.field]=v.value', 'row.raw[v.field === "ai" ? "renamed_ai" : v.field]=v.value');
  }
  vm.runInNewContext(source, f.context);
  const panel = f.node();
  f.context.AlmEntryUI.mount(panel, f.spec.entry);
  const descendants = el => [el, ...el.children.flatMap(descendants)];
  const button = text => descendants(panel).find(e => e.tagName === 'BUTTON' && e.textContent === text);
  const field = (title, scope = panel) => descendants(scope).find(e => e.tagName === 'LABEL' && e.textContent.startsWith(title))
    ?.children.find(e => ['INPUT', 'SELECT'].includes(e.tagName));
  async function set(title, value, scope) {
    const el = field(title, scope); assert.ok(el, title); el.value = value;
    await el.fire(el.tagName === 'SELECT' ? 'change' : 'input');
  }
  for (const [i, text] of ['12 of 150 vs 20 of 148', '7 of 100 vs 11 of 102'].entries()) {
    descendants(panel).find(e => e.tagName === 'TEXTAREA').value = text;
    await button('Extract candidates').fire('click'); await set('Choose the source result', '0');
    await button('Add chosen result').fire('click');
    const card = descendants(panel).filter(e => e.tagName === 'FIELDSET')[i];
    for (const [title, value] of [['Study label', ['Smith 2019', 'Jones 2020'][i]], ['Full reference', 'Example trial report'],
      ['Location', 'Table 2'], ['Treatment arm', '0'], ['Control arm', '1'], ['Outcome measured', 'Events'], ['Timepoint', 'not stated']]) {
      await set(title, value, card);
    }
    assert.equal(button('Use these rows').disabled, true);
    const confirm = field('I confirm', card); assert.equal(confirm.disabled, false);
    confirm.checked = true; await confirm.fire('change');
  }
  assert.equal(button('Use these rows').disabled, false);
  await button('Use these rows').fire('click');
  assert.match(panel.textContent, /Applied 2 confirmed rows\./);
  assert.equal(f.elements.src.value, 'Smith 2019, 12, 150, 20, 148\nJones 2020, 7, 100, 11, 102');
  assert.ok(f.context.AlmFeaturesState.provenance.every(r => r.confirmed));
}

const cases = {
  'p values use threshold notation': () => {
    const { render } = fixture(), { out, audit } = render();
    assert.equal((out.results.text.match(/p < 0\.001/g) || []).length, 2);
    assert.doesNotMatch(out.results.text, /p = 0\.000/); assert.equal(audit.ok, true);
  },
  'study-count PLANTED defect fails independent DOM audit': () => {
    const f = fixture(); assert.equal(f.render().audit.ok, true);
    f.context.__almTextPerturb = { key: 'k', delta: 1 };
    const { audit } = f.render();
    assert.equal(audit.ok, false); assert.ok(audit.failures.some(x => x.check === 'dom:k'));
  },
  'common-effect limitation appears in plain text and notes at every k': () => {
    const f = fixture();
    for (const k of [2, 5, 12]) {
      f.last.k = k; const { out, audit } = f.render();
      for (const text of [out.plain.text, out.flags.map(x => x.text).join(' ')]) {
        assert.match(text, /single common effect across studies/);
        assert.match(text, /does not estimate between-study variation or a prediction interval/);
      }
      assert.equal(audit.ok, true);
    }
  },
  'share log rejects fabrication, inherited codes, nested bypass and size overflow atomically': () => {
    const { spec } = fixture(), before = JSON.stringify(spec.share.get());
    const claim = 'individual patient data for all 5 trials were obtained and re-analysed';
    const code = { study: 'Smith 2019', code: 'EVENTS_FROM_PERCENT' };
    for (const entryLog of [
      [{ study: 'Smith 2019', method: claim, citation: 'Cochrane Handbook v6.5' }],
      [{ row: 0, study: 'Smith 2019', text: claim, method: claim, citation: 'Cochrane Handbook v6.5', inputs: {}, flags: [] }],
      [{ ...code, conversions: [{ method: claim }] }], [{ ...code, code: 'toString', method: claim }],
      [{ ...code, study: 'x'.repeat(2049) }], Array(1001).fill(code), [null], ['made up']
    ]) {
      assert.throws(() => spec.share.set({ ...spec.share.get(), src: 'Changed', measure: 'RR', entryLog }));
      assert.equal(JSON.stringify(spec.share.get()), before);
    }
  },
  'conversion log renders separate list items': () => {
    const f = fixture(), panel = f.node();
    const lines = ['Smith 2019: events = pct/100·n', 'Jones 2020: events = pct/100·n'];
    f.context.AlmFeaturesState.entryLog = lines.map(text => ({ text }));
    const ui = f.modules.entry.render(panel, { block: f.spec.entry });
    const list = panel.children.find(x => x.tagName === 'UL'); assert.ok(list);
    assert.deepEqual(list.children.map(x => x.textContent), lines);
    assert.ok(list.children.every(x => x.tagName === 'LI'));
    f.context.AlmFeaturesState.entryLog = []; ui.onShow();
    assert.equal(list.children.length, 0);
  },
  'share log preserves known codes, real converter steps and existing transcription': () => {
    const f = fixture();
    const table = AlmEntry.parseTable('Study\tai\tn1i\tci\tn2i\nSmith 2019\t8%\t150\t20\t148');
    const converted = AlmEntry.convert(table, AlmEntry.detect(table, 'binary2x2'), 'binary2x2', {});
    assert.equal(converted.steps.length, 1);
    for (const entryLog of [[], [{ code: 'EVENTS_FROM_PERCENT', study: 'Smith 2019' }], converted.steps,
      [{ text: 'Counts transcribed without conversion', method: 'transcription' }]]) {
      f.spec.share.set({ ...f.spec.share.get(), entryLog });
      assert.equal(JSON.stringify(f.spec.share.get().entryLog), JSON.stringify(entryLog));
    }
    const step = converted.steps[0];
    for (const field of ['method', 'text', 'citation']) {
      assert.throws(() => f.spec.share.set({ ...f.spec.share.get(), entryLog: [{ ...step, [field]: 'fabricated claim' }] }));
    }
  },
  'confirmed provenance UI passes exact counts through the real adapter': async () => {
    await confirmedWorkflow(process.argv.includes('--plant-row-drift'));
    await assert.rejects(() => confirmedWorkflow(true), /Applied 2 confirmed rows/);
  }
};

async function run() {
  let failed = 0;
  for (const [name, check] of Object.entries(cases)) {
    try { await check(); console.log('PASS ' + name); }
    catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); }
  }
  console.log(`REVIEW_REGRESSIONS ${Object.keys(cases).length - failed}/${Object.keys(cases).length}`);
  return failed;
}
module.exports = { run, cases };
if (require.main === module) run().then(failed => { process.exitCode = failed ? 1 : 0; });
