// pubbias-tests #alm-plus: PET-PEESE, conditional choice, one-click leave-one-out, base-row identity,
// "Validate the extras in R" offline replay (positives and planted negatives) and live webR (@slow).
import { test, expect } from './validation-fixture.mjs';
import { readFileSync } from 'node:fs';
const root = new URL('../../../pubbias-tests/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('validate/MANIFEST-plus.json', root), 'utf8'));
const corpus = JSON.parse(readFileSync(new URL('validate/corpus/corpus.json', root), 'utf8'));
const URL_ = '/pubbias-tests/index.html';
// pc2 is shared; browser start-up alone can exceed the default 30 s under load.
test.describe.configure({ timeout: 180000 });

test('one-click worked example: PET-PEESE, 13 omissions, identity with the main table, keyboard', async ({ page }) => {
  await page.goto(URL_);
  await page.locator('#plus-example').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#plus-status')).toContainText('Leave-one-out complete: 13 omissions');
  await expect(page.locator('#format')).toHaveValue('binary');
  await expect(page.locator('#plus-pp-body tr')).toHaveCount(3);
  await expect(page.locator('#plus-loo-body tr')).toHaveCount(14);
  await expect(page.locator('#plus-loo-head th')).toHaveCount(16); // omitted + 14 quantities + flags
  await expect(page.locator('#plus-identity')).toHaveAttribute('data-plus-identity', 'match');
  await expect(page.locator('[data-plus-branch="full.conditional.branch"]')).toHaveCount(1);
  // Independent read of the main results table (3 decimals) against the plus base row.
  const cmp = await page.evaluate(() => {
    const s = AlmPubbiasPlusUI.snapshot().result.loo.values.rows[0], cells = {};
    for (const tr of document.querySelectorAll('#body tr')) cells[tr.cells[0].textContent] = [...tr.cells].map(c => c.textContent);
    return [[cells['Egger (generic)'][1], s.egger.values.statistic.toFixed(3)], [cells['Egger (generic)'][2], s.egger.values.p.toFixed(3)],
      [cells['Begg-Mazumdar'][1], s.begg.values.tau.toFixed(3)], [cells['Peters (binary)'][1], s.peters.values.statistic.toFixed(3)],
      [cells['Harbord (binary)'][2], s.harbord.values.p.toFixed(3)], [cells['Trim-and-fill'][1], 'k0=' + s.trimfill.values.k0]];
  });
  for (const [shown, plus] of cmp) expect(shown).toBe(plus);
  // Filter to flagged rows and back, via the keyboard.
  await page.locator('#plus-only-flagged').focus(); await page.keyboard.press('Space');
  const visible = await page.locator('#plus-loo-body tr:not([hidden])').count();
  const flagged = await page.locator('#plus-loo-body tr[data-flagged="true"]').count();
  expect(visible).toBe(flagged + 1);
  await page.keyboard.press('Space');
  await expect(page.locator('#plus-loo-body tr:not([hidden])')).toHaveCount(14);
  const csv = await page.evaluate(() => AlmPubbiasPlusUI.csv());
  expect(csv.trim().split('\n')).toHaveLength(15);
  expect(csv.split('\n')[0]).toBe('omitted,egger_statistic,egger_p,egger_limit,peese_est,conditional_branch,begg_tau,begg_p,trimfill_k0,trimfill_side,trimfill_est,peters_statistic,peters_p,harbord_statistic,harbord_p,flags');
});

test('hero BCG example loads all 13 studies as effect and SE', async ({ page }) => {
  await page.goto(URL_);
  await page.locator('[data-alm-hero]').selectOption('bcg');
  const r = await page.evaluate(() => ({ fmt: document.getElementById('format').value, parsed: window.__almPubBiasEngine.parseTESE(document.getElementById('src').value).length, k: window._almLastPubbias().k }));
  expect(r).toEqual({ fmt: 'te-se', parsed: 13, k: 13 });
});

test('base-row identity: plus full-data row equals the main table on every corpus configuration with 5 <= k <= 100', async ({ page }) => {
  test.setTimeout(600000);
  await page.goto(URL_);
  const configs = corpus.filter(d => d.k >= 5 && d.k <= 100).map(d => ({ id: d.id, binary: d.binary ? d.binary.map(b => [b.e1, b.n1, b.e2, b.n2].join(', ')).join('\n') : null, tese: d.yi.map((y, j) => String(y) + ', ' + String(Math.sqrt(d.vi[j]))).join('\n') }));
  const out = await page.evaluate(async configs => {
    const res = [];
    for (const c of configs) {
      document.getElementById('format').value = c.binary ? 'binary' : 'te-se';
      document.getElementById('src').value = c.binary || c.tese;
      const r = AlmPubbiasPlusUI.run(), last = window._almLastPubbias(), b = r.loo.values.rows[0];
      if (!last) { // main analysis refused: the plus base row must show the same refusal for trim-and-fill
        res.push([c.id, document.getElementById('plus-identity').dataset.plusIdentity, /^Analysis unavailable: Fisher scoring/.test(document.getElementById('body').textContent) && b.trimfill.status === 'refused' && b.trimfill.reason === 'reml-nonconvergence', 'main-refused']);
        continue;
      }
      // Independent of the panel's own identity() check: compare raw values with the page's export object.
      const same = b.egger.status === 'ok' && Object.is(b.egger.values.statistic, last.egger_t) && Object.is(b.egger.values.p, last.egger_p)
        && Object.is(b.begg.values.tau, last.begg_tau) && Object.is(b.begg.values.p, last.begg_p)
        && (b.trimfill.status !== 'ok' || (b.trimfill.values.k0 === last.tf_k0 && Object.is(b.trimfill.values.est, last.tf_est)));
      res.push([c.id, document.getElementById('plus-identity').dataset.plusIdentity, same]);
      await new Promise(r => setTimeout(r, 0));
    }
    return res;
  }, configs);
  const refused = out.filter(x => x[3] === 'main-refused');
  console.log('PUBBIAS PLUS IDENTITY', out.length, 'main refused:', JSON.stringify(refused), 'mismatch:', JSON.stringify(out.filter(x => !x[3] && (x[1] !== 'match' || !x[2]))));
  expect(out.length).toBe(configs.length);
  expect(out.filter(x => !x[3] && (x[1] !== 'match' || !x[2]))).toEqual([]);
  expect(refused.filter(x => x[1] !== 'not-applicable' || !x[2])).toEqual([]);
});

test('identity check can fail: a perturbed main-table value is reported as a mismatch', async ({ page }) => {
  await page.goto(URL_);
  await page.locator('#plus-run').click();
  await expect(page.locator('#plus-identity')).toHaveAttribute('data-plus-identity', 'match');
  const state = await page.evaluate(() => {
    const orig = window._almLastPubbias; window._almLastPubbias = () => ({ ...orig(), egger_t: orig().egger_t + 1e-12 });
    const r = AlmPubbiasPlusUI.snapshot().result; const m = AlmPubbiasPlusUI.identity(r, false); window._almLastPubbias = orig; return m;
  });
  expect(state).toEqual(['Egger t']);
  await expect(page.locator('#plus-identity')).toHaveAttribute('data-plus-identity', 'mismatch');
});

test('clear refusals: k<3, k=3, equal SEs, k>100, and the alpha tie', async ({ page }) => {
  await page.goto(URL_);
  const run = async (src, fmt = 'te-se') => page.evaluate(([src, fmt]) => { document.getElementById('format').value = fmt; document.getElementById('src').value = src; AlmPubbiasPlusUI.run(); return { status: document.getElementById('plus-status').textContent, refusals: [...document.querySelectorAll('#alm-plus [data-plus-refusal]')].map(n => [n.dataset.plusRefusal, n.dataset.plusReason, n.textContent]) }; }, [src, fmt]);
  let r = await run('0.1, 0.1\n0.2, 0.2');
  expect(r.refusals.map(x => x[1])).toEqual(['k-below-3', 'k-below-3', 'k-below-3', 'loo-requires-k-4']);
  expect(r.refusals[0][2]).toBe('Refused: needs at least 3 studies');
  r = await run('0.1, 0.1\n0.2, 0.2\n0.3, 0.15');
  expect(r.refusals).toEqual([['loo', 'loo-requires-k-4', 'Refused: leave-one-out needs at least 4 studies, so that every reduced data set keeps 3']]);
  expect(r.status).toContain('PET-PEESE complete');
  r = await run('0.1, 0.1\n0.2, 0.1\n0.3, 0.1\n0.25, 0.1\n0.15, 0.1');
  expect(r.refusals.slice(0, 3).map(x => x[1])).toEqual(['singular-design', 'singular-design', 'singular-design']);
  const big = Array.from({ length: 101 }, (_, i) => (0.1 + 0.01 * (i % 7)) + ', ' + (0.05 + 0.002 * i)).join('\n');
  r = await run(big);
  expect(r.refusals).toEqual([['loo', 'loo-k-above-100', 'Refused: leave-one-out is limited to 100 studies, the range validated against R']]);
  r = await run('');
  expect(r.status).toBe('Refused: No valid studies in the input.');
  const tie = await page.evaluate(() => {
    const P = AlmPubbiasPlus, q = { status: 'ok', values: { est: 1, ciLo: 0, ciHi: 2, p: 0.001 } };
    return [P.conditional({ status: 'ok', values: { est: 0, ciLo: -1, ciHi: 1, p: 0.05 + 5e-10 } }, q).reason,
      P.conditional({ status: 'ok', values: { est: 0, ciLo: -1, ciHi: 1, p: 0.0499 } }, q).values.branch,
      P.conditional({ status: 'ok', values: { est: 0, ciLo: -1, ciHi: 1, p: 0.0501 } }, q).values.branch];
  });
  expect(tie).toEqual(['alpha-tie', 'PEESE', 'PET']);
});

test('extras replay: pinned count, documented exceptions only, offline, page state restored', async ({ page, context }) => {
  test.setTimeout(900000);
  await page.goto(URL_);
  await page.locator('#plus-example').click();
  const before = await page.locator('#plus-loo-body').innerHTML();
  await page.evaluate(() => AlmPubbiasPlusValidation.prepare());
  const requests = []; context.on('request', r => requests.push(r.url()));
  await context.setOffline(true);
  const result = await page.evaluate(() => AlmPubbiasPlusValidation.runCorpus());
  console.log('PUBBIAS PLUS CORPUS', JSON.stringify({ checks: result.checks, passed: result.passed, failed: result.failed.length, unexpected: result.unexpected, maxima: result.maxima }));
  expect(result.checks).toBe(manifest.checks);
  expect(result.passed).toBe(manifest.expectedPassed);
  expect(result.unexpected).toBe(0);
  expect(result.coverage).toBe(true);
  expect(result.failed.every(f => f.knownException)).toBe(true);
  expect(result.failed.map(f => f.label.replace(/ \[documented: [a-z-]+\]$/, '')).sort()).toEqual([...manifest.exceptions.identities].sort());
  expect(requests).toEqual([]);
  expect(await page.locator('#plus-loo-body').innerHTML()).toBe(before);
  await expect(page.locator('#alm-plus-validate [role=status]')).toContainText(manifest.expectedPassed + '/' + manifest.checks + ' passed');
});

const EXPECT = { 'begg tau +1e-8 in page engine': /\| loo\.\w+\.begg\.tau \[UNEXPECTED\]/, 'trim-and-fill k0 +1': /\.trimfill\.k0 \[UNEXPECTED\]/, 'PEESE reference est': /^dat\.bcg\/OR:tpos:cpos \| full\.peese\.est \[UNEXPECTED\]/, 'reference branch flipped': /^dat\.bcg\/OR:tpos:cpos \| loo\.omit3\.conditional\.branch \[UNEXPECTED\]/, 'reference flag flipped': /^dat\.bcg\/OR:tpos:cpos \| loo\.omit5\.flag\.begg_flip \[UNEXPECTED\]/, 'refusal reason changed': /^dat\.mccurdy2020 \| loo\.refusal \[UNEXPECTED\]/, 'displayed number tampered': /\| display \[UNEXPECTED\]/, 'pinned exception dropped': null, 'reference p-value +2e-9': /^dat\.bcg\/OR:tpos:cpos \| loo\.omit2\.begg\.p \[UNEXPECTED\]/, 'disposition tampered': /^corpus \| disposition \[UNEXPECTED\]/, 'Thompson-Sharp reference statistic +2e-6': /^dat\.bcg\/OR:tpos:cpos \| thompson_sharp\.statistic \[UNEXPECTED\]/, 'previous Thompson-Sharp formula': /\| thompson_sharp\.statistic \[UNEXPECTED\]/ };
const NEGATIVES = ['begg tau +1e-8 in page engine', 'trim-and-fill k0 +1', 'PEESE reference est', 'reference branch flipped', 'reference flag flipped', 'refusal reason changed', 'displayed number tampered', 'pinned exception dropped', 'missing configuration', 'reference p-value +2e-9', 'disposition tampered', 'Thompson-Sharp reference statistic +2e-6', 'previous Thompson-Sharp formula'];
for (const mutation of NEGATIVES) test(`extras replay negative: ${mutation}`, async ({ page }) => {
  test.setTimeout(900000);
  await page.goto(URL_);
  const result = await page.evaluate(async mutation => {
    const A = AlmPubbiasPlusAdapter, loaded = {};
    for (const f of A.corpus.files) loaded[f.path] = await (await fetch(f.path)).json();
    const corpus = loaded['validate/corpus/corpus.json'], ref = loaded['validate/plus-corpus/reference-plus.json'].datasets;
    const E = window.__almPubBiasEngine, saved = { begg: E.beggMazumdar, tf: E.trimFill, ts: E.thompsonSharp, render: AlmPubbiasPlusUI.render };
    const target = corpus.find(d => d.id === 'dat.bcg/OR:tpos:cpos').id, row = ref[target].loo.rows;
    if (mutation === 'begg tau +1e-8 in page engine') E.beggMazumdar = rows => { const v = saved.begg(rows); return rows.length === 12 ? { ...v, tau: v.tau + 1e-8 } : v; };
    if (mutation === 'trim-and-fill k0 +1') E.trimFill = rows => { const v = saved.tf(rows); return rows.length === 7 ? { ...v, k0: v.k0 + 1 } : v; };
    if (mutation === 'PEESE reference est') ref[target].full.peese.est += 2e-9 * Math.max(1, Math.abs(ref[target].full.peese.est));
    if (mutation === 'reference branch flipped') row[3].conditional.branch = row[3].conditional.branch === 'PET' ? 'PEESE' : 'PET';
    if (mutation === 'reference flag flipped') row[5].flags.begg_flip = !row[5].flags.begg_flip;
    if (mutation === 'refusal reason changed') ref['dat.mccurdy2020'].loo.error = 'loo-requires-k-4';
    if (mutation === 'reference p-value +2e-9') row[2].begg.p += 2e-9;
    if (mutation === 'missing configuration') corpus.pop();
    const tsref = loaded['validate/plus-corpus/thompson-sharp-reference.json'].datasets;
    if (mutation === 'Thompson-Sharp reference statistic +2e-6') tsref[target].statistic += 2e-6 * Math.max(1, Math.abs(tsref[target].statistic));
    // The build before this version: intercept of weighted lm(te ~ se), SE scaled again by sqrt(max(1, phi)), t(k-2).
    if (mutation === 'previous Thompson-Sharp formula') E.thompsonSharp = rows => { const r = E.wls(rows.map(x => x.se), rows.map(x => x.te), rows.map(x => 1 / (x.se * x.se))); const z = r.b0 / (r.seB0 * Math.sqrt(Math.max(1, r.sigma2))); return { statistic: z, p: 0.5, b0: r.b1, limit: r.b0, tau2: 0 }; };
    if (mutation === 'disposition tampered') loaded['validate/plus-corpus/dataset-disposition.json']['dat.bcg'].used = false;
    if (mutation === 'displayed number tampered') AlmPubbiasPlusUI.render = (...a) => { saved.render(...a); const n = document.querySelector('#alm-plus [data-plus-key="full.peese.est"]'); if (n) n.textContent = (Number(n.textContent) + 0.0001).toFixed(4); };
    const pins = AlmPubbiasPlusPins.exceptions.identities, dropped = mutation === 'pinned exception dropped' ? pins.shift() : null;
    try {
      // Re-mount is unnecessary: the adapter reads the pinned identities at load, so rebuild with a fresh adapter copy.
      if (dropped) { const s = document.createElement('script'); s.src = 'validate/plus-adapter.js?neg'; await new Promise(r => { s.onload = r; document.body.append(s); }); }
      return await window.AlmPubbiasPlusAdapter.corpus.run(loaded, () => {});
    } catch (e) { return { error: e.message }; }
    finally { E.beggMazumdar = saved.begg; E.trimFill = saved.tf; E.thompsonSharp = saved.ts; AlmPubbiasPlusUI.render = saved.render; if (dropped) pins.unshift(dropped); }
  }, mutation);
  console.log('PUBBIAS PLUS NEGATIVE', mutation, JSON.stringify({ error: result.error, unexpected: result.unexpected, sample: (result.failed || []).filter(f => !f.knownException).slice(0, 2) }));
  if (mutation === 'missing configuration') expect(result.error).toMatch(/coverage/);
  else {
    expect(result.unexpected).toBeGreaterThan(0);
    const first = manifest.exceptions.identities[0], want = EXPECT[mutation] || { test: label => label === first + ' [UNEXPECTED]' };
    expect(result.failed.some(f => !f.knownException && want.test(f.label))).toBe(true);
  }
});

test('extras replay refuses a corpus file whose bytes differ from the SHA-256 pin', async ({ page }) => {
  await page.route('**/validate/plus-corpus/reference-plus.json', async route => { const r = await route.fetch(); const body = (await r.text()).replace('"alpha":0.05', '"alpha":0.050'); await route.fulfill({ response: r, body }); });
  await page.goto(URL_);
  const msg = await page.evaluate(() => AlmPubbiasPlusValidation.runCorpus().then(() => 'ran', e => e.message));
  expect(msg).toMatch(/SHA-256 mismatch/);
});

for (const example of ['binary worked example', 'built-in effect/SE example']) test(`extras live webR: ${example} @slow`, async ({ page }) => {
  test.setTimeout(900000);
  await page.goto(URL_);
  if (example.startsWith('binary')) await page.locator('#plus-example').click(); else await page.locator('#plus-run').click();
  page.on('console', m => { if (/PLUS R STATUS/.test(m.text())) console.log(m.text()); });
  const result = await page.evaluate(async () => {
    const hb = setInterval(() => console.log('PLUS R STATUS', document.querySelector('#alm-plus-validate [role=status]').textContent), 20000);
    try { return await AlmPubbiasPlusValidation.runLive(); } finally { clearInterval(hb); }
  });
  console.log('PUBBIAS PLUS LIVE', example, result.rows.length, JSON.stringify(result.versions), JSON.stringify(result.rows.filter(r => !r.pass).slice(0, 10)));
  expect(result.rows.length).toBeGreaterThan(100);
  expect(result.rows.filter(r => !r.pass)).toEqual([]);
  expect(result.versions).toMatchObject({ metafor: '4.8-0', meta: '8.3-0' });
});
