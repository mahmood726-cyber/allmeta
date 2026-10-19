import {test, expect} from './validation-fixture.mjs';
import {readFile} from 'node:fs/promises';

async function calibratedTicks(page, bounds = {}) {
  const result = await page.evaluate(bounds => {
    const svg = document.querySelector('#plot');
    const rows = document.querySelector('#src').value.trim().split('\n').map(line => line.split(',').map(Number));
    const ranges = {
      x: [bounds.x?.[0] ?? Math.min(_almLastLimit().limit_est, ...rows.map(r => r[0])) - .1,
        bounds.x?.[1] ?? Math.max(_almLastLimit().limit_est, ...rows.map(r => r[0])) + .1],
      y: [bounds.y?.[0] ?? 0, bounds.y?.[1] ?? Math.max(...rows.map(r => r[1])) * 1.1]
    };
    return Object.entries(ranges).map(([axis, range]) => ({axis, range,
      ticks: [...svg.querySelectorAll(`[data-limit-axis="${axis}"]`)].map((n, i) => {
        const label = svg.querySelectorAll(`[data-limit-tick-label="${axis}"]`)[i];
        const p = n.getPointAtLength(0), box = label.getBBox(), style = getComputedStyle(label);
        return {x: p.x, y: p.y, text: label.textContent, exact: Number(n.querySelector('title').textContent),
          anchor: +label.getAttribute(axis), clipped: !!label.closest('[clip-path]'),
          box: {x: box.x, y: box.y, width: box.width, height: box.height},
          visible: style.display !== 'none' && style.visibility === 'visible' && +style.opacity > 0 && style.fill !== 'none'};
      })}));
  }, bounds);
  for (const {axis, range, ticks} of result) {
    expect(ticks.length, `${axis} tick count`).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(7);
    let previous = -Infinity, previousPosition = -Infinity;
    for (const tick of ticks) {
      const value = Number(tick.text), start = axis === 'x' ? 60 : 20, length = axis === 'x' ? 520 : 280;
      expect(value).toBeGreaterThan(previous);
      expect(value).toBeGreaterThanOrEqual(range[0]); expect(value).toBeLessThanOrEqual(range[1]);
      expect(tick.text).not.toMatch(/^-0(?:\.0*)?(?:e[+-]?\d+)?$/);
      expect(Math.abs(value - tick.exact)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(value)));
      expect(tick[axis]).toBeGreaterThan(previousPosition);
      expect(tick[axis]).toBeGreaterThanOrEqual(start); expect(tick[axis]).toBeLessThanOrEqual(start + length);
      expect(tick.anchor).toBeCloseTo(tick[axis], 5);
      const fraction = (value - range[0]) / (range[1] - range[0]);
      expect(tick[axis]).toBeCloseTo(start + fraction * length, 5);
      expect(tick.visible).toBe(true); expect(tick.clipped).toBe(false);
      expect(tick.box.width).toBeGreaterThan(0); expect(tick.box.height).toBeGreaterThan(0);
      expect(tick.box.x).toBeGreaterThanOrEqual(0); expect(tick.box.y).toBeGreaterThanOrEqual(0);
      expect(tick.box.x + tick.box.width).toBeLessThanOrEqual(600);
      expect(tick.box.y + tick.box.height).toBeLessThanOrEqual(340);
      previous = value; previousPosition = tick[axis];
    }
  }
  // SE increases down the page; default zero stays at the top.
  if (!bounds.y?.[0]) expect(result.find(r => r.axis === 'y').ticks[0].y).toBe(20);
}

test('main funnel has visible, calibrated ticks on both axes', async ({page}) => {
  await page.goto('/limit-ma/index.html');
  await calibratedTicks(page);
  await expect(page.locator('#plot circle')).toHaveCount(10);
  await expect(page.locator('#limit-range-note')).toBeEmpty();
});

test('axis overrides recalibrate ticks, preserve omission notice and recover', async ({page}) => {
  await page.goto('/limit-ma/index.html');
  const before = await page.locator('#plot').innerHTML();
  const bounds = {x: [.4, .6], y: [.05, .15]};
  for (const axis of ['x', 'y']) for (const [i, edge] of ['min', 'max'].entries()) {
    const control = page.locator(`#alm-axis-mount [data-axis="${axis}"][data-edge="${edge}"]`);
    await control.fill(String(bounds[axis][i])); await control.dispatchEvent('change');
  }
  await calibratedTicks(page, bounds);
  await expect(page.locator('#limit-range-note')).toContainText('not shown');
  await expect(page.locator('#limit-error')).toBeEmpty();
  for (const control of await page.locator('#alm-axis-mount [data-edge="min"], #alm-axis-mount [data-edge="max"]').all()) {
    await control.fill(''); await control.dispatchEvent('change');
  }
  await calibratedTicks(page);
  expect(await page.locator('#plot').innerHTML()).toBe(before);
});

test('SVG, PNG, PDF and TIFF exports include the tick-bearing SVG', async ({page}) => {
  await page.goto('/limit-ma/index.html');
  await calibratedTicks(page);
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    window.funnelExportSources = [];
    URL.createObjectURL = function (blob) {
      if (blob.type === 'image/svg+xml') window.funnelExportSources.push(blob.text());
      return original.call(this, blob);
    };
  });
  const displayed = await page.locator('#plot [data-limit-tick-label]').evaluateAll(nodes => nodes.map(n => ({axis: n.getAttribute('data-limit-tick-label'), text: n.textContent})));
  for (const format of ['svg', 'png', 'pdf', 'tiff']) {
    const panel = page.locator('#alm-plot-mount');
    await panel.getByLabel('Format', {exact: true}).selectOption(format);
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', {name: 'Download selected', exact: true}).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    const bytes = await readFile(await download.path());
    expect(bytes.length).toBeGreaterThan(100);
    if (format === 'png') expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    if (format === 'pdf') expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (format === 'tiff') expect([...bytes.subarray(0, 4)]).toEqual([73, 73, 42, 0]);
    const exported = await page.evaluate(async () => {
      const svg = new DOMParser().parseFromString(await window.funnelExportSources.at(-1), 'image/svg+xml');
      return [...svg.querySelectorAll('[data-limit-tick-label]')].map(n => ({axis: n.getAttribute('data-limit-tick-label'), text: n.textContent}));
    });
    expect(exported).toEqual(displayed);
    await expect(panel.getByRole('status')).toHaveText('Downloaded 1 file(s)');
  }
  expect(await page.evaluate(() => window.funnelExportSources.length)).toBe(4);
});
