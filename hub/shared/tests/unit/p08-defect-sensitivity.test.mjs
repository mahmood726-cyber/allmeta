import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, studies, close } from '../../../../meta-regression/tests/review-p08/harness.mjs';

// Deliberately reconstructed defects, NOT a claim to possess the pre-PR bytes.
// The actual PR parent and diff were not supplied in this job bundle.
function cappedSearch(source) {
  const start = source.indexOf('    function pmTau2(');
  const end = source.indexOf('    // PM ', start);
  assert.ok(start >= 0 && end > start, 'locate only the PM root search');
  return source.slice(0, start) + `
    function pmTau2(studies, target, q0, Qat) {
      if (q0 <= target) return 0;
      let lo = 0, hi = 1;
      while (Qat(hi) > target && hi < 1e6) hi *= 2;
      // Defect: bisect even when the upper search limit is not a bracket.
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        if (Qat(mid) > target) lo = mid; else hi = mid;
        if (hi - lo < 1e-12) break;
      }
      return (lo + hi) / 2;
    }
` + source.slice(end);
}

function uncheckedNonFinite(source) {
  const old = cappedSearch(source);
  const replacement = old.replace('fitted && Number.isFinite(fitted.rss)', 'fitted');
  assert.notEqual(old, replacement, 'plant the removed final finite-result guard');
  return replacement;
}

const checks = [
  ['scaled moderator root', app => close(app.fitPM(studies(1e6)).tau2, 1e12, 'tau2'), cappedSearch],
  ['scaled null root', app => close(app.fitPMNull(studies(1e6)), 27e12, 'null tau2'), cappedSearch],
  ['scaled exported R2', app => close(app.renderRows(studies(1e6)).R2_tau2, 26 / 27, 'R2'), cappedSearch],
  ['tiny positive roots', app => {
    const rows = studies(1e-15);
    close(app.fitPM(rows).tau2 / 1e-30, 1, 'tiny moderator root');
    close(app.fitPMNull(rows) / 1e-30, 27, 'tiny null root');
  }, cappedSearch],
  ['non-finite moderator refusal', app => assert.equal(app.fitPM(studies().map(s => ({ ...s, est: s.est * 1e155 }))), null), uncheckedNonFinite],
  ['non-finite null refusal', app => assert.equal(app.fitPMNull(studies().map(s => ({ ...s, est: s.est * 1e155 }))), null), uncheckedNonFinite],
  ['failed fit clears previous exports', app => {
    app.renderRows(studies());
    const out = app.renderRows(studies().map(s => ({ ...s, est: s.est * 1e155 })));
    assert.equal(Object.hasOwn(out, 'tau2_pm'), false);
    assert.match(app.elements.get('warn-banner').innerHTML, /Paule.Mandel.*finite/i);
  }, uncheckedNonFinite],
  ['failed null leaves R2 unavailable', app => {
    app.renderRows(studies());
    const out = app.renderRows([-1, 0, 1].map((x, i) => ({ label: `S${i}`, est: x * 1e155, se: 1, v: 1, x })));
    assert.equal(out.tau2_pm, 0);
    assert.equal(out.R2_tau2, null);
    assert.match(app.elements.get('warn-banner').innerHTML, /Paule.Mandel.*R.*unavailable/i);
  }, uncheckedNonFinite],
];

for (const [name, check, transformEngine] of checks) {
  test(`P08 evidence: ${name} passes on PR and rejects a reconstructed defect`, () => {
    check(loadApp());
    // Loading must succeed: a syntax error is not evidence of defect detection.
    const defectiveApp = loadApp({ transformEngine });
    assert.throws(() => check(defectiveApp), { code: 'ERR_ASSERTION' });
  });
}

test('P08 evidence control: reconstructed searches retain the ordinary roots', () => {
  for (const transformEngine of [cappedSearch, uncheckedNonFinite]) {
    const app = loadApp({ transformEngine });
    close(app.fitPM(studies()).tau2, 1, 'ordinary moderator root');
    close(app.fitPMNull(studies()), 27, 'ordinary null root');
    close(app.renderRows(studies()).R2_tau2, 26 / 27, 'ordinary R2');
  }
});

test('P08 export control: six ordinary scripts retain their exact LF fixture bytes', async () => {
  const { readFileSync } = await import('node:fs');
  const base = new URL('../fixtures/features/meta-regression/rscript/', import.meta.url);
  const configs = JSON.parse(readFileSync(new URL('configs.json', base), 'utf8'));
  const app = loadApp();
  for (const cfg of configs) {
    assert.equal(app.rScript(app.parseStudies(cfg.data).studies, {}),
      readFileSync(new URL(cfg.file, base), 'utf8').replaceAll('\r\n', '\n'), cfg.id);
  }
});
