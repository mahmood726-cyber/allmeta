import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pageHarness, cases, studies, read } from './p05-qprofile-harness.mjs';
const input = cases();
const app = pageHarness();
const ci = (c, alpha = c.alpha) => app.context.AlmHetCI.qProfileCI(studies(c.text), alpha);
const reference = () => JSON.parse(read('hub/shared/tests/unit/p05-qprofile-reference.json'));
const near = (actual, expected, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual-expected) <= 1e-9,
  `${label}: ${actual} versus ${expected}; absolute tolerance 1e-9`);

test('P05-R5 control: native R provenance and inputs are exact', () => {
  const ref = reference();
  for (const key of ['R', 'metafor', 'metadat', 'jsonlite', 'session']) assert.ok(ref.provenance[key]);
  assert.equal(ref.provenance.serialization, 'base R; 17 significant digits');
  for (const [key, path] of Object.entries({ input_md5: 'hub/shared/tests/unit/p05-qprofile-input.json',
    script_md5: 'hub/shared/tests/unit/p05-qprofile-reference.R', corpus_md5: 'heterogeneity/validate/corpus/corpus.json',
    csv_md5: 'hub/shared/tests/unit/p05-qprofile-input.csv', prepare_md5: 'hub/shared/tests/unit/p05-qprofile-prepare.mjs' })) {
    // Provenance records the LF bytes used by R and by the CI checkout.
    assert.equal(ref.provenance[key], createHash('md5').update(read(path).replace(/\r\n/g, '\n')).digest('hex'));
  }
  assert.deepEqual(ref.fits.map(r => r.id), input.map(c => c.id));
  for (const c of input) {
    const r = ref.fits.find(r => r.id === c.id), rows = studies(c.text);
    assert.equal(r.text, c.text);
    assert.deepEqual(r.yi, rows.map(s => s.est));
    assert.deepEqual(r.sei, rows.map(s => s.se));
    assert.equal(r.empty, c.empty);
    assert.equal(r.empty, r.Q0 < r.qLo);
  }
});

for (const c of input) {
  test(`P05-R5 control: ${c.id} endpoints and PM point estimates match native R`, () => {
    const ref = reference().fits.find(r => r.id === c.id), q = ci(c), fit = app.run(c.text);
    for (const key of ['tau2Lo', 'tau2Hi', 'I2Lo', 'I2Hi']) near(q[key], ref.limits[key], key);
    near(fit.tau2, ref.tau2, 'PM tau2'); near(fit.sum.mu, ref.mu, 'PM mu');
  });
  test(`P05-R5 ${c.empty ? 'plant' : 'control'}: ${c.id} source identifies confidence-set status`, () => {
    assert.equal(ci(c).empty, c.empty);
  });
  // The page is fixed at 95%; alpha90 is solely a shared-source test.
  if (c.alpha !== 0.05) continue;
  test(`P05-R5 ${c.empty ? 'plant' : 'control'}: ${c.id} display explains confidence-set status`, () => {
    const fit = app.run(c.text), cards = app.cards();
    for (const name of ['I² (model-based)', 'τ² 95% CI (Q-profile)']) {
      assert.ok(cards[name], name);
      if (c.empty) {
        assert.match(cards[name], /empty confidence set/i);
        assert.match(cards[name], /boundary limits/i);
      } else {
        assert.doesNotMatch(cards[name], /empty confidence set/i);
        assert.match(cards[name], /\[[\d.]+, [\d.]+\]/);
      }
    }
    assert.ok(cards['I² (model-based)'].startsWith(fit.sum.I2Model.toFixed(1) + '%'));
    assert.equal(cards['τ² (PM)'], fit.tauEstimates.pm.toFixed(4));
    if (c.empty) {
      assert.match(app.markup(), /Q\(0\).*lower.*chi-square/i);
      assert.match(app.markup(), /placeholders.*not.*zero-width interval/i);
    }
  });
  test(`P05-R5 ${c.empty ? 'plant' : 'control'}: ${c.id} all five results exports carry status`, () => {
    const fit = app.run(c.text), out = app.context.__almResults();
    assert.equal(out.qprofile_empty, c.empty);
    for (const [format, text] of Object.entries(app.exports())) {
      assert.match(text, /qprofile_empty/, format);
      assert.match(text, c.empty ? /empty confidence set/i : /nonempty confidence set/i, format);
      if (c.empty) assert.match(text, /boundary placeholders.*not.*zero-width interval/i, format);
    }
    for (const [exportKey, sourceKey] of Object.entries({ tau2_ci_lb: 'tau2Lo', tau2_ci_ub: 'tau2Hi', I2_ci_lb: 'I2Lo', I2_ci_ub: 'I2Hi' })) {
      assert.equal(out[exportKey], fit.qpci[sourceKey]);
    }
  });
}

test('P05-R5 control: a zero PM estimate can have a nonempty interval', () => {
  const fit = app.run(input.find(c => c.id === 'nonempty_tau2_zero').text);
  assert.equal(fit.tau2, 0); assert.equal(fit.qpci.tau2Lo, 0); assert.ok(fit.qpci.tau2Hi > 0);
  assert.notEqual(fit.qpci.empty, true);
});
test('P05-R5 control: fewer than two studies has no Q-profile interval', () => {
  assert.equal(app.context.AlmHetCI.qProfileCI([]), null);
  assert.equal(app.context.AlmHetCI.qProfileCI([{ est: 0, se: 1 }]), null);
});
