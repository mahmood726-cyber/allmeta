// In-memory planted defects prove the parity assertions exercise production code.
// No application source or R reference is changed, and controls use the same inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sources, loadEngine, near, checkSummary, checkRows, checkEvalue } from './p20-engine.mjs';
const read = name => JSON.parse(readFileSync(new URL('../r/' + name, import.meta.url), 'utf8'));
const ref = read('p20-reference.json');
const control = loadEngine();
function plant(file, old, replacement) {
  assert.equal(sources[file].split(old).length, 2, 'The exact planted source fragment must occur once');
  return loadEngine({ [file]: sources[file].replace(old, replacement) });
}
const cases = [
  {
    name: 'means approximate J replaces exact small-sample correction',
    mutate: () => plant('accuracy', 'if (df > 100000)', 'if (df >= 2)'),
    check(e) {
      const c = ref.means.find(c => c.id === 'minimum-df'), p = c.input;
      checkSummary(e.accuracy.fromMeans(p.m1,p.sd1,p.n1,p.m2,p.sd2,p.n2), c.expected, c.id);
    },
  },
  {
    name: 't loses the negative effect direction',
    mutate: () => plant('accuracy', 'const d = t *', 'const d = Math.abs(t) *'),
    check(e) {
      const c = ref.t.find(c => c.id === 'unequal-negative'), p = c.input;
      checkSummary(e.accuracy.fromT(p.t,p.n1,p.n2), c.expected, c.id);
    },
  },
  {
    name: 'F forgets the square root',
    mutate: () => plant('accuracy', 'sign * Math.sqrt(f)', 'sign * f'),
    check(e) {
      const c = ref.f.find(c => c.id === 'unequal-negative'), p = c.input;
      checkSummary(e.accuracy.fromF(p.f,p.n1,p.n2,p.sign), c.expected, c.id);
    },
  },
  {
    name: 'Wald uses one-sided p instead of two-sided p',
    mutate: () => plant('accuracy', 'qnorm(p / 2)', 'qnorm(p)'),
    check(e) {
      const c = ref.wald.find(c => c.id === 'or-p-control');
      near(e.derive(c.input, c.supplied), c.expected.se, c.id);
    },
  },
  {
    name: 'conversion omits OR-to-RR delta derivative',
    mutate: () => plant('html', 'Math.abs(1 - p0 * rr) * se', 'se'),
    check(e) {
      const c = ref.convert.find(c => c.id === 'or-harmful');
      checkRows(e.convert(c.input), c.expected, c.id);
    },
  },
  {
    name: 'EValue treats common OR as rare',
    mutate: () => plant('evalue', 'rare ? est : Math.sqrt(est)', 'est'),
    check(e) {
      const ev = read('p20-evalue-reference.json');
      const c = ev.cases.find(c => c.id === 'or-common'), p = c.input;
      checkEvalue(e.evalue.eValues(p.type,p.est,p.lo,p.hi,{rare:p.rare}), c.expected, c.id);
    },
  },
];
for (const c of cases) {
  test(`P20 planted-defect control: ${c.name}`, () => {
    c.check(control);
    assert.throws(() => c.check(c.mutate()), assert.AssertionError);
  });
}
