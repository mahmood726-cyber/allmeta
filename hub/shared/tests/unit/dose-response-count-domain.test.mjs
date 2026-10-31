import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('shared/dose-response.js', root), 'utf8'), context);
const DR = context.AlmDoseResponse;
const html = readFileSync(new URL('dose-response-ma/index.html', root), 'utf8');

function studies(type, cases = 10, logrr = 0) {
  return ['A', 'B', 'C'].map(id => ({ id, rows: [
    { dose: 0, cases, n: 100, logrr: 0, se: null, type },
    { dose: 1, cases, n: 100, logrr, se: 0.5, type }
  ] }));
}
function fit(data, covariance = 'gl') {
  return DR.fitDR(data, { method: 'fixed', covariance });
}
function accepted(r) {
  assert.equal(r.ok, true, r.error);
  assert.equal(r.k, 3);
  assert.equal(r.excluded.length, 0);
  assert.ok(r.coef.every(Number.isFinite));
  assert.ok(r.vcov[0][0] > 0);
}
function csv(data) {
  return ['study,dose,cases,n,logrr,se,type', ...data.flatMap(s => s.rows.map(r =>
    [s.id, r.dose, r.cases, r.n, r.logrr, r.se, r.type].join(',')))].join('\n');
}
// Run the real page parser in node:vm; no browser or duplicated parsing logic.
function parse(text, covariance) {
  const ctx = vm.createContext({ window: {}, $: () => ({ value: covariance }) });
  vm.runInContext(html.slice(html.indexOf('    function inputError('), html.indexOf('    function syncControls(')), ctx);
  return ctx.parse(text, false);
}

for (const type of ['cc', 'ci']) {
  for (const covariance of ['gl', 'h']) {
    for (const row of [0, 1]) {
      test(`P02-R3 plant: ${type}/${covariance} rejects cases > n in row ${row + 1} with study context`, () => {
        const data = studies(type);
        data.forEach(s => { s.rows[row].cases = 101; });
        const r = fit(data, covariance);
        assert.equal(r.ok, false, 'impossible counts must not produce a fit');
        assert.equal(r.excluded.length, 3);
        r.excluded.forEach((e, i) => {
          assert.equal(e.id, data[i].id);
          assert.match(e.reason, new RegExp(`row ${row + 1}`, 'i'));
          assert.match(e.reason, /cases.*n/i);
        });
      });
      test(`P02-R3 page plant: ${type}/${covariance} reports CSV row ${row + 2} and study`, () => {
        const data = studies(type);
        data[0].rows[row].cases = 101;
        assert.throws(() => parse(csv(data), covariance), error => {
          assert.match(error.message, new RegExp(`Row ${row + 2}.*study A.*cases.*n`, 'i'));
          return true;
        });
      });
    }
    test(`P02-R3 control: valid ${type}/${covariance} counts fit and parse`, () => {
      const data = studies(type);
      accepted(fit(data, covariance));
      accepted(fit(parse(csv(data), covariance), covariance));
    });
  }
}

for (const covariance of ['gl', 'h']) {
  test(`P02-R3 control: ir/${covariance} cases may exceed person-time`, () => {
    const data = studies('ir', 101);
    accepted(fit(data, covariance));
    accepted(fit(parse(csv(data), covariance), covariance));
  });
}

for (const type of ['cc', 'ci', 'ir']) {
  test(`P02-R3 plant: ${type}/gl cannot hide invalid reconstructed counts behind one SE`, () => {
    const data = studies(type, 10, 1000);
    const r = fit(data);
    assert.equal(r.ok, false, 'finite input counts do not guarantee valid reconstruction');
    assert.match(r.error, /study A.*reconstruct.*row/i);
  });
  test(`P02-R3 control: ${type}/gl one-contrast valid reconstruction retains supplied variance`, () => {
    const levels = studies(type)[0].rows.map(r => ({ ...r, y: r.logrr, v: r.se == null ? 0 : r.se ** 2 }));
    const S = DR._internal.covarLogRR(levels, type, 'gl');
    assert.equal(S.length, 1);
    assert.equal(S[0][0], levels[1].v);
  });
}

test('P02-R3 plant: infinite counts are rejected before reconstruction', () => {
  for (const key of ['cases', 'n']) {
    const data = studies('cc');
    data.forEach(s => { s.rows[1][key] = Infinity; });
    const r = fit(data);
    assert.equal(r.ok, false);
    assert.equal(r.excluded.length, 3);
    assert.match(r.excluded[0].reason, /row 2.*finite/i);
  }
});

test('P02-R3 control: independent covariance still does not require usable counts', () => {
  accepted(fit(studies('cc', 0), 'indep'));
  accepted(fit(parse(csv(studies('cc', 0)), 'indep'), 'indep'));
});
