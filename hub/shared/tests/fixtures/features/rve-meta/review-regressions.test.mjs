import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, report, script } from './review-harness.mjs';

test('P1: downloaded script uses the live coefficient plot for both model shapes', () => {
  for (const interceptOnly of [false, true]) {
    const c = load(interceptOnly), block = c.AlmRVEFeatures.verify;
    assert.equal(block.plots[0].r, c.AlmLiveAdapters['rve-meta'].plots[0].r);
    assert.match(script(c), /plot\(tab\$b.r/);
    assert.match(script(c), /segments\(tab\$CI.L/);
    assert.doesNotMatch(script(c), /forest.robu/);
    assert.match(script(c), /grDevices::dev.off\(\)[\s\n]*print\(sessionInfo\(\)\)/);
  }
});

test('P2: coefficient numbers start at one in results and flags', () => {
  const { rendered, audit } = report(load());
  assert.equal(audit.ok, true);
  assert.doesNotMatch(rendered.results.text, /Coefficient 0:/);
  for (const i of [1, 2, 3]) {
    assert.ok(rendered.results.text.includes(`Coefficient ${i}: estimate`));
    assert.ok(rendered.flags.some(f => f.text.startsWith(`Coefficient ${i}:`)));
  }
});

test('P2: low-df warning has a strict four-df boundary and typed citation', () => {
  const c = load();
  for (const df of [1.15, 3.999, 4, 4.999, 5]) {
    const { rendered, audit } = report(c, df);
    assert.equal(audit.ok, true, JSON.stringify(audit.failures));
    const warnings = rendered.flags.filter(f => /Satterthwaite degrees of freedom|Satterthwaite df/.test(f.text));
    assert.equal(warnings.length, df < 4 ? 1 : 0);
    if (df < 4) {
      assert.match(warnings[0].text, /p-values and confidence intervals may not be trustworthy/);
      assert.match(warnings[0].text, /Satterthwaite df < 4/);
      assert.ok(warnings[0].segments.some(s => s.type === 'cite' && s.text === 'Tipton 2015'));
    }
  }
});

test('P2: Methods cites all three sources and exports their references', () => {
  const c = load(), { rendered, audit } = report(c);
  assert.equal(audit.ok, true);
  for (const text of ['Hedges, Tipton and Johnson 2010', 'Tipton 2015', 'Pustejovsky and Tipton 2018']) {
    assert.ok(rendered.methods.segments.some(s => s.type === 'cite' && s.text === text), text);
  }
  assert.equal(rendered.cites.length, 3);
  for (const cite of rendered.cites) {
    assert.ok(c.AlmText.toMarkdown(rendered).includes(cite.full));
    assert.ok(c.AlmText.docxParagraphs(rendered).some(p => p.text === cite.full));
  }
});

test('P2: feature verification resolves the documented AlmValidate registry', () => {
  const c = load(), registered = c.AlmValidate.adapters['rve-meta'];
  assert.ok(registered);
  assert.equal(registered, c.AlmLiveAdapters['rve-meta']);
  assert.equal(registered, c.AlmRVEFeatures.verify.adapter());
});

test('PLANTED: changed coefficient provenance is rejected by the number audit', () => {
  const c = load(), { r, rendered, audit } = report(c);
  assert.equal(audit.ok, true);
  rendered.provenance.find(p => p.key === 'coef_0_estimate').value += 0.1;
  const planted = c.AlmText.audit(rendered, r);
  assert.equal(planted.ok, false);
  assert.ok(planted.failures.some(f => f.check.includes('coef_0_estimate:value')));
});
