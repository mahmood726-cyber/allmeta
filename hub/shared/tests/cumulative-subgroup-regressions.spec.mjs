/**
 * cumulative-subgroup regression guards for the codex16 validation findings 3–7 (findings 1–2,
 * which need R, are in cumulative-subgroup-rexport-parity.spec.mjs). Each test fails on the
 * pre-fix page (v1.5.0, 8ac07a6) and passes after the fix.
 *
 *  3. Subgroup storage was a plain object: group names such as `__proto__` / `constructor`
 *     collided with Object.prototype and the pool threw (root cause: `const byGroup = {}`).
 *  4. Both plot builders ignored the mounted effect-axis min/max (root cause:
 *     buildCumulativeSvg / buildSubgroupSvg never read _axisState); the log toggle advertised
 *     an unsupported transform.
 *  5. The chart TruthCert receipt named "DL/PM" although only PM is offered.
 *  6. The CSV-upload bridge (window.__almLoad) ignored its own declared `estimate` / `SE`
 *     columns and re-split quoted fields.
 *  7. Subgroup estimate/CI text was drawn past the right edge of the SVG viewBox.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const APP = '/cumulative-subgroup/index.html';

async function ready(page) {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almLoad === 'function' && typeof window._almLastCumSub === 'function'
    && document.querySelector('#svg-host svg'), undefined, { timeout: 10_000 });
}

const STUDIES = [
  { est: -0.22, se: 0.14 }, { est: -0.30, se: 0.12 }, { est: -0.18, se: 0.10 },
  { est: -0.42, se: 0.15 }, { est: -0.38, se: 0.11 }, { est: -0.10, se: 0.08 },
].map(s => ({ ...s, v: s.se * s.se }));

test('fault 3: prototype-named subgroups pool like any other name', async ({ page }) => {
  await ready(page);
  const names = ['__proto__', 'constructor', 'toString'];
  const plain = ['G1', 'G2', 'G3'];
  const run = (labels) => page.evaluate(({ studies, labels }) => {
    const r = window.__almSubgroup(studies.map((s, i) => ({ ...s, group: labels[i % 3] })));
    return { groups: r.groups.map(g => ({ name: g.name, k: g.k, mu: g.mu, se: g.se, tau2: g.tau2 })), Q_bw: r.Q_bw, df_bw: r.df_bw };
  }, { studies: STUDIES, labels });
  const odd = await run(names);
  const ref = await run(plain);
  expect(odd.groups.map(g => g.name).sort()).toEqual([...names].sort());
  expect(odd.df_bw).toBe(2);
  for (let i = 0; i < 3; i++) {
    const a = odd.groups.find(g => g.name === names[i]), b = ref.groups.find(g => g.name === plain[i]);
    expect(a.k).toBe(2);
    expect(a.mu).toBeCloseTo(b.mu, 12);
    expect(a.se).toBeCloseTo(b.se, 12);
  }
  expect(odd.Q_bw).toBeCloseTo(ref.Q_bw, 12);
});

async function setAxis(page, min, max) {
  for (const [edge, v] of [['min', min], ['max', max]]) {
    await page.locator(`#alm-axis-mount input[data-edge="${edge}"]`).fill(String(v));
    await page.locator(`#alm-axis-mount input[data-edge="${edge}"]`).dispatchEvent('change');
  }
}
const tickTexts = (page) => page.locator('#svg-host svg text').allTextContents();

test('fault 4: effect-axis limits are applied in both views; log toggle is disabled', async ({ page }) => {
  await ready(page);
  // Default example: effects lie in roughly [-0.9, 0.1], so ±2 can only appear if the limits apply.
  const before = await tickTexts(page);
  expect(before).not.toContain('-2.00');
  await setAxis(page, -2, 2);
  const cum = await tickTexts(page);
  expect(cum, 'cumulative effect axis honours min').toContain('-2.00');
  expect(cum, 'cumulative effect axis honours max').toContain('2.00');
  await page.selectOption('#f-view', 'subgroup');
  await page.waitForFunction(() => window._almLastCumSub() && window._almLastCumSub().view === 'subgroup');
  const sub = await tickTexts(page);
  expect(sub, 'subgroup effect axis honours min').toContain('-2.00');
  expect(sub, 'subgroup effect axis honours max').toContain('2.00');
  await expect(page.locator('#alm-axis-mount input[data-edge="log"]')).toBeDisabled();
});

test('fault 5: chart receipt names only the PM estimator the page offers', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.AlmTruthCertExport = {
      buildReceipt: async (input) => { window.__receiptInput = input; return {}; },
      stampSVG: (svg) => svg,
    };
  });
  await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), page.click('#alm-chart-mount [data-fmt="svg"]')]);
  const method = await page.evaluate(() => window.__receiptInput && window.__receiptInput.method);
  expect(method).toMatch(/\bPM\b/);
  expect(method).not.toMatch(/\bDL\b/);
});

test('fault 6: CSV upload with the declared estimate/SE headers loads, quoted fields intact', async ({ page }) => {
  await ready(page);
  const csv = [
    'label,estimate,SE,year,group',
    '"Smith, J",-0.30,0.14,2010,"Low, risk"',
    'Jones,-0.45,0.12,2012,"Low, risk"',
    'Lee,-0.20,0.10,2014,High',
    'Doe,-0.55,0.16,2017,High',
  ].join('\n');
  await page.locator('#alm-csv-mount textarea').fill(csv);
  await page.click('#alm-csv-mount [data-action="parse-paste"]');
  await page.waitForFunction(() => { const r = window._almLastCumSub(); return r && r.k === 4; }, undefined, { timeout: 5_000 }).catch(() => {});
  const r = await page.evaluate(() => window._almLastCumSub());
  expect(r, 'uploaded rows produced a result').not.toBeNull();
  expect(r.k).toBe(4);
  expect(r.series.map(s => s.label)).toEqual(['Smith, J', 'Jones', 'Lee', 'Doe']);
  expect(r.series[0].mu).toBeCloseTo(-0.30, 12);
  await page.selectOption('#f-view', 'subgroup');
  await page.waitForFunction(() => window._almLastCumSub() && window._almLastCumSub().view === 'subgroup');
  expect(await tickTexts(page)).toContain('Low, risk (k=2)');
});

test('fault 7: subgroup estimate/CI text stays inside the SVG viewBox', async ({ page }) => {
  await ready(page);
  await page.selectOption('#f-view', 'subgroup');
  await page.waitForFunction(() => window._almLastCumSub() && window._almLastCumSub().view === 'subgroup');
  const out = await page.evaluate(() => {
    const svg = document.querySelector('#svg-host svg');
    const [, , w, h] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    return [...svg.querySelectorAll('text')].map(t => { const b = t.getBBox(); return { t: t.textContent, x0: b.x, x1: b.x + b.width, w, h }; })
      .filter(b => b.x0 < 0 || b.x1 > b.w);
  });
  expect(out, 'text overflowing the viewBox: ' + JSON.stringify(out)).toEqual([]);
});

/*
 * Fault 4b (introduced by the fault-4 fix): with only ONE effect-axis bound set past the other
 * AUTOMATIC limit (e.g. min above the data-driven max), buildCumulativeSvg/buildSubgroupSvg threw
 * "Effect axis maximum must exceed minimum" out of render(), leaving a stale plot and an uncaught
 * page error. Every one-sided / invalid state must now either apply the limit or refuse VISIBLY
 * (as gosh/index.html does), never throw. The page has one user axis (effect); it is the y axis of
 * the cumulative plot and the x axis of the subgroup plot, so both plot orientations are covered.
 */
const AXIS_CASES = [
  // [name, min, max, expectation]  min/max: undefined = leave untouched, '' = cleared
  ['min only', '-2', undefined, { ticks: ['-2.00'] }],
  ['max only', undefined, '2', { ticks: ['2.00'] }],
  ['min > automatic max', '5', undefined, { refused: true }],
  ['max < automatic min', undefined, '-5', { refused: true }],
  // The shared widget shows its own message and does not emit for min >= max; the page reads the
  // raw inputs itself, so it must ALSO refuse the plot.
  ['min == max', '1', '1', { widgetError: /min must be < max/, refused: true }],
  ['non-numeric', 'abc', 'xyz', { auto: true }],
  // A type=number input sanitises '1e999' (Infinity) to '', so it reaches the page as cleared;
  // the page's own non-finite refusal is defence in depth for programmatic state.
  ['non-finite', '1e999', undefined, { auto: true }],
  ['cleared', '', '', { auto: true, setFirst: ['-2', '2'] }],
];

async function setEdge(page, edge, raw) {
  await page.evaluate(([edge, raw]) => {
    const el = document.querySelector(`#alm-axis-mount input[data-edge="${edge}"]`);
    el.value = raw; // a type=number input sanitises non-numeric text to ''
    el.dispatchEvent(new Event('change'));
  }, [edge, raw]);
}

for (const view of ['cumulative', 'subgroup']) {
  for (const [name, min, max, want] of AXIS_CASES) {
    test(`fault 4b: ${view} plot, effect axis ${name}: applies or refuses visibly, never throws`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await ready(page);
      if (view === 'subgroup') {
        await page.selectOption('#f-view', 'subgroup');
        await page.waitForFunction(() => window._almLastCumSub() && window._almLastCumSub().view === 'subgroup');
      }
      const autoTicks = await tickTexts(page);
      if (want.setFirst) { await setEdge(page, 'min', want.setFirst[0]); await setEdge(page, 'max', want.setFirst[1]); }
      if (min !== undefined) await setEdge(page, 'min', min);
      if (max !== undefined) await setEdge(page, 'max', max);
      expect(errors, 'no uncaught page error').toEqual([]);
      const texts = await tickTexts(page);
      const refusal = page.locator('#svg-host', { hasText: 'Plot cannot be displayed' });
      if (want.refused) {
        await expect(refusal, 'plot area shows a refusal').toHaveCount(1);
        await expect(page.locator('#warn-banner')).toBeVisible();
        await expect(page.locator('#warn-banner')).toContainText('Effect axis');
        // Computed results are retained (only the plot is refused).
        expect(await page.evaluate(() => window._almLastCumSub())).not.toBeNull();
      } else {
        await expect(refusal).toHaveCount(0);
      }
      if (want.ticks) for (const t of want.ticks) expect(texts).toContain(t);
      if (want.auto) expect(texts, 'automatic limits restored').toEqual(autoTicks);
      if (want.widgetError) await expect(page.locator('#alm-axis-mount [data-error]')).toHaveText(want.widgetError);
    });
  }
}

/*
 * Fault 4c (Codex review P1 on 5f920fe): from VALID explicit limits [-2, 2], entering an equal or
 * reversed pair made the shared axis widget show "min must be < max" and return WITHOUT calling
 * onChange, so the page kept the old [-2, 2] plot on screen and still exported it. The page must
 * see the raw entered pair, replace the plot with a refusal, and refuse SVG / PNG / PDF export.
 * Controls: in the valid state every download path produces a file, including PDF via the
 * lazily loaded vendored jsPDF. Invalid axes must prevent every download.
 */
const DOWNLOADS = ['#btn-svg', '#btn-png', '#alm-chart-mount [data-fmt="svg"]', '#alm-chart-mount [data-fmt="png"]', '#alm-chart-mount [data-fmt="pdf"]'];

async function clickExpectDownload(page, sel, expected) {
  const pending = page.waitForEvent('download', { timeout: expected ? 10_000 : 2_000 }).catch(() => null);
  await page.click(sel);
  const download = await pending;
  if (download && sel.includes('"pdf"')) {
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(readFileSync(await download.path()).subarray(0, 5).toString()).toBe('%PDF-');
  }
  return Boolean(download) === expected;
}

for (const view of ['cumulative', 'subgroup']) {
  for (const [name, edge, raw] of [['equal [2, 2]', 'min', '2'], ['reversed [-2, -3]', 'max', '-3']]) {
    test(`fault 4c: ${view} plot, valid [-2, 2] then ${name}: refusal replaces plot, no stale export`, async ({ page }) => {
      // Five real downloads (including lazy-loaded PDF) plus five no-download windows.
      test.setTimeout(120000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await ready(page);
      if (view === 'subgroup') {
        await page.selectOption('#f-view', 'subgroup');
        await page.waitForFunction(() => window._almLastCumSub() && window._almLastCumSub().view === 'subgroup');
      }
      await setEdge(page, 'min', '-2');
      await setEdge(page, 'max', '2');
      const valid = await page.locator('#svg-host').innerHTML();
      expect(valid).not.toContain('data-axis-refusal');
      expect(await tickTexts(page)).toContain('-2.00');
      // Controls: every export path works in the valid state.
      for (const sel of DOWNLOADS) expect(await clickExpectDownload(page, sel, true), sel + ' downloads in the valid state').toBe(true);

      await setEdge(page, edge, raw);
      await expect(page.locator('#alm-axis-mount [data-error]')).toHaveText(/min must be < max/);
      const after = await page.locator('#svg-host').innerHTML();
      expect(after, 'old plot must not stay on screen').not.toBe(valid);
      await expect(page.locator('#svg-host svg[data-axis-refusal]'), 'refusal panel replaces the plot').toHaveCount(1);
      await expect(page.locator('#svg-host')).toContainText('Plot cannot be displayed');
      await expect(page.locator('#warn-banner')).toContainText('Effect axis');
      for (const sel of DOWNLOADS) expect(await clickExpectDownload(page, sel, false), sel + ' must not export a stale plot').toBe(true);
      expect(errors, 'no uncaught page error').toEqual([]);
    });
  }
}
