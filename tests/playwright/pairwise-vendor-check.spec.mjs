/**
 * Verifies the TruthCert family loads its vendored libraries (Plotly, jsPDF,
 * html2canvas, XLSX) with no remote CDN and no SRI/CSP/console errors.
 * Regression guard for the CDN-vendoring + xlsx-SRI-hash fixes.
 */
import { test, expect } from '@playwright/test';

// Benign on every meta-CSP page: frame-ancestors can only be set via HTTP header.
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

const APPS = [
  {
    name: 'Pairwiseai bundle',
    url: 'http://127.0.0.1:8080/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html',
    globals: { Plotly: 'object', jspdf: 'object', html2canvas: 'function', XLSX: 'object' },
  },
  {
    name: 'Truthcert1 production',
    url: 'http://127.0.0.1:8080/Truthcert1/TruthCert-PairwisePro-v1.0-production.html',
    globals: { XLSX: 'object' },  // the lib whose SRI hash had gone stale
  },
];

for (const app of APPS) {
  test(`${app.name}: vendored libs load, no CDN, no SRI/console errors`, async ({ page }) => {
    const errors = [];
    const cdnReqs = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push('CONSOLE: ' + m.text()); });
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));
    page.on('request', r => {
      const u = r.url();
      if (/^https?:\/\//.test(u) && !u.startsWith('http://127.0.0.1') && !u.startsWith('http://localhost')) cdnReqs.push(u);
    });

    await page.goto(app.url, { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const got = await page.evaluate((keys) => {
      const out = {};
      for (const k of keys) out[k] = typeof window[k];
      return out;
    }, Object.keys(app.globals));

    console.log(`  [${app.name}] globals: ${JSON.stringify(got)} | off-origin: ${cdnReqs.length ? cdnReqs.join(',') : '(none)'}`);
    if (errors.length) console.log('   errors:\n    ' + errors.join('\n    '));

    for (const [k, t] of Object.entries(app.globals)) {
      expect(got[k], `${k} global in ${app.name}`).toBe(t);
    }
    expect(cdnReqs, 'no off-origin/CDN requests').toEqual([]);
    expect(errors, 'no console/page errors').toEqual([]);
  });
}
