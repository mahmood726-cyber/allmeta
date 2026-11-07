import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import MV from '../../../../shared/multivariate-ma.js';

// Run the shipped parser and derived-table renderer, without a browser.
const html = readFileSync(new URL('../../../../multivariate-ma/index.html', import.meta.url), 'utf8');
function extract(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Locate ${start}`);
  return html.slice(a, b);
}
const parse = vm.runInNewContext(extract('    function number(s)', '    // The mode is kept') + '\nparse;', {
  window: { AlmMultivariate: MV }
});
function derivedTable(parsed) {
  const element = () => ({ children: [], attributes: {},
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const body = element();
  const render = vm.runInNewContext(extract('    function renderDerived(parsed)', '    function renderOmitted(parsed)') + '\nrenderDerived;', {
    el: () => body, document: { createElement: element }, fmt: (x, d) => x.toFixed(d)
  });
  render(parsed);
  return body.children[0];
}
function row(v1, v2, value, mode) {
  const parsed = parse(`study, 1, ${v1}, 2, ${v2}` + (mode === 'rhoW' ? '' : `, ${value}`), mode, value);
  assert.equal(parsed.omitted.length, 0);
  assert.equal(parsed.rows.length, 1);
  return parsed;
}
function near(actual, expected) {
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs((actual - expected) / expected) <= 2e-15,
    `got ${actual}, expected ${expected}`);
}

// Analytical identities, not R reference values. In units of u, the exact
// covariances sqrt(2)/2, sqrt(3)/2, sqrt(8)/2 and sqrt(18)/2 round to 1,1,1,2.
const u = Number.MIN_VALUE;
const cases = [[u, 2 * u, u], [u, 3 * u, u], [2 * u, 4 * u, u], [3 * u, 6 * u, 2 * u]];
test('P18-R2-RV1 plant: helper rounds unequal subnormal covariance only after multiplying r', () => {
  for (const [a, b, expected] of cases) {
    for (const [v1, v2] of [[a, b], [b, a]]) {
      for (const sign of [-1, 1]) assert.equal(MV.covFromR(v1, v2, sign * 0.5), sign * expected);
      assert.equal(MV.covFromR(v1, v2, 0), 0);
    }
  }
});
for (const mode of ['r', 'rhoW']) {
  test(`P18-R2-RV1 plant: ${mode} parser preserves unequal subnormal covariance`, () => {
    for (const [a, b, expected] of cases) {
      for (const [v1, v2] of [[a, b], [b, a]]) {
        for (const sign of [-1, 1]) {
          const parsed = row(v1, v2, sign * 0.5, mode);
          assert.equal(parsed.rows[0].cov, sign * expected);
          assert.equal(parsed.rows[0].r, sign * 0.5);
          assert.equal(parsed.rhoW, mode === 'rhoW' ? sign * 0.5 : null);
        }
      }
    }
  });
}
test('P18-R2-RV1 plant: covariance parser divides without a rounded subnormal scale', () => {
  for (const [a, b, cov] of cases) {
    for (const [v1, v2] of [[a, b], [b, a]]) {
      for (const sign of [-1, 1]) {
        const parsed = row(v1, v2, sign * cov, 'cov');
        assert.equal(parsed.rows[0].cov, sign * cov);
        near(parsed.rows[0].r, sign * (cov / u) / Math.sqrt((a / u) * (b / u)));
        assert.ok(Math.abs(parsed.rows[0].r) < 1);
      }
    }
  }
});
test('P18-R2-RV1 plant: positive-definite unequal subnormal covariance has no derived-table warning', () => {
  const tr = derivedTable(row(u, 2 * u, u, 'cov'));
  assert.equal(tr.children[2].textContent, '0.7071');
  assert.equal(tr.children[3].textContent, '');
  assert.equal(tr.attributes['data-flag'], undefined);
});
test('P18-R2-RV1 control: ordinary and equal-subnormal conversions retain their values', () => {
  for (const [v1, v2, cov] of [[4, 9, 3], [4 * u, 4 * u, 2 * u]]) {
    for (const sign of [-1, 1]) {
      assert.equal(MV.covFromR(v1, v2, sign * 0.5), sign * cov);
      for (const mode of ['r', 'rhoW']) assert.equal(row(v1, v2, sign * 0.5, mode).rows[0].cov, sign * cov);
      assert.equal(row(v1, v2, sign * cov, 'cov').rows[0].r, sign * 0.5);
    }
  }
});
test('P18-R2-RV1 control: invalid covariance still receives a derived-table warning', () => {
  for (const [v1, v2, cov] of [[4, 9, 12], [u, 2 * u, 2 * u]]) {
    const tr = derivedTable(row(v1, v2, cov, 'cov'));
    assert.equal(tr.attributes['data-flag'], 'r');
    assert.equal(tr.children[3].textContent, '|r| ≥ 1: covariance not positive definite');
  }
});
test('P18-R2-RV1 control: singular subnormal covariance retains its boundary warning', () => {
  for (const [v1, v2, cov] of [[u, 4 * u, 2 * u], [2 * u, 8 * u, 4 * u], [3 * u, 12 * u, 6 * u]]) {
    for (const sign of [-1, 1]) {
      const parsed = row(v1, v2, sign * cov, 'cov');
      assert.equal(parsed.rows[0].r, sign);
      assert.equal(derivedTable(parsed).attributes['data-flag'], 'r');
    }
  }
});
