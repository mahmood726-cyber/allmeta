import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../mh-peto/index.html', import.meta.url), 'utf8');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing page section: ${start}`);
  return html.slice(a, b);
}
// Execute the shipped engine and convention rendering block verbatim, without a browser.
const engine = section('// ---- engine (unchanged from pre-retrofit) ----', '// ---- axis state');
const render = section('// Rare-event conventions side by side (E2).', '// Fragility index');

function harness(measure) {
  const nodes = { 'conv-body': { innerHTML: '' }, 'conv-note': { textContent: '' } };
  const context = vm.createContext({
    measure,
    document: { getElementById(id) { assert.ok(id in nodes, id); return nodes[id]; } },
  });
  vm.runInContext(engine, context);
  function show(res) {
    context.res = res;
    context.mhPooled = res.mh;
    context.pooled = res.peto ? [{ name: 'Peto OR', ...res.peto }] : [];
    vm.runInContext(render, context);
    return {
      note: nodes['conv-note'].textContent,
      table: nodes['conv-body'].innerHTML,
      fits: Array.from(context.convRows, row => row[1]),
    };
  }
  return {
    analyse(rows) { return show(context.analyse(rows, measure)); },
    // These are deliberately injected presentation inputs, not R reference values.
    inject(betas, ses = betas.map(() => 1)) {
      const fits = betas.map((beta, i) => context.convPack(beta, ses[i]));
      function pooled(fit) {
        if (fit.beta === null || fit.se === null) return null;
        return measure === 'RD' ? { est: fit.beta, se: fit.se }
          : { logEst: fit.beta, seLog: fit.se };
      }
      return show({
        mh: pooled(fits[0]),
        peto: measure === 'OR' ? pooled(fits[2]) : null,
        conv: { metaDefault: fits[1], iv: fits.at(-1) },
      });
    },
  };
}

function assertOpposite(note) {
  assert.match(note, /disagree on direction/);
  assert.match(note, /opposite sides of the null/);
  assert.doesNotMatch(note, /agree on direction and significance/);
  assert.match(note, /Report the convention you used/);
}

test('P10-R5 count-based reproduction: close nonsignificant OR estimates straddle the null', () => {
  const result = harness('OR').analyse([
    { label: 'A', e1: 10, n1: 100, e2: 8, n2: 50 },
    { label: 'B', e1: 10, n1: 100, e2: 10, n2: 100 },
    { label: 'C', e1: 3, n1: 30, e2: 5, n2: 200 },
  ]);
  assert.equal(result.fits.length, 4);
  assert.ok(result.fits[0].beta < 0);
  assert.ok(result.fits[3].beta > 0);
  assert.ok(result.fits.every(fit => fit.p > 0.05));
  const betas = result.fits.map(fit => fit.beta);
  assert.ok(Math.max(...betas) - Math.min(...betas) < Math.log(1.1));
  assertOpposite(result.note);
});

for (const measure of ['OR', 'RR', 'RD']) {
  const values = (first, second, last) => measure === 'OR'
    ? [first, second, first, last] : [first, second, last];
  const agreement = 'The conventions agree on direction and significance' +
    (measure === 'RD' ? '.' : ', and their estimates are within 10% of each other.');

  test(`P10-R5 ${measure}: opposite analysis-scale signs are explicitly flagged`, () => {
    const result = harness(measure).inject(values(-0.015, -0.017, 0.022));
    assertOpposite(result.note);
    assert.doesNotMatch(result.note, /disagree on statistical significance|more than 10%/);
  });

  test(`P10-R5 ${measure}: null versus non-null does not claim direction agreement`, () => {
    for (const beta of [-0.01, 0.01]) {
      const { note } = harness(measure).inject(values(0, 0, beta));
      assert.match(note, /disagree on direction/);
      assert.doesNotMatch(note, /agree on direction and significance|opposite sides/);
    }
  });

  test(`control ${measure}: same-direction and all-null agreement wording is unchanged`, () => {
    for (const betas of [values(-0.015, -0.017, -0.022), values(0.015, 0.017, 0.022), values(0, -0, 0)]) {
      assert.equal(harness(measure).inject(betas).note, agreement);
    }
  });

  test(`control ${measure}: significance disagreement is still flagged`, () => {
    const betas = values(0.015, 0.017, 0.022), ses = betas.map(() => 1);
    ses[0] = 0.001;
    const { note } = harness(measure).inject(betas, ses);
    assert.match(note, /disagree on statistical significance at the 5% level/);
    assert.doesNotMatch(note, /disagree on direction/);
  });

  test(`control ${measure}: undefined conventions are excluded and fewer than two suppress the note`, () => {
    const h = harness(measure);
    const result = h.inject(values(0.01, null, 0.02));
    assert.equal(result.note, agreement);
    assert.match(result.table, /not estimable for these tables/);
    assert.equal(h.inject(values(null, null, 0.02)).note, '');
    assert.equal(h.inject(values(null, null, null)).note, '');
    assert.equal(h.inject(values(0.01, 0.02, 0.03), values(null, null, 1)).note, '');
    assert.equal(h.inject(values(0, 0, 0.02), values(0, 0, 1)).note, '');
  });

  test(`control ${measure}: the existing estimate-distance rule is unchanged`, () => {
    const { note } = harness(measure).inject(values(0.01, 0.02, 0.3));
    if (measure === 'RD') assert.equal(note, agreement);
    else assert.match(note, /the estimates differ by more than 10% between conventions/);
    assert.doesNotMatch(note, /disagree on direction/);
  });
}

test('control OR: significance and estimate-distance warnings remain alongside opposite directions', () => {
  const { note } = harness('OR').inject([-0.3, -0.3, -0.3, 0.3], [0.01, 1, 1, 1]);
  assertOpposite(note);
  assert.match(note, /disagree on statistical significance at the 5% level/);
  assert.match(note, /the estimates differ by more than 10% between conventions/);
});
