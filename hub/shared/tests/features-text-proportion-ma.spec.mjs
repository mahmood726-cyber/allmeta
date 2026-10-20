/**
 * F2 in-app text for app 9 (proportion-ma): plain-language / Methods / Results generated only from the
 * app's own results (shared/alm-text.js + proportion-ma/alm-features-text.js), with a number audit.
 * Runs WITHOUT the feature-panel host: the text engine is driven in-page and AlmTextUI is mounted into a
 * test-created div. Proves, on the built-in example:
 *   1. AlmText.audit passes (prints TEXTAUDIT n/N), incl. the DOM cross-check inside the audit;
 *   2. >= 3 values in the Results text equal what the page DISPLAYS (read here independently from the DOM);
 *   3. the three paragraphs + notes equal hub/shared/tests/__snapshots__/text-proportion-ma.json
 *      (build version/sha normalised to <build.*> so regenerating shared/build-info.js does not churn it);
 *   4. the UI mounts, .md download contains the Results paragraph; .docx download (needs shared/alm-zip.js)
 *      unzips and contains the Results paragraph;
 *   5. PLANTED: window.__almTextPerturb on a DOM-cross-checked key -> audit FAILS and the UI withholds the text;
 *   6. no results -> "Run the analysis first."
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAP = path.join(HERE, '__snapshots__', 'text-proportion-ma.json');
const BENIGN = /frame-ancestors|ERR_CONNECTION|Schwarzer|favicon|glossary|404/;
const APP = 'proportion-ma';

async function openApp(page, errs) {
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('/proportion-ma/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastPropMA === 'function' && window._almLastPropMA()
    && window.AlmText && window.AlmTextSpecs && window.AlmTextSpecs['proportion-ma'], null, { timeout: 20000 });
}

// Render + audit in page with the deterministic context used for the snapshot (no entry log, no verification).
async function renderInPage(page) {
  return page.evaluate((app) => {
    const spec = window.AlmTextSpecs[app];
    const r = spec.results();
    const ctx = { app, build: window.AlmBuildInfo, entryLog: [], verify: null, revision: undefined };
    const rendered = window.AlmText.render(spec.templates, r, ctx);
    const dom = spec.dom();
    const audit = window.AlmText.audit(rendered, r, { ctx, dom });
    const norm = p => p.segments.map(s => (s.type === 'ctx' && s.key.indexOf('build.') === 0 ? '<' + s.key + '>' : s.text)).join('');
    return {
      audit,
      domKeys: Object.keys(dom),
      text: { plain: rendered.plain.text, methods: rendered.methods.text, results: rendered.results.text, flags: rendered.flags.map(f => f.text) },
      snapshot: {
        app,
        source: 'built-in example (proportion-ma/index.html #src), default options: logit transformation, Paule-Mandel tau2',
        plain: norm(rendered.plain),
        methods: norm(rendered.methods),
        results: norm(rendered.results),
        flags: rendered.flags.map(norm),
        references: rendered.cites.map(c => c.full),
      },
    };
  }, APP);
}

// Minimal reader for store-only ZIP (the AlmZip contract): central directory -> entry bytes.
function readStoredZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('no EOCD');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central header');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    if (method !== 0) throw new Error('entry ' + name + ' is not stored');
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    out[name] = buf.slice(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

test('text audit passes, matches the page display and the committed snapshot', async ({ page }, testInfo) => {
  const errs = [];
  await openApp(page, errs);
  const out = await renderInPage(page);

  // Always emit the actual rendered text (artifact) so a snapshot can be reviewed / regenerated.
  const actualJson = JSON.stringify(out.snapshot, null, 2) + '\n';
  const actualPath = testInfo.outputPath('text-proportion-ma.json');
  fs.writeFileSync(actualPath, actualJson, 'utf8');
  fs.mkdirSync(path.join(HERE, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'artifacts', 'text-proportion-ma.actual.json'), actualJson, 'utf8');
  await testInfo.attach('text-proportion-ma.json', { path: actualPath, contentType: 'application/json' });

  // 1. audit (includes provenance, token order, typed tokens and the DOM cross-check)
  console.log(`TEXTAUDIT ${out.audit.passed}/${out.audit.checks} tokens=${out.audit.tokens} domChecked=${out.audit.domChecked}`);
  expect(out.audit.failures, JSON.stringify(out.audit.failures)).toEqual([]);
  expect(out.audit.ok).toBe(true);
  expect(out.audit.domChecked).toBeGreaterThanOrEqual(3);

  // 2. independent DOM read: values the page displays appear verbatim in the Results paragraph
  const pooled = page.locator('#res-body tr.pooled-row td');
  const shownP = (await pooled.nth(2).innerText()).trim();
  const [shownLo, shownHi] = (await pooled.nth(3).innerText()).split('–').map(s => s.trim());
  const codes = page.locator('#het code');
  const shownTau2 = (await codes.nth(0).innerText()).trim();
  const shownQ = (await codes.nth(1).innerText()).trim();
  const shownI2 = (await codes.nth(2).innerText()).trim();
  const shownDf = /df=(\d+)/.exec(await page.locator('#het').innerText())[1];
  const res = out.text.results.replace(/−/g, '-');
  const expectations = [
    [`pooled proportion was ${shownP} (95% CI ${shownLo} to ${shownHi})`, 'pooled proportion + CI'],
    [`τ² = ${shownTau2}`, 'tau2'],
    [`Q = ${shownQ} (df = ${shownDf})`, 'Q and df'],
    [`I² = ${shownI2}`, 'I2'],
  ];
  if (await codes.count() >= 4) {
    const [piLo, piHi] = (await codes.nth(3).innerText()).split('–').map(s => s.trim());
    expectations.push([`prediction interval for the proportion in a new study similar to those included was ${piLo} to ${piHi}`, 'PI']);
  }
  let hit = 0;
  for (const [s, what] of expectations) { if (res.includes(s)) hit++; else console.log(`TEXTDOM miss ${what}: ${s}`); }
  console.log(`TEXTDOM ${hit}/${expectations.length}`);
  expect(hit).toBe(expectations.length);
  expect(hit).toBeGreaterThanOrEqual(3);

  // 3. snapshot
  if (!fs.existsSync(SNAP)) {
    throw new Error(`Snapshot ${path.relative(HERE, SNAP)} is missing. Review the actual text attached as text-proportion-ma.json ` +
      `(also artifacts/text-proportion-ma.actual.json), check its numbers against the page, and commit it.`);
  }
  const expected = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  expect(out.snapshot).toEqual(expected);
  expect(errs, 'no console errors').toEqual([]);
});

test('Report text UI: three blocks, audit line, .md and .docx downloads', async ({ page }, testInfo) => {
  const errs = [];
  await openApp(page, errs);
  await page.evaluate((app) => {
    const host = document.createElement('div');
    host.id = 'alm-text-test-host';
    document.body.appendChild(host);
    window.AlmTextUI.mount(host, { app, text: window.AlmTextSpecs[app] });
  }, APP);
  const host = page.locator('#alm-text-test-host');
  const out = await renderInPage(page);
  for (const k of ['plain', 'methods', 'results']) {
    await expect(host.locator(`[data-para="${k}"]`)).toHaveText(out.text[k]);
  }
  await expect(host.locator('.alm-text-audit')).toContainText('Number audit:');
  await expect(host.locator('.alm-text-flags li')).toHaveCount(out.text.flags.length);
  await expect(host.locator('.alm-text-copy')).toHaveCount(3);

  const [md] = await Promise.all([page.waitForEvent('download'), host.locator('.alm-text-md').click()]);
  expect(md.suggestedFilename()).toBe('proportion-ma-report-text.md');
  const mdText = fs.readFileSync(await md.path(), 'utf8');
  expect(mdText).toContain('## Results');
  expect(mdText).toContain(out.text.results);
  expect(mdText).toContain(out.text.methods);
  console.log(`TEXTMD bytes=${Buffer.byteLength(mdText)}`);

  const hasZip = await page.evaluate(() => !!(window.AlmZip && typeof window.AlmZip.docx === 'function'));
  if (!hasZip) {
    await expect(host.locator('.alm-text-docx')).toBeDisabled();
    expect(errs, 'no console errors').toEqual([]);
    test.skip(true, 'shared/alm-zip.js (AlmZip.docx, panel lane) is not in this branch; the .docx check runs once the branches combine. The .docx button is verified DISABLED here.');
    return;
  }
  const [dx] = await Promise.all([page.waitForEvent('download'), host.locator('.alm-text-docx').click()]);
  expect(dx.suggestedFilename()).toBe('proportion-ma-report-text.docx');
  const entries = readStoredZip(fs.readFileSync(await dx.path()));
  expect(Object.keys(entries)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']));
  const docXml = entries['word/document.xml'].toString('utf8');
  expect(docXml).toContain(xmlEsc(out.text.results));
  console.log(`TEXTDOCX entries=${Object.keys(entries).length} documentXml=${docXml.length}`);
  expect(errs, 'no console errors').toEqual([]);
});

test('PLANTED: perturbing a DOM-cross-checked result makes the audit FAIL and the UI withhold the text', async ({ page }) => {
  const errs = [];
  await openApp(page, errs);
  const out = await page.evaluate((app) => {
    window.__almTextPerturb = { key: 'poolP', delta: 0.01 };
    try {
      const spec = window.AlmTextSpecs[app];
      const r = spec.results();
      const ctx = window.AlmText.context(app, spec);
      const rendered = window.AlmText.render(spec.templates, r, ctx);
      const audit = window.AlmText.audit(rendered, r, { ctx, dom: spec.dom() });
      const host = document.createElement('div');
      host.id = 'alm-text-planted';
      document.body.appendChild(host);
      window.AlmTextUI.mount(host, { app, text: spec });
      return { ok: audit.ok, passed: audit.passed, checks: audit.checks, failed: audit.failures.map(f => f.check) };
    } finally {
      delete window.__almTextPerturb;
    }
  }, APP);
  console.log(`TEXTAUDIT planted ${out.passed}/${out.checks} failed=${out.failed.join(',')}`);
  expect(out.ok).toBe(false);
  expect(out.failed).toContain('dom:poolP');
  const host = page.locator('#alm-text-planted');
  await expect(host.locator('.alm-text-status')).toContainText('Number audit failed');
  await expect(host.locator('.alm-text-body')).toBeHidden();
  // hook removed -> regenerate passes again
  await host.locator('.alm-text-regenerate').click();
  await expect(host.locator('.alm-text-body')).toBeVisible();
  expect(errs, 'no console errors').toEqual([]);
});

test('no results yet -> "Run the analysis first."', async ({ page }) => {
  const errs = [];
  await openApp(page, errs);
  await page.evaluate((app) => {
    const host = document.createElement('div');
    host.id = 'alm-text-empty';
    document.body.appendChild(host);
    window.AlmTextUI.mount(host, { app, text: { results: () => null, templates: window.AlmTextSpecs[app].templates } });
  }, APP);
  await expect(page.locator('#alm-text-empty .alm-text-status')).toHaveText('Run the analysis first.');
  await expect(page.locator('#alm-text-empty .alm-text-body')).toBeHidden();
  expect(errs, 'no console errors').toEqual([]);
});
