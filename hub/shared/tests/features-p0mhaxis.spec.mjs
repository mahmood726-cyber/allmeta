import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const url = '/mh-peto/index.html';
const out = new URL('./rchecks-out/p0mhaxis/', import.meta.url);
const data = 'A,12,100,20,100\nB,5,80,15,90\nC,2,50,5,60';
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6;
async function limits(page, lo, hi) {
  for (const [edge, value] of [['min', lo], ['max', hi]]) {
    const input = page.locator(`#alm-axis-mount [data-edge="${edge}"]`);
    await input.fill(value === null ? '' : String(value));
    await input.dispatchEvent('change');
  }
}
async function geometry(page) {
  return page.evaluate(() => {
    const svg = document.getElementById('forest');
    const axis = svg.querySelector('.forest-axis');
    return {
      result: window._almLastMhPeto(),
      ticks: Object.fromEntries([...svg.querySelectorAll('.forest-tick-label')].map(e => [e.textContent, +e.getAttribute('x')])),
      ref: +svg.querySelector('[stroke-dasharray]').getAttribute('x1'),
      left: +axis.getAttribute('x1'), right: +axis.getAttribute('x2'),
      label: svg.querySelector('.forest-axis-label').textContent,
      log_checked: Number(document.querySelector('#alm-axis-mount [data-edge="log"]').checked),
      diamonds: [...svg.querySelectorAll('polygon')].map(e => e.getAttribute('points').split(' ').map(p => +p.split(',')[0])),
    };
  });
}
function ratioOK(g) {
  return close(g.ticks['1'] - g.ticks['0.1'], g.ticks['10'] - g.ticks['1']) && close(g.ref, g.ticks['1']);
}
async function csv(name, rows) {
  await mkdir(out, { recursive: true });
  const fields = Object.keys(rows[0]);
  const quote = v => '"' + String(v).replaceAll('"', '""') + '"';
  await writeFile(new URL(name, out), [fields.join(','), ...rows.map(r => fields.map(k => quote(r[k])).join(','))].join('\n') + '\n');
}

for (const measure of ['OR', 'RR', 'RD']) {
  test(`${measure}: custom limits, null line, labels and page-produced R evidence`, async ({ page }) => {
    await page.goto(url);
    await page.locator('#src').fill(data);
    await page.selectOption('#measure', measure);
    await page.locator('#btn-run').click();
    const initial = await page.locator('#forest').innerHTML();
    const before = await page.evaluate(() => window._almLastMhPeto());
    const lo = measure === 'RD' ? -1 : 0.1, hi = measure === 'RD' ? 1 : 10;
    await limits(page, lo, hi);
    const g = await geometry(page);
    expect(g.result).toEqual(before);
    if (measure === 'RD') {
      expect(close(g.ref, g.ticks['0'])).toBe(true);
      expect(close(g.ticks['0'] - g.ticks['-0.5'], g.ticks['0.5'] - g.ticks['0'])).toBe(true);
    } else {
      expect(ratioOK(g)).toBe(true); // fails on the original unchecked log control
    }
    const toggle = page.locator('#alm-axis-mount [data-edge="log"]');
    await expect(toggle).toBeDisabled();
    expect(await toggle.isChecked()).toBe(measure !== 'RD');
    const rows = (measure === 'OR' ? ['mh', 'peto'] : ['mh']).map((method, i) => ({
      measure, method, est: g.result[method + '_est'], lo: g.result[method + '_lo'], hi: g.result[method + '_hi'],
      x_lo: g.diamonds[i][0], x_est: g.diamonds[i][1], x_hi: g.diamonds[i][2],
      xmin: lo, xmax: hi, left: g.left, right: g.right, ref_x: g.ref, label: g.label,
      log_checked: g.log_checked,
    }));
    // Export input as read back from the page, and estimates/coordinates from the page itself.
    const inputs = await page.locator('#src').inputValue();
    await csv(`${measure}-input.csv`, inputs.split('\n').map(line => {
      const [study, ai, n1i, ci, n2i] = line.split(',');
      return { study, ai, n1i, ci, n2i };
    }));
    await csv(`${measure}.csv`, rows);
    if (measure === 'OR') {
      const plant = { ...rows[0] };
      const span = hi - lo;
      plant.x_lo = g.left + (plant.lo - lo + span * 0.1) / (span * 1.2) * (g.right - g.left);
      await csv('planted-linear.csv', [plant]);
    }
    await limits(page, null, null);
    expect(await page.locator('#forest').innerHTML()).toBe(initial);
  });
}

test('nonpositive ratio limits refused; analysis remains usable; correction clears advisory', async ({ page }) => {
  await page.goto(url);
  const initial = await page.locator('#forest').innerHTML();
  const before = await page.evaluate(() => window._almLastMhPeto());
  for (const bad of [0, -1]) {
    await limits(page, bad, 10);
    await expect(page.locator('#axis-note')).toBeVisible();
    await expect(page.locator('#axis-note')).toContainText('positive');
    await expect(page.locator('#axis-note')).toContainText('Enter');
    expect(await page.locator('#forest').innerHTML()).toBe(initial);
    expect(await page.evaluate(() => window._almLastMhPeto())).toEqual(before);
  }
  await limits(page, 0.1, 10);
  await expect(page.locator('#axis-note')).toBeHidden();
  expect(ratioOK(await geometry(page))).toBe(true);
  // A previously valid negative RD bound must be revalidated when switching to OR.
  await page.selectOption('#measure', 'RD');
  await limits(page, -1, 1);
  await expect(page.locator('#axis-note')).toBeHidden();
  await page.selectOption('#measure', 'OR');
  await expect(page.locator('#axis-note')).toBeVisible();
  await limits(page, null, null);
  await expect(page.locator('#axis-note')).toBeHidden();
  expect(await page.locator('#forest').innerHTML()).toBe(initial);
});

test('same geometry oracle rejects a planted linear renderer', async ({ page }) => {
  const original = await readFile(new URL('../../../mh-peto/index.html', import.meta.url), 'utf8');
  const plant = original.replace("var logScale = measure !== 'RD';", 'var logScale = false;');
  expect(plant).not.toBe(original);
  await page.route('**/mh-peto/index.html', route => route.fulfill({ contentType: 'text/html', body: plant }));
  await page.goto(url);
  await limits(page, 0.1, 10);
  expect(ratioOK(await geometry(page))).toBe(false);
});

test('locked scale keeps legacy autosave keys and rejects mouse/keyboard activation', async ({ page }) => {
  await page.goto(url);
  const keys = ['alm-plot-1-format', 'alm-plot-1-physical-width', 'alm-plot-1-resolution',
    'idx:1', 'idx:10', 'idx:6', 'idx:7', 'idx:8', 'idx:9', 'measure', 'src'];
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('alm-autosave:mh-peto') || '{}').values || {});
  const triggerSave = () => page.locator('#src').dispatchEvent('input');
  const toggle = page.locator('#alm-axis-mount [data-edge="log"]');
  for (const measure of ['OR', 'RR', 'RD']) {
    await page.selectOption('#measure', measure);
    await triggerSave();
    await expect.poll(async () => Object.keys(await saved()).sort()).toEqual(keys);
    await expect.poll(async () => (await saved())['idx:8']).toBe(measure !== 'RD');
    await expect(toggle).toBeDisabled();
    // Native click exercises activation even though Playwright honours aria-disabled.
    await toggle.evaluate(el => el.click());
    expect(await toggle.isChecked()).toBe(measure !== 'RD');
    await toggle.focus();
    await page.keyboard.press('Space');
    expect(await toggle.isChecked()).toBe(measure !== 'RD');
    // Drafts can contain the opposite historical flag: rendering still follows the measure.
    await toggle.evaluate(el => {
      el.checked = !el.checked;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(await toggle.isChecked()).toBe(measure !== 'RD');
  }
  // Plant exactly the round-one defect; the same complete-key check must reject it.
  await toggle.evaluate(el => { el.disabled = true; });
  await triggerSave();
  await expect.poll(async () => Object.hasOwn(await saved(), 'idx:8')).toBe(false);
  expect(Object.keys(await saved()).sort()).not.toEqual(keys);
  await toggle.evaluate(el => { el.disabled = false; });
  await triggerSave();
  await expect.poll(async () => Object.keys(await saved()).sort()).toEqual(keys);
});
