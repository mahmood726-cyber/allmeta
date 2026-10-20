/**
 * cumulative-subgroup: the cumulative plot's texts never overlap and are never clipped (paper 14, Fig 1B).
 *
 * Before the fix, buildCumulativeSvg drew every per-step study label ("+ Trial A (2015)") in the left
 * margin at x = L-8, the column that also holds the effect-axis tick numbers, and put the rotated
 * effect-axis title at L-44 inside that column; with the nine-trial built-in example they already
 * collided, and at k = 100 the labels collided with each other. The fix moves the labels into a
 * one-row-per-step key below the chart, numbers the step axis, and puts the axis title left of the
 * widest tick number.
 *
 * Requirement (rendered geometry, screen-space bounding boxes, so the title's rotation is included):
 * for the built-in example and for k in {2, 9, 30, 100}, no two texts of the plot overlap and none
 * extends outside the SVG. The detector does NOT depend on class names, so the same spec runs
 * unchanged against the pre-fix page, where it must fail on the overlap assertion itself.
 * Negative controls show the detector reports a planted overlap and a planted clip.
 *
 * The synthetic studies are LAYOUT FIXTURES (labels, years and effects chosen to stress label length,
 * missing years and both effect signs); they are not research data.
 */
import { test, expect } from '@playwright/test';

const APP = '/cumulative-subgroup/index.html';

function fixtureCsv(k) {
  const rows = [];
  for (let i = 1; i <= k; i++) {
    const label = i % 7 === 0 ? `Long-named multicentre randomised controlled trial number ${i}` : `Study ${i}`;
    const est = ((i % 5) - 2) * 0.35 + (i % 2 ? 0.12 : -0.08);
    const se = 0.08 + (i % 4) * 0.05;
    const year = i % 6 === 0 ? '' : String(1990 + (i % 30));
    rows.push(`${label}, ${est.toFixed(3)}, ${se.toFixed(3)}, ${year}`);
  }
  return rows.join('\n');
}

async function openPage(page) {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastCumSub === 'function' && document.querySelector('#svg-host svg'));
}

async function renderCumulative(page, k) {
  await openPage(page);
  await page.selectOption('#f-view', 'cumulative');
  await page.locator('#f-data').fill(fixtureCsv(k));
  await page.locator('#f-data').dispatchEvent('input');
  await page.waitForFunction(n => {
    const r = window._almLastCumSub();
    const labels = [...document.querySelectorAll('#svg-host svg text')].filter(t => t.textContent.startsWith('+ ')).length;
    return r && r.view === 'cumulative' && r.k === n && labels >= Math.min(n, 300);
  }, k);
}

// Every pair of overlapping texts (screen-space boxes) and every text outside the SVG box.
function detect() {
  const svg = document.querySelector('#svg-host svg'), box = svg.getBoundingClientRect();
  const kind = el => {
    const s = el.textContent;
    if (s.startsWith('+ ')) return 'study-label';
    if (el.hasAttribute('transform')) return 'rotated-title';
    return el.getAttribute('class') || 'text';
  };
  const texts = [...svg.querySelectorAll('text')].map((el, i) => {
    const r = el.getBoundingClientRect();
    return { i, kind: kind(el), text: el.textContent, x0: r.left, x1: r.right, y0: r.top, y1: r.bottom };
  });
  const EPS = 0.01, overlaps = [], clipped = [];
  for (let a = 0; a < texts.length; a++) {
    const A = texts[a];
    if (A.x0 < box.left - EPS || A.x1 > box.right + EPS || A.y0 < box.top - EPS || A.y1 > box.bottom + EPS) clipped.push(`${A.kind} "${A.text}"`);
    for (let b = a + 1; b < texts.length; b++) {
      const B = texts[b];
      if (Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > EPS && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > EPS)
        overlaps.push(`${A.kind} "${A.text}" x ${B.kind} "${B.text}"`);
    }
  }
  return { n: texts.length, labels: texts.filter(t => t.kind === 'study-label').length, more: texts.filter(t => t.text.startsWith('… and ')).map(t => t.text),
    height: Number(svg.getAttribute('viewBox').split(' ')[3]), overlaps, clipped };
}

test('built-in example (k = 9, as loaded): plot texts do not overlap or clip', async ({ page }) => {
  await openPage(page);
  await page.waitForFunction(() => { const r = window._almLastCumSub(); return r && r.view === 'cumulative' && r.k === 9; });
  const r = await page.evaluate(detect);
  expect(r.labels).toBe(9);
  expect(r.overlaps, 'overlapping texts').toEqual([]);
  expect(r.clipped, 'texts outside the SVG').toEqual([]);
});

for (const k of [2, 9, 30, 100]) {
  test(`synthetic k = ${k}: plot texts do not overlap or clip`, async ({ page }) => {
    await renderCumulative(page, k);
    const r = await page.evaluate(detect);
    expect(r.labels).toBe(k);
    expect(r.overlaps, 'overlapping texts').toEqual([]);
    expect(r.clipped, 'texts outside the SVG').toEqual([]);
  });
}

test('negative control: a study label moved onto an effect tick number is reported as an overlap', async ({ page }) => {
  await renderCumulative(page, 9);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('#svg-host svg text')];
    const tick = t.find(e => /^-?\d+\.\d\d$/.test(e.textContent) && e.getAttribute('text-anchor') === 'end');
    const label = t.find(e => e.textContent.startsWith('+ '));
    for (const a of ['x', 'y', 'text-anchor']) label.setAttribute(a, tick.getAttribute(a));
  });
  const r = await page.evaluate(detect);
  expect(r.overlaps.some(o => o.startsWith('study-label') || o.includes('x study-label')), JSON.stringify(r.overlaps)).toBe(true);
});

test('negative control: the pre-fix label and axis-title placement is reported as overlapping (k = 9)', async ({ page }) => {
  await renderCumulative(page, 9);
  await page.evaluate(() => {
    // Pre-fix rule: W=720, H=520, L=180, B=70, T=60 with a title else 40; label y = T + plotH*step/k + 2; title at L-44.
    const svg = document.querySelector('#svg-host svg'), L = 180, T = document.getElementById('f-title').value ? 60 : 40, plotH = 520 - T - 70;
    const labels = [...svg.querySelectorAll('text')].filter(e => e.textContent.startsWith('+ ')), k = labels.length;
    labels.forEach((el, j) => { el.setAttribute('x', String(L - 8)); el.setAttribute('y', String(T + plotH * ((j + 1) / k) + 2)); el.setAttribute('text-anchor', 'end'); });
    const title = [...svg.querySelectorAll('text')].find(e => e.textContent === 'Pooled effect (95% CI)');
    title.setAttribute('transform', `translate(${L - 44},${T + plotH / 2}) rotate(-90)`);
  });
  const r = await page.evaluate(detect);
  expect(r.overlaps.some(o => o.includes('study-label') && /x (text|cum-tick) "-?\d|^(text|cum-tick) "-?\d/.test(o)), JSON.stringify(r.overlaps)).toBe(true);
  expect(r.overlaps.some(o => o.includes('study-label') && o.includes('rotated-title')), JSON.stringify(r.overlaps)).toBe(true);
});

test('negative control: a study label pushed past the right edge is reported as clipped', async ({ page }) => {
  await renderCumulative(page, 9);
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('#svg-host svg text')].find(e => e.textContent.startsWith('+ '));
    label.setAttribute('x', '715'); label.setAttribute('text-anchor', 'start');
  });
  const r = await page.evaluate(detect);
  expect(r.clipped.some(c => c.startsWith('study-label')), JSON.stringify(r.clipped)).toBe(true);
});

// Above 300 steps the key lists the first 300 and then one row naming the rest, so the SVG height is bounded
// (k = 400: 4,440 units; uncapped it would be 5,727) and PNG export (a 2x canvas) stays inside browser canvas
// limits at any k. Uncapped, the SVG grows by 13 units per step; Chromium/Edge canvases are limited to 65,535 px
// per side, so the page's 2x PNG fails from k ~ 2,480 and the shared chart-download PNG (scale 2 x devicePixelRatio)
// fails from k ~ 1,220 on a dpr-2 screen. The last test shows, in this browser, that such a canvas yields no PNG.
test('k = 400: the key lists 300 steps plus one "more" row, nothing overlaps or clips, and both PNG exports work', async ({ page }) => {
  test.setTimeout(600_000);
  await renderCumulative(page, 400);
  const r = await page.evaluate(detect);
  expect(r.labels).toBe(300);
  expect(r.more).toEqual(['… and 100 more steps (all steps are in the results export)']);
  expect(r.height).toBeLessThan(4500);
  expect(r.overlaps, 'overlapping texts').toEqual([]);
  expect(r.clipped, 'texts outside the SVG').toEqual([]);
  for (const sel of ['#btn-png', '#alm-chart-mount [data-fmt="png"]']) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click(sel)]);
    const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
    const buf = Buffer.concat(chunks);
    expect(buf.length, sel).toBeGreaterThan(1000);
    expect(buf.subarray(1, 4).toString(), sel).toBe('PNG');
  }
});

test('browser canvas limit: the 2x export canvas of an uncapped k = 2600 plot yields no PNG; the capped one does', async ({ page }) => {
  await openPage(page);
  const res = await page.evaluate(async () => {
    const H = rows => 526 + (rows - 1) * 13 + 14;           // page key geometry (CUM_KEY_TOP, CUM_KEY_ROW)
    const blob = (w, h) => new Promise(ok => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); if (x) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); } c.toBlob(b => ok(b ? b.size : 0), 'image/png'); });
    return { uncapped: await blob(1440, 2 * H(2600)), capped: await blob(1440, 2 * H(301)) };
  });
  expect(res.uncapped, 'uncapped canvas').toBe(0);
  expect(res.capped, 'capped canvas').toBeGreaterThan(0);
});
