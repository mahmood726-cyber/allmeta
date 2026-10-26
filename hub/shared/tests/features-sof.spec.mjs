import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readZip } from './zip-reader.mjs';

const rcheckRoot = new URL('./rchecks-out/', import.meta.url);
const rcheckOutput = new URL('sof/page.csv', rcheckRoot);

for (const app of ['mh-peto', 'meta-regression', 'pubbias-tests']) {
  test(`${app}: SoF keeps legacy draft keys and positions intact`, async ({ page }) => {
    const input = app === 'meta-regression' ? '#f-data' : '#src';
    const snapshot = () => page.evaluate(app => JSON.parse(localStorage.getItem('alm-autosave:' + app) || '{}').values || {}, app);
    const saveHost = () => page.locator(input).dispatchEvent('input');
    await page.route('**/shared/alm-sof.js', route => route.abort());
    await page.goto(`/${app}/index.html`);
    await saveHost();
    await expect.poll(async () => Object.keys(await snapshot()).length).toBeGreaterThan(0);
    const baseline = await snapshot();
    await page.evaluate(() => localStorage.clear());
    await page.unroute('**/shared/alm-sof.js');
    await page.reload();
    await expect(page.locator('#alm-sof')).toBeVisible();
    await saveHost();
    await expect.poll(snapshot).toEqual(baseline);
    await page.evaluate(() => localStorage.clear());
    await page.locator('#sof-outcome').fill('Mortality');
    await page.waitForTimeout(800); // legacy autosave debounce is 600 ms
    expect(await snapshot()).toEqual({});
    expect(await page.evaluate(app => JSON.parse(localStorage.getItem('alm-sof-v1:' + app)).outcome, app)).toBe('Mortality');
    // An unrelated app input remains in legacy autosave. This recreates the
    // original leak outside the exclusion and must fail the same snapshot gate.
    await page.evaluate(() => {
      const plant = document.createElement('textarea'); plant.id = 'planted-draft-input';
      document.body.appendChild(plant);
    });
    await saveHost();
    await expect.poll(async () => Object.keys(await snapshot())).toContain('planted-draft-input');
    const planted = await snapshot();
    expect(() => expect(planted).toEqual(baseline)).toThrow();
  });
}

test('SoF refresh preserves live-validation form values and corpus control locks', async ({ page }) => {
  await page.goto('/mh-peto/index.html');
  await expect(page.locator('#alm-sof [data-sof="effect"]')).not.toHaveText('Unavailable');
  await expect(page.locator('#sof-risk')).toHaveValue('');
  expect(await page.locator('#sof-risk').getAttribute('placeholder')).not.toBe('');
  await page.locator('#measure').selectOption('RD');
  await page.locator('#src').fill('A,0,100,0,100\nB,0,100,0,100');
  const inputs = await page.evaluate(() => {
    window.__mhValidation.run();
    window.__sofFormValues = () => [...document.querySelectorAll('input,select,textarea')].map(n => [n.id, n.value, n.checked]);
    return window.__sofFormValues();
  });
  await expect(page.locator('#alm-sof [data-sof="effect"]')).toContainText('0.000');
  expect(await page.evaluate(() => window.__sofFormValues())).toEqual(inputs);
  await page.locator('#sof-risk').evaluate(n => { n.value = '0.25'; });
  expect(await page.evaluate(() => window.__sofFormValues())).not.toEqual(inputs);

  await page.goto('/influence/index.html');
  await expect(page.locator('#alm-sof [data-export="CSV"]')).toBeEnabled();
  await page.evaluate(() => {
    window.__sofLock = [...document.querySelectorAll('textarea,input,select,button')]
      .filter(n => !n.closest('#alm-validate')).map(n => [n, n.disabled]);
    window.__sofLock.forEach(([n]) => { n.disabled = true; });
    window.__almRestore({ data: '0.1,0.1,A\n0.2,0.1,B\n0.3,0.1,C' });
  });
  await page.waitForTimeout(100); // drain SoF's scheduled refresh during the lock
  expect(await page.evaluate(() => window.__sofLock.every(([n]) => n.disabled))).toBe(true);
  await page.evaluate(() => window.__sofLock.forEach(([n, was]) => { n.disabled = was; }));
  await expect(page.locator('#alm-sof [data-export="CSV"]')).toBeEnabled();
  expect(await page.locator('#sof-outcome').isEnabled()).toBe(true);
});

test.beforeAll(() => {
  mkdirSync(new URL('sof/', rcheckRoot), { recursive: true });
  writeFileSync(new URL('.gitignore', rcheckRoot), '*\n', 'utf8');
  // A failed browser run must not leave a previous run's evidence for R.
  rmSync(rcheckOutput, { force: true });
});

for (const app of ['heterogeneity', 'mh-peto', 'proportion-ma']) {
  test(`${app}: displayed effect, manual certainty persistence and complete downloads`, async ({ page }) => {
    await page.goto(`/${app}/index.html`);
    const panel = page.locator('#alm-sof');
    await expect(panel.getByRole('heading', { name: 'Summary of findings' })).toBeVisible();
    await expect(panel.locator('[data-sof="effect"]')).not.toHaveText('Unavailable');
    const expected = await page.evaluate(app => {
      if (app === 'heterogeneity') return [...document.querySelectorAll('.stat')].find(e => e.querySelector('.k')?.textContent.includes('modified HK')).querySelector('.v').textContent;
      if (app === 'mh-peto') { const c = document.querySelector('#pooled-body tr').cells; return c[1].textContent + ' ' + c[2].textContent; }
      const c = document.querySelector('#res-body tr.pooled-row').cells; return c[2].textContent + ' [' + c[3].textContent + ']';
    }, app);
    await expect(panel.locator('[data-sof="effect"]')).toHaveText(expected);
    // Run the same equality gate against a deliberately corrupted SoF value.
    const gate = actual => expect(actual).toBe(expected);
    gate(await panel.locator('[data-sof="effect"]').textContent());
    expect(() => gate('planted wrong effect: ' + expected)).toThrow();
    await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('');
    await panel.getByLabel('Outcome', { exact: true }).fill('Mortality at 12 months');
    await panel.getByLabel('Certainty of evidence').selectOption('Low');
    await panel.getByLabel('Imprecision downgrade reason').fill('Wide interval');
    await page.reload();
    await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('Low');
    await expect(panel.getByLabel('Imprecision downgrade reason')).toHaveValue('Wide interval');
    for (const kind of ['CSV', 'DOCX']) {
      const pending = page.waitForEvent('download');
      await panel.getByRole('button', { name: `Export ${kind}`, exact: true }).click();
      const download = await pending;
      const bytes = readFileSync(await download.path());
      const content = kind === 'CSV' ? bytes.toString('utf8') : new TextDecoder().decode(readZip(bytes).find(e => e.name === 'word/document.xml').bytes);
      expect(content).toContain('Mortality at 12 months'); expect(content).toContain('Low'); expect(content).toContain('Wide interval'); expect(content).toContain('Guyatt');
      expect(content).toContain(expected);
      if (kind === 'DOCX') expect(content).toContain('<w:tbl>');
    }
    await page.evaluate(() => { window.__sofCopied = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async s => { window.__sofCopied = s; } } }); });
    await panel.getByRole('button', { name: 'Copy table', exact: true }).click();
    expect(await page.evaluate(() => window.__sofCopied)).toContain('Wide interval');
    if (app === 'mh-peto') {
      await expect(panel.locator('[data-sof="risk-source"]')).toContainText('median control-arm risk');
      await panel.getByLabel('Assumed comparator risk (proportion)').fill('0');
      await expect(panel.locator('[data-sof="absolute-note"]')).toContainText('strictly between 0 and 1');
      await panel.getByLabel('Assumed comparator risk (proportion)').fill('0.2');
      await expect(panel.locator('[data-sof="comparator"]')).toContainText('200');
      await page.locator('#measure').selectOption('RR');
      await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('Low');
      const effect = await page.locator('#pooled-body tr').first().locator('td').nth(1).textContent();
      await expect(panel.locator('[data-sof="effect"]')).toContainText(effect);
    } else {
      await expect(panel.getByLabel('Assumed comparator risk (proportion)')).toBeHidden();
      await expect(panel.getByRole('columnheader', { name: 'Risk with comparator', exact: true })).toHaveCount(0);
      if (app === 'proportion-ma') await expect(panel.locator('[data-sof="single-group"]')).toContainText('per 1,000');
    }
  });
}

async function waitForHostLayout(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // app-style.css animates main and its nested panels (including a delayed
    // second panel). Visibility/fonts alone can capture transient transforms.
    // Let finite animations finish naturally; do not change the host's CSS.
    await Promise.all(document.getAnimations()
      .filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime))
      .map(animation => animation.finished));
  });
}

test('SoF mounts beside shared features, outside archived results, without moving plots', async ({ page }) => {
  for (const app of ['heterogeneity', 'mh-peto', 'proportion-ma']) {
    // Delay only the new panel to record the original host geometry.
    await page.route('**/shared/alm-sof.js', route => route.abort());
    await page.goto(`/${app}/index.html`);
    await expect(page.locator('main')).toBeVisible();
    await waitForHostLayout(page);
    const geometry = () => page.evaluate(() => [...document.querySelectorAll('main, main svg, main canvas')].map(e => {
      const r = e.getBoundingClientRect();
      return [e.tagName, e.id, r.x + scrollX, r.y + scrollY, r.width, r.height];
    }));
    const before = await geometry();
    expect(before.length).toBeGreaterThan(1);
    await page.unroute('**/shared/alm-sof.js');
    await page.addScriptTag({ url: '/shared/alm-sof.js' });
    await page.evaluate(app => window.AlmSoF.mount(app), app);
    await expect(page.locator('#alm-sof h2')).toHaveText('Summary of findings');
    await page.waitForFunction(() => [...document.styleSheets].some(sheet => sheet.href?.endsWith('/shared/alm-sof.css')));
    await waitForHostLayout(page);
    await expect.poll(geometry).toEqual(before);
    // Keep exact coordinates, including fractions: a one-pixel displacement
    // must fail even after readiness has been corrected.
    const geometryGate = actual => expect(actual).toEqual(before);
    geometryGate(await geometry());
    const originalStyle = await page.evaluate(() => {
      const main = document.querySelector('main'), original = main.getAttribute('style');
      main.style.setProperty('transform', 'translateY(1px)', 'important');
      return original;
    });
    const moved = await geometry();
    expect(() => geometryGate(moved)).toThrow();
    await page.evaluate(original => {
      const main = document.querySelector('main');
      if (original === null) main.removeAttribute('style'); else main.setAttribute('style', original);
    }, originalStyle);
    await expect.poll(geometry).toEqual(before);
    const placement = () => page.evaluate(() => {
      const panel = document.querySelector('#alm-sof'), features = document.querySelector('#alm-features');
      return { outside: !panel.closest('main'), beside: features ? features.nextElementSibling === panel : panel.parentElement === document.body };
    });
    const gate = actual => expect(actual).toEqual({ outside: true, beside: true });
    gate(await placement());
    // Plant the old placement bug and prove the same gate rejects it.
    await page.evaluate(() => document.querySelector('main').appendChild(document.querySelector('#alm-sof')));
    const planted = await placement();
    expect(() => gate(planted)).toThrow();
  }
});

test('R witness: page absolute effects, CI bounds, rounding and refusals across the ACR grid', async ({ page }) => {
  await page.goto('/mh-peto/index.html');
  const panel = page.locator('#alm-sof');
  await expect(panel.locator('[data-sof="effect"]')).not.toHaveText('Unavailable');
  const rows = [];
  for (const measure of ['OR', 'RR']) {
    await page.locator('#measure').selectOption(measure);
    await page.locator('#btn-run').click();
    await expect.poll(() => page.evaluate(() => window.AlmSoF.readResult('mh-peto')?.measure)).toBe(measure);
    await expect(panel.locator('[data-sof="effect"]')).not.toHaveText('Unavailable');
    rows.push(...await page.evaluate(() => {
      const panel = document.querySelector('#alm-sof'), input = panel.querySelector('#sof-risk');
      const result = window.AlmSoF.readResult('mh-peto');
      const own = window._almLastMhPeto();
      if ([result.estimate, result.lower, result.upper].some((v, i) => v !== [own.mh_est, own.mh_lo, own.mh_hi][i])) throw Error('SoF changed the host effect or CI');
      const capture = (source, case_id, r, acr) => {
        input.value = String(acr);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        if (!panel.hasAttribute('data-sof-absolute')) throw Error('Missing full-precision rendered calculation');
        const a = JSON.parse(panel.dataset.sofAbsolute);
        const text = key => panel.querySelector(`[data-sof="${key}"]`).textContent;
        const cells = document.querySelector('#pooled-body tr').cells;
        const effect_display = text('effect'), host_display = cells[1].textContent + ' ' + cells[2].textContent;
        if (effect_display !== host_display) throw Error('SoF differs from the displayed host effect');
        return { source, case_id, measure: r.measure, acr, estimate: r.estimate, lower: r.lower, upper: r.upper,
          status: a ? 'ok' : 'refused', comparator: a ? a.comparator * 1000 : '',
          intervention: a ? a.intervention * 1000 : '', ci_lower: a ? a.lower * 1000 : '', ci_upper: a ? a.upper * 1000 : '',
          difference: a ? a.difference : '', difference_lower: a ? a.differenceLower : '', difference_upper: a ? a.differenceUpper : '',
          display_comparator: text('comparator'), display_intervention: text('intervention'), display_difference: text('difference'),
          note: text('absolute-note'), certainty: text('certainty'), effect_display, host_display };
      };
      // Reuse only DOM capture, not a formula or an expected answer, for the
      // explicitly labelled synthetic grid below. The real examples run first.
      window.__sofCaptureForR = capture;
      return Array.from({ length: 101 }, (_, i) => capture('live-example', 'example', result, i / 100));
    }));
  }
  rows.push(...await page.evaluate(() => {
    // Test fixtures exercise conversions, including HR (not an MH estimator).
    // No app engine or dataset is edited; only this disposable browser's cached
    // result accessor is replaced, and restored immediately after capture.
    const original = window._almLastMhPeto, cells = document.querySelector('#pooled-body tr').cells;
    const oldDisplay = [cells[1].textContent, cells[2].textContent];
    const fixtures = [[.25, .125, .375], [.5, .25, .75], [.8, .4, 1.2], [1, 1, 1], [1.25, .625, 1.875], [2, 1, 3], [4, 2, 6]];
    const collected = [];
    try {
      for (const measure of ['RR', 'OR', 'HR']) for (const [i, [estimate, lower, upper]] of fixtures.entries()) {
        window._almLastMhPeto = () => ({ ...original(), measure, mh_est: estimate, mh_lo: lower, mh_hi: upper });
        cells[1].textContent = String(estimate); cells[2].textContent = `[${lower}, ${upper}]`;
        const result = window.AlmSoF.readResult('mh-peto');
        for (let j = 0; j <= 100; j++) collected.push(window.__sofCaptureForR('formula-fixture', `grid-${i + 1}`, result, j / 100));
      }
    } finally {
      window._almLastMhPeto = original;
      [cells[1].textContent, cells[2].textContent] = oldDisplay;
      delete window.__sofCaptureForR;
      document.querySelector('#sof-risk').dispatchEvent(new Event('input', { bubbles: true }));
    }
    return collected;
  }));
  expect(rows).toHaveLength((2 + 3 * 7) * 101);
  for (const row of rows) {
    expect(row.certainty).toBe('Not selected');
    if (row.acr === 0 || row.acr === 1) {
      expect(row.status).toBe('refused');
      expect(row.note).toContain('strictly between 0 and 1');
    }
  }
  const fields = Object.keys(rows[0]);
  const cell = value => '"' + String(value).replaceAll('"', '""') + '"';
  // Written only after the complete live-page capture succeeds. R owns all
  // independent expected calculations and the OR-as-RR planted defect.
  writeFileSync(rcheckOutput, [fields.join(','), ...rows.map(row => fields.map(k => cell(row[k])).join(','))].join('\n') + '\n', 'utf8');
});
test('changed or invalid input cannot export stale findings', async ({ page }) => {
  await page.goto('/mh-peto/index.html');
  await expect(page.locator('#alm-sof [data-sof="effect"]')).not.toHaveText('Unavailable');
  await page.locator('#src').fill('bad data');
  await expect(page.locator('#alm-sof').getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  await expect(page.locator('#alm-sof')).toHaveAttribute('data-sof-absolute', 'null');
  await page.locator('#btn-run').click();
  await expect(page.locator('#alm-sof [data-sof="effect"]')).toHaveText('Unavailable');
  await page.locator('#btn-example').click();
  await expect(page.locator('#alm-sof').getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  await page.locator('#sof-risk').fill('0.2');
  await expect(page.locator('#alm-sof')).not.toHaveAttribute('data-sof-absolute', 'null');
});

test('meta-regression uses the main app result at full precision and retains its display', async ({ page }) => {
  await page.goto('/meta-regression/index.html');
  const panel = page.locator('#alm-sof');
  await expect(panel.locator('[data-sof="effect"]')).not.toHaveText('Unavailable');
  const values = await page.evaluate(() => {
    const own = window.__almResults();
    const sof = window.AlmSoF.readResult('meta-regression');
    const display = [...document.querySelectorAll('.stat')].find(e => e.querySelector('.k')?.textContent.includes('intercept')).querySelector('.v').textContent;
    return { own: [own.intercept, own.intercept_ci_lb, own.intercept_ci_ub], sof: [sof.estimate, sof.lower, sof.upper], display };
  });
  expect(values.sof).toEqual(values.own);
  await expect(panel.locator('[data-sof="effect"]')).toHaveText(values.display);
  await panel.getByLabel('Certainty of evidence').selectOption('Moderate');
  // Isolate the near-zero boundary through the host's result accessor. The
  // table continues to use the host's displayed string; the hint needs precision.
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.stat')].find(e => e.querySelector('.k')?.textContent.includes('intercept'));
    card.querySelector('.v').textContent = '0.100 [0.000, 0.200]';
    const own = window.__almResults();
    window.__almResults = () => ({ ...own, intercept: .1001, intercept_ci_lb: .0004, intercept_ci_ub: .1998 });
  });
  await expect(panel.locator('[data-sof="effect"]')).toHaveText('0.100 [0.000, 0.200]');
  await expect(panel.locator('[data-sof="hint"]')).toHaveText('');
  // Planted loss of precision must change the hint; certainty stays user-owned.
  await page.evaluate(() => {
    const own = window.__almResults();
    window.__almResults = () => ({ ...own, intercept_ci_lb: 0 });
    document.querySelector('#sof-outcome').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(panel.locator('[data-sof="hint"]')).toContainText('CI includes no effect');
  await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('Moderate');
});

test('influence preserves full-model displayed precision when exclusions are selected', async ({ page }) => {
  await page.goto('/influence/index.html');
  const panel = page.locator('#alm-sof');
  await expect(panel.locator('[data-sof="effect"]')).not.toHaveText('Unavailable');
  const expected = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#model-body tr')];
    const cell = label => rows.find(r => r.cells[0].textContent === label).cells[1].textContent;
    return cell('Pooled estimate') + ' [' + cell('95% CI lower') + ', ' + cell('95% CI upper') + ']';
  });
  await expect(panel.locator('[data-sof="effect"]')).toHaveText(expected);
  await panel.getByLabel('Certainty of evidence').selectOption('Low');
  // Both the excluded-model and change columns use excl-col. Check the full
  // set and each header explicitly; visibility assertions require one element.
  const exclusionHeaders = page.locator('#model-summary thead th.excl-col');
  await expect(exclusionHeaders).toHaveCount(2);
  await expect(exclusionHeaders).toHaveText(['After exclusion', 'Change']);
  await expect(exclusionHeaders.nth(0)).toBeHidden();
  await expect(exclusionHeaders.nth(1)).toBeHidden();
  await page.locator('#body input[type="checkbox"]').first().check();
  await expect(exclusionHeaders).toHaveText(['Excluding 1 study', 'Change']);
  await expect(exclusionHeaders.nth(0)).toBeVisible();
  await expect(exclusionHeaders.nth(1)).toBeVisible();
  await expect(panel.locator('[data-sof="effect"]')).toHaveText(expected);
  await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('Low');
  const values = await page.evaluate(() => {
    const full = window._almLastInfluence(), sof = window.AlmSoF.readResult('influence');
    return { full: [full.mu, full.ciLo, full.ciHi], sof: [sof.estimate, sof.lower, sof.upper] };
  });
  expect(values.sof).toEqual(values.full);
  const gate = actual => expect(actual).toBe(expected);
  expect(() => gate('planted exclusion result')).toThrow();
  await page.locator('#body input[type="checkbox"]').first().uncheck();
  await expect(exclusionHeaders).toHaveText(['After exclusion', 'Change']);
  await expect(exclusionHeaders.nth(0)).toBeHidden();
  await expect(exclusionHeaders.nth(1)).toBeHidden();
  await expect(panel.locator('[data-sof="effect"]')).toHaveText(expected);
  await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('Low');
});
