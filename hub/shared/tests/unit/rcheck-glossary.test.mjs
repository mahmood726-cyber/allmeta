import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const glossary = JSON.parse(readFileSync(new URL('../../glossary.json', import.meta.url), 'utf8'));
// Explicit audit inventory, independent of whether metadata happens to exist.
const required = 'HKSJ REML DL PM I2 i2 tau2 PI Q H2 Tau HKScale IV Weight Variance ZTest TTest SMD MD OR RR RD DOR Se Sp FPR ROC LogRR LogOR Proportion Logit FisherZ Rho Correlation Residual RSS R2 CovRatio Centering LRpos LRneg Fagan FragilityQuotient VarianceRatio CumulativeIncidence HR IRR ICER Component Additivity OLS Determination Quadratic LR'.split(' ');
function checked(g) {
  for (const key of required) {
    assert.equal(typeof g[key]?.r_check?.expression, 'string', `${key}: missing expression`);
    assert.ok(g[key].r_check.expression.trim(), key);
    assert.match(g[key].r_check.reference, /^[A-Za-z][A-Za-z0-9]*$/, key);
  }
  for (const [key, entry] of Object.entries(g)) if (entry.r_check) {
    assert.ok(entry.r_check.expression.trim(), key);
    assert.ok(entry.r_check.reference.trim(), key);
  }
}
test('every audited formula or numerical statistical rule carries an R expression', () => checked(glossary));
test('missing or empty numerical check is rejected (plants and control)', () => {
  checked(glossary);
  for (const key of required) {
    const missing = structuredClone(glossary); delete missing[key].r_check;
    assert.throws(() => checked(missing), /missing expression/);
    const empty = structuredClone(glossary); empty[key].r_check.expression = '';
    assert.throws(() => checked(empty));
  }
});
test('numeric metadata is carried by the rendered tooltip and stays English under localization', async () => {
  const source = readFileSync(new URL('../../tooltips.js', import.meta.url), 'utf8');
  async function gate(code) {
    const nodes = [];
    class Element {
      constructor() { this.attrs = {}; this.style = {}; this.dataset = {}; this.isConnected = true; }
      setAttribute(k, v) { this.attrs[k] = v; }
      getAttribute(k) { return this.attrs[k] ?? null; }
      append(...els) { nodes.push(...els); }
      addEventListener() {}
    }
    const mark = new Element(); mark.textContent = 'Q'; mark.setAttribute('data-gloss', 'Q');
    const document = { head: new Element(), body: new Element(), documentElement: new Element(),
      createElement: () => new Element(), getElementById: id => nodes.find(n => n.id === id),
      querySelector: s => s === '.alm-lang-switch' ? {} : null,
      querySelectorAll: s => s === '[data-gloss]' ? [mark] : [], addEventListener() {} };
    const window = { addEventListener() {} };
    vm.runInNewContext(code, { window, document, console, queueMicrotask, setTimeout, clearTimeout,
      MutationObserver: class { disconnect() {} observe() {} },
      localStorage: { getItem() {}, setItem() {} },
      fetch: async url => ({ ok: true, json: async () => url.includes('.es.')
        ? { Q: { short: 'Localized Q' } } : glossary }) });
    await window.alm.tooltips({ src: 'glossary.json' });
    const tip = nodes.find(n => n.id === mark.dataset.almTip);
    assert.equal(tip.dataset.rCheckExpression, glossary.Q.r_check.expression);
    await window.alm.tooltips.setLang('es');
    assert.equal(tip.textContent, 'Localized Q');
    assert.equal(tip.dataset.rCheckExpression, glossary.Q.r_check.expression);
    assert.equal(tip.dataset.rCheckReference, glossary.Q.r_check.reference);
  }
  await gate(source);
  const marker = "tip.dataset.rCheckExpression = check.expression;";
  assert.equal(source.split(marker).length, 2);
  await assert.rejects(() => gate(source.replace(marker, '')));
});
