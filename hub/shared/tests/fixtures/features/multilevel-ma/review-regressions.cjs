// Run directly with node (no child process/browser needed). This exercises the
// real adapter and entry core; the small DOM is not a browser/accessibility claim.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../../../../../..');
const CI = 'study\tes_id\tlower\tupper\nA\ta\t0.10\t0.50\nA\tb\t0.05\t0.45\nB\ta\t0.20\t0.60';
const SE = 'Study ID;Outcome;Effect size;Standard error\nA;a;0.3;0.1\nA;b;0.2;0.1\nB;a;0.4;0.2';
const VI = 'study\tes_id\tyi\tvi\nA\ta\t0.3\t0.01\nA\tb\t0.2\t0.01\nB\ta\t0.4\t0.04';
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.handlers = {}; this.attrs = {}; this._text = ''; this.value = ''; }
  set textContent(s) { this._text = String(s); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  appendChild(e) { this.children.push(e); return e; }
  replaceChildren() { this.children = []; this._text = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(k, f) { (this.handlers[k] ||= []).push(f); }
  dispatchEvent(e) { for (const f of this.handlers[e.type] || []) f({ target: this }); }
  click() { if (!this.disabled) this.dispatchEvent({ type: 'click' }); }
}
const all = el => [el, ...el.children.flatMap(all)];
function setup() {
  const src = new Element('textarea'), run = new Element('button'), panel = new Element('div');
  src.value = 'original input';
  const mods = {}, axes = { min: new Element('input'), max: new Element('input'), log: new Element('input') };
  axes.log.checked = false;
  const ctx = vm.createContext({ console, setTimeout, Event: class { constructor(type) { this.type = type; } },
    document: { getElementById(id) { return { src, 'btn-run': run }[id] || all(panel).find(e => e.id === id) || null; },
      createElement(tag) { return new Element(tag); },
      querySelectorAll() { return []; }, querySelector(s) { return axes[/data-edge="(.*?)"/.exec(s)?.[1]]; } },
    AlmFeaturesState: { provenance: [], entryLog: [] },
    AlmFeatures: { register() {}, registerModule(k, m) { mods[k] = m; }, verifiedCurrent() { return false; } },
    _almLastMlma() { return { J: 1, k: 3, I2_study: 0, I2_within: 0, I2_sampling: 1 }; },
    __almReml() { return { mu: .3 }; },
    __almMlmaParse(s) { return s.trim().split('\n').map(l => ({ study: l.split(',')[0] })); }
  });
  for (const file of ['shared/alm-entry.js', 'multilevel-ma/alm-features.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx);
  mods.entry.render(panel);
  const button = name => all(panel).find(e => e.tagName === 'button' && e.textContent === name);
  const field = (card, name) => all(card).find(e => e.tagName === 'label' && e.textContent.startsWith(name))?.children.find(e => e.tagName === 'input');
  function preview(text) { const p = all(panel).find(e => e.tagName === 'textarea'); p.value = text; p.dispatchEvent({ type: 'input' }); button('Preview and convert').click(); }
  function confirm() {
    for (const card of all(panel).filter(e => e.tagName === 'fieldset')) {
      for (const [name, value] of [['Source author', 'Smith 2020'], ['Full reference', 'Smith report'], ['Source location', 'Table 2'], ['Timepoint', 'Six months']]) {
        const f = field(card, name); f.value = value; f.dispatchEvent({ type: 'input' });
      }
      const check = field(card, 'I confirm'); check.checked = true; check.dispatchEvent({ type: 'change' });
    }
  }
  return { ctx, entry: ctx.AlmMultilevelFeatures.entry, panel, src, axes, button, preview, confirm };
}
test('P1 conversion field and output', () => {
  const h = setup(), s = h.entry.sourceRecords(CI, h.entry.convert(CI))[0];
  assert.equal(s.conversions[0].field, 'yi'); assert.equal(s.conversions[0].output, .3);
  assert.equal(s.conversions[1].field, 'sei'); assert.ok(h.ctx.AlmEntry.replay(s.conversions).ok);
});
for (const [kind, text] of [['CI', CI], ['variance', VI]]) test('P1 PLANTED replay gate ' + kind, () => {
  const h = setup(); h.preview(text); h.confirm(); assert.equal(h.button('Use these rows').disabled, false);
  const original = h.ctx.AlmEntry.provenance.create;
  h.ctx.AlmEntry.provenance.create = function (...args) {
    const source = original(...args); let conversions = [];
    Object.defineProperty(source, 'conversions', { enumerable: true, get() { return conversions; }, set(v) { conversions = v; if (v.length) v[0].output += .1; } });
    return source;
  };
  h.preview(text); h.confirm(); assert.equal(h.button('Use these rows').disabled, true);
  assert.equal(h.button('Export source records CSV').disabled, true);
  assert.equal(h.button('Export source records DOCX').disabled, true);
});
for (const kind of ['programmatic replacement', 'share replacement']) test('P1 provenance binding ' + kind, () => {
  const h = setup(); h.preview(SE); h.confirm(); h.button('Use these rows').click();
  assert.equal(h.ctx.AlmMultilevelFeatures.text.results().entryRows, 3);
  if (kind === 'share replacement') h.ctx.AlmMultilevelFeatures.share.set({ src: 'C, .7, .1\nC, .8, .1\nD, .9, .2', axis: { min: '', max: '', log: false } });
  else h.src.value = 'unrelated programmatic input';
  assert.equal(h.ctx.AlmMultilevelFeatures.text.results().entryRows, 0);
  assert.equal(h.ctx.AlmFeaturesState.entryLog.length, 0);
});
test('P2 absent DOM value remains an audit target', () => {
  const h = setup(); const dom = h.ctx.AlmMultilevelFeatures.text.dom();
  assert.ok(Object.hasOwn(dom, 'remlMu')); assert.equal(dom.remlMu.text, '');
});
test('P2 single-cluster df', () => { assert.equal(setup().ctx.AlmMultilevelFeatures.text.results().df, 1); });
test('P2 decimal comma UI, anchors and preview invalidation', () => {
  const h = setup(), select = all(h.panel).find(e => e.tagName === 'select');
  assert.ok(select); select.value = 'comma'; select.dispatchEvent({ type: 'change' });
  h.preview(SE.replaceAll('0.', '0,')); h.confirm(); assert.equal(h.button('Use these rows').disabled, false);
  h.button('Use these rows').click();
  for (const s of h.ctx.AlmFeaturesState.provenance) { assert.equal(s.decimal, 'comma'); assert.equal(h.ctx.AlmEntry.provenance.validate(s).length, 0); }
  select.value = 'point'; select.dispatchEvent({ type: 'change' }); assert.equal(h.button('Use these rows').disabled, true);
});
test('P2 source sentence and formatted preview', () => {
  const h = setup(); h.preview(CI); h.confirm();
  assert.match(h.panel.textContent, /From Smith 2020 \(Table 2\)/);
  assert.match(h.panel.textContent, /Effect = 0.300; variance = 0.0104; page SE = 0.102/);
});
test('P2 usedAs supplied SE', () => {
  const h = setup(), s = h.entry.sourceRecords(SE, h.entry.convert(SE))[0];
  assert.match(s.usedAs, /supplied SE/); assert.doesNotMatch(s.usedAs, /sqrt/);
});
test('P2 canonical source fields', () => {
  const h = setup(), s = h.entry.sourceRecords(SE, h.entry.convert(SE))[0];
  assert.equal(s.values.map(v => v.field).join(','), 'yi,sei');
});
test('P2 remaining requirements explain disabled button', () => {
  const h = setup(); h.preview(CI);
  assert.equal(h.button('Use these rows').attrs['aria-describedby'], 'ml-entry-status');
  assert.match(h.panel.textContent, /0 of 3 rows confirmed/);
  for (const key of ['label', 'reference', 'location', 'timepoint']) assert.ok(h.panel.textContent.includes(key));
  h.confirm(); assert.match(h.panel.textContent, /3 of 3 rows confirmed/);
});
test('P2 marks expose field names', () => {
  const h = setup(); h.preview(SE); const mark = all(h.panel).find(e => e.tagName === 'mark');
  assert.equal(mark.attrs.tabindex, '0'); assert.equal(mark.attrs['aria-label'], 'yi: 0.3');
  // The implicit mark role prohibits aria-label; a source annotation is a note.
  assert.equal(mark.attrs.role, 'note');
});
test('P2 duplicate effect ID diagnostic', () => {
  const h = setup(), out = h.entry.convert('study\tes_id\toutcome\tyi\tvi\nA\ta\tx\t.3\t.01\nA\tb\ty\t.2\t.01\nB\ta\tz\t.4\t.04');
  assert.ok(out.flags.some(f => f.blocking && /one effect ID/.test(f.text)));
  assert.ok(!out.flags.some(f => /uncertainty column/.test(f.text)));
});
test('P2 supported schema', () => { assert.equal(setup().entry.schema, 'generic'); });
test('P1 share replacement cannot reattach the old conversion log', () => {
  const h = setup(); h.preview(CI); h.confirm(); h.button('Use these rows').click();
  const state = h.ctx.AlmMultilevelFeatures.share.get();
  h.ctx.AlmMultilevelFeatures.share.set({ ...state, src: state.src.replace('0.3', '0.8') });
  assert.equal(h.ctx.AlmMultilevelFeatures.text.results().entryCI, 0);
  assert.equal(h.ctx.AlmFeaturesState.entryLog.length, 0);
});
test('P1 valid share restores bound records and conversion counts', () => {
  const h = setup(); h.preview(CI); h.confirm(); h.button('Use these rows').click();
  const state = h.ctx.AlmMultilevelFeatures.share.get(), sources = JSON.parse(JSON.stringify(h.ctx.AlmFeaturesState.provenance));
  h.ctx.AlmMultilevelFeatures.share.set(state);
  // Shared restore assigns these after calling the app's setter.
  h.ctx.AlmFeaturesState.provenance = sources;
  const result = h.ctx.AlmMultilevelFeatures.text.results();
  assert.equal(result.entryRows, 3); assert.equal(result.entryCI, 3);
});
test('P2 comma variances preserve original values and local replay', () => {
  const h = setup(), text = VI.replaceAll('0.', '0,');
  const out = h.entry.convert(text, { decimal: 'comma' });
  assert.ok(!out.flags.some(f => f.blocking));
  const sources = h.entry.sourceRecords(text, out);
  for (const s of sources) {
    Object.assign(s, { label: 'Smith 2020', reference: 'Report', location: 'Table 2', confirmed: true });
    s.choice.timepoint = 'Six months';
    assert.equal(h.entry.validateSource(s).length, 0);
    s.conversions[0].args.vi += .1;
    assert.ok(h.entry.validateSource(s).includes('conversion replay'));
  }
});
