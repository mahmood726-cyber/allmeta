// Diagnostic catalogue crawl. Observations are NOT assertions that every plot is valid.
// Run from tests/playwright with an HTTP server at ALM_BASE_URL (default :8080).
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const base = process.env.ALM_BASE_URL || 'http://127.0.0.1:8080';
const ctx = { window: {} };
vm.runInNewContext(await fs.readFile('../../hub/projects.js', 'utf8'), ctx);
const apps = ctx.window.HTML_APPS_PROJECTS;
const out = 'artifacts/catalog-plots';
await fs.mkdir(out, { recursive: true });
const observations = [];
const browser = await chromium.launch();
function snapshot() {
  const visible = e => !!(e.getBoundingClientRect().width && e.getBoundingClientRect().height) && getComputedStyle(e).visibility !== 'hidden';
  const box = e => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height });
  const svgs = [...document.querySelectorAll('svg')].filter(e => visible(e) && box(e).w > 100 && box(e).h > 50).map(e => ({ id: e.id, parent: e.parentElement.id, cls: e.getAttribute('class'), ...box(e), marks: e.querySelectorAll('path,circle,rect,line,polyline,polygon').length, text: e.textContent.slice(0, 160) }));
  const canvases = [...document.querySelectorAll('canvas')].map(e => {
    let colors = null;
    try { const c = e.getContext('2d'); if (c) { const a = c.getImageData(0, 0, e.width, e.height).data; const values = new Set(); const step = Math.max(4, Math.floor(a.length / 4000 / 4) * 4); for (let i = 0; i < a.length; i += step) values.add(a[i] + ',' + a[i+1] + ',' + a[i+2] + ',' + a[i+3]); colors = values.size; } } catch {}
    return { id: e.id, visible: visible(e), width: e.width, height: e.height, ...box(e), colors };
  });
  const plots = [...document.querySelectorAll('div[id]')].filter(e => /(?:plot|chart|forest|funnel|sroc)[-_]?(?:host|mount|container)?$/i.test(e.id) && !e.id.startsWith('alm-')).map(e => ({ id: e.id, visible: visible(e), graphics: e.querySelectorAll('svg,canvas').length, text: e.textContent.slice(0, 180), data: e.data?.length || 0, ...box(e) }));
  const tabs = [...document.querySelectorAll('[role="tab"],.tab-btn,.tab-button,[data-tab]')].map(e => ({ id: e.id, text: e.textContent.trim().slice(0, 60), tab: e.dataset.tab, onclick: e.getAttribute('onclick'), visible: visible(e) }));
  return { svgs, canvases, plots, tabs, alerts: [...document.querySelectorAll('[role="alert"],.error,.error-message')].filter(visible).map(e => e.textContent.slice(0, 250)), body: document.body.innerText.slice(-1800) };
}
async function probe(app, width) {
  const r = { name: app.name, path: app.path, width, errors: [], missing: [], actions: [], dialogs: [] };
  if (/^https?:/.test(app.path)) { r.skipped = 'External repository: separate browser check required'; observations.push(r); return; }
  if (/^\.\/(r-shiny|webr-)/.test(app.path)) { r.skipped = 'R/WebAssembly: needs a dedicated runtime test, not this short crawl'; observations.push(r); return; }
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  page.on('pageerror', e => r.errors.push(e.stack || e.message));
  page.on('dialog', async d => { r.dialogs.push(d.message()); await d.dismiss(); });
  page.on('response', res => { if (res.status() >= 400) r.missing.push({ url: res.url(), status: res.status() }); });
  try {
    await page.goto(new URL(app.path, base + '/').href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(300);
    r.url = page.url(); r.initial = await page.evaluate(snapshot);
    for (const sel of ['#btn-example', '#loadSample', 'button:has-text("Load Sample")', '#btn-demo', '#loadDemoBtn']) {
      const loc = page.locator(sel).first();
      if (await loc.count() && await loc.isVisible() && await loc.isEnabled()) {
        try { await loc.click({ timeout: 2000 }); r.actions.push(sel); await page.waitForTimeout(200); } catch (e) { r.actions.push('FAILED ' + sel + ': ' + e.message.split('\n')[0]); }
        break;
      }
    }
    for (const sel of ['#btn-run', '#runAnalysisBtn', '#runAnalysis', '#run', 'button:has-text("Run IPD Meta-Analysis")']) {
      const loc = page.locator(sel).first();
      if (await loc.count() && await loc.isVisible() && await loc.isEnabled()) {
        try { await loc.click({ timeout: 2000 }); r.actions.push(sel); await page.waitForTimeout(800); } catch (e) { r.actions.push('FAILED ' + sel + ': ' + e.message.split('\n')[0]); }
        break;
      }
    }
    r.after = await page.evaluate(snapshot);
    const slug = app.path.replace(/[^a-z0-9]+/gi, '-');
    if (r.errors.length || r.after.canvases.some(e => e.visible && (e.colors === 1 || !e.w || !e.h))) await page.screenshot({ path: out + '/' + slug + '-' + width + '.png', fullPage: false });
  } catch (e) { r.fatal = e.message; }
  finally { await context.close(); }
  observations.push(r);
  console.log(JSON.stringify({ name: r.name, width, errors: r.errors, missing: r.missing, actions: r.actions, fatal: r.fatal, svg: r.after?.svgs.length, canvas: r.after?.canvases }));
  await fs.writeFile(out + '/observations.json', JSON.stringify(observations, null, 2));
}
// A fresh context per app prevents another app's stored data concealing a defect.
for (const width of [1280, 390]) {
  for (let i = 0; i < apps.length; i += 4) await Promise.all(apps.slice(i, i + 4).map(a => probe(a, width)));
}
await browser.close();
await fs.writeFile(out + '/observations.json', JSON.stringify(observations, null, 2));
console.log('CATALOGUE PROBE COMPLETE: ' + observations.length + ' observations, including explicit skips.');
