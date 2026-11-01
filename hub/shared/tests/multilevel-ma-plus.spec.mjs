// multilevel-ma extras (#alm-plus): CR2 cluster-robust inference and profile-likelihood
// intervals. Engine checks run in Node against the pinned native R references; browser
// checks replay the original 528-check contract and the 10,749-check extras contract, and
// show that every check can fail (planted negatives).
import {test, expect} from './validation-fixture.mjs';
import {test as nodeTest} from '@playwright/test';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import AxeBuilder from '@axe-core/playwright';
import '../../../multilevel-ma/plus-engine.js';
const root = new URL('../../../multilevel-ma/', import.meta.url);
const url = '/multilevel-ma/index.html';
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
// Evidence is written only when ALM_PLUS_EVIDENCE=1, so ordinary CI runs leave the tree clean.
const evidence = (name, value) => {
  if (process.env.ALM_PLUS_EVIDENCE !== '1') return;
  mkdirSync(new URL('validate/plus-evidence/', root), {recursive: true});
  writeFileSync(new URL('validate/plus-evidence/' + name, root), JSON.stringify(value, null, 2) + '\n');
};
// null on both sides is a declared unavailable quantity: a profile limit the bounded search did
// not reach. null on one side only must fail. Same convention as AlmValidate.compare.
const near = (a, b, tol, absolute = false) => (a === null && b === null) ||
  (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) / (absolute ? 1 : Math.max(1, Math.abs(b))) <= tol);
// The 44 metadat configurations and the 21 few-cluster regime configurations.
const corpora = () => [
  {corpus: read('validate/corpus/corpus.json'), reference: read('validate/plus-corpus/reference-plus.json'), count: 44},
  {corpus: read('validate/plus-corpus/regime-corpus-plus.json'), reference: read('validate/plus-corpus/regime-reference-plus.json'), count: 21}
];

// The engine must not sit at a worse restricted-likelihood optimum than R. The slack is 1e-12
// relative to max(1,|R|) - the same scale convention as the numerical tolerances - because the
// rounding noise of a sum over a hundred rows is relative, not absolute: the largest observed
// shortfall is 2.6e-12 on a log-likelihood of 442.66 (dat.mccurdy2020), i.e. 5.8e-15 relative.
// Real differences here are 1e-9 and larger, and the engine must be the higher side, because R's
// reported estimates are its optimiser's stopping point.
const notLower = (engine, r) => engine + 1e-12 * Math.max(1, Math.abs(r)) >= r;

nodeTest('multilevel-ma-plus engine: all 65 R references, 3,835 numerical checks', () => {
  nodeTest.setTimeout(1500000); // 65 profile-likelihood fits in Node take several minutes.
  let checks = 0, configurations = 0; const failed = [], lower = [];
  expect(notLower(-8.462230559363343, -8.462230559363341)).toBe(true); // observed float noise
  expect(notLower(442.65858944379346, 442.658589443796)).toBe(true); // the largest observed, 5.8e-15 relative
  expect(notLower(-8.46223056 - 1e-9, -8.46223056)).toBe(false); // a real drop is detected
  expect(notLower(442.65858944 - 1e-7, 442.65858944)).toBe(false); // ... at the larger scale too
  const check = (id, key, a, b, tol, absolute) => { checks++; if (!near(a, b, tol, absolute)) failed.push({id, key, a, b, tol}); };
  for (const set of corpora()) {
    expect(Object.keys(set.reference)).toHaveLength(set.count);
    for (const [name, r] of Object.entries(set.reference)) {
      configurations++;
      expect(r.status, name).toBe('ok');
      const a = AlmMultilevelPlusEngine.fit(set.corpus[name]);
      checks++; if (a.rows !== r.rows) failed.push({id: name, key: 'rows'});
      checks++; if (a.clusters !== r.clusters) failed.push({id: name, key: 'clusters'});
      check(name, 'logLik', a.logLik, r.logLik, 1e-6);
      if (!notLower(a.logLik, r.logLik)) lower.push({id: name, engine: a.logLik, r: r.logLik});
      for (const k of Object.keys(r.robust)) check(name, 'robust.' + k, a.robust[k], r.robust[k], k === 'p' ? 1e-9 : 1e-6, k === 'p');
      const cr = AlmMultilevelPlusEngine.cr2(set.corpus[name], ...r.cr2Sigma2);
      for (const k of Object.keys(r.robust)) check(name, 'closed.' + k, cr[k], r.robust[k], 1e-9, k === 'p');
      for (let j = 0; j < 2; j++) for (const k of ['estimate', 'lower', 'upper', 'x', 'll'])
        [r.profiles[j][k]].flat().forEach((v, i) => check(name, `profile.${j}.${k}.${i}`, [a.profiles[j][k]].flat()[i], v, 1e-6));
    }
  }
  console.log('MULTILEVEL PLUS ENGINE', (checks - failed.length) + '/' + checks,
    '; restricted log-likelihood never below R in', configurations - lower.length + '/' + configurations);
  expect(failed).toEqual([]); expect(lower).toEqual([]); expect(configurations).toBe(65); expect(checks).toBe(3835);
});

// metafor:::confint.rma.mv searches sigma^2 in [0, max(10, 100*estimate)] and, when the
// likelihood-ratio cutoff is not crossed inside that interval, returns the bound itself as the
// limit; it reports that only in ub.sign (">") of the returned object, with no warning and no
// message, so reading $random[1,] alone pins a truncated search bound as a reference value. The
// generators widen the bound until the limit is interior, so no reference limit may sit at the
// default bound - and the recorded divergences must show that the widened limit, not metafor's
// default-bound value, is the one that satisfies the defining criterion.
nodeTest('multilevel-ma-plus references: no pinned profile limit is metafor\'s own search bound', () => {
  let limits = 0, interior = 0; const atBound = [];
  for (const set of corpora()) for (const [id, r] of Object.entries(set.reference)) r.profiles.forEach((p, j) => {
    const bound = Math.max(10, 100 * p.estimate);
    limits++;
    if (typeof p.upper === 'number' && Math.abs(p.upper - bound) <= 1e-8 * Math.max(1, bound)) atBound.push({id, j, upper: p.upper, bound});
    else interior++;
  });
  console.log('MULTILEVEL PLUS LIMITS INTERIOR', interior + '/' + limits);
  expect(atBound).toEqual([]); expect(limits).toBe(130);
  // The guard can fail: a limit equal to the default bound is detected.
  const planted = {profiles: [{estimate: 0.05, upper: 10}, {estimate: 1, upper: 2}]};
  expect(planted.profiles.filter((p, j) => Math.abs(p.upper - Math.max(10, 100 * p.estimate)) <= 1e-8 * Math.max(1, Math.max(10, 100 * p.estimate)))).toHaveLength(1);
});

nodeTest('multilevel-ma-plus divergences: the widened limit meets the criterion and metafor\'s default bound does not', () => {
  nodeTest.setTimeout(900000);
  const divergences = read('validate/plus-corpus/divergences-plus.json');
  const reference = read('validate/plus-corpus/regime-reference-plus.json');
  const corpus = read('validate/plus-corpus/regime-corpus-plus.json');
  expect(divergences.length).toBeGreaterThan(0);
  for (const d of divergences) {
    // metafor returned its own bound, flagged only by ub.sign.
    expect(d.metafor_default_ub_sign, d.id).toBe('>');
    expect(near(d.metafor_default_upper, d.default_vc_max, 1e-10), d.id).toBe(true);
    // The engine agrees with the widened reference limit, not with the truncated bound.
    const a = AlmMultilevelPlusEngine.fit(corpus[d.id]);
    expect(near(a.profiles[d.component - 1].upper, d.reference_upper, 1e-6), d.id).toBe(true);
    expect(near(a.profiles[d.component - 1].upper, d.metafor_default_upper, 1e-6), d.id).toBe(false);
    expect(reference[d.id].profiles[d.component - 1].upper).toBe(d.reference_upper);
    // Adjudicated with metafor's own profile likelihood: the reference limit sits on the cutoff,
    // the truncated bound sits above it, i.e. the search stopped before reaching the limit.
    expect(Math.abs(d.gap_reference), d.id).toBeLessThan(1e-7);
    expect(d.gap_default, d.id).toBeGreaterThan(1e-3);
  }
  console.log('MULTILEVEL PLUS DIVERGENCES', divergences.length, divergences.map(d => `${d.id}/${d.component} default ${d.metafor_default_upper} gap ${d.gap_default.toPrecision(4)} -> widened ${d.reference_upper} gap ${d.gap_reference.toPrecision(3)}`).join('; '));
});

nodeTest('multilevel-ma-plus engine: an unreached profile limit is null, never the search bound', () => {
  nodeTest.setTimeout(300000);
  const rows = read('validate/corpus/corpus.json')['dat.konstantopoulos2011'];
  const full = AlmMultilevelPlusEngine.fit(rows);
  expect(full.profiles[0].upper).toBeGreaterThan(0.2);
  // searchBound is the analogue of metafor's control vc.max. Below the limit, the engine reports
  // the limit as unavailable rather than returning the bound, and the nine marks still end at
  // 1.5 times the estimate so both sides evaluate the same abscissae.
  const bounded = AlmMultilevelPlusEngine.fit(rows, {searchBound: 0.1});
  expect(bounded.profiles[0].upper).toBeNull();
  expect(bounded.profiles[0].upper).not.toBe(0.1);
  expect(bounded.profiles[0].x.at(-1)).toBeCloseTo(bounded.profiles[0].estimate * 1.5, 12);
  expect(bounded.profiles[0].ll.every(Number.isFinite)).toBe(true);
  expect(bounded.profiles[0].lower).toBeCloseTo(full.profiles[0].lower, 10);
  expect(() => AlmMultilevelPlusEngine.fit(rows, {searchBound: 0})).toThrow(/searchBound/);
  // A null limit must not pass against a numeric reference, nor the reverse.
  expect(near(null, null, 1e-6)).toBe(true);
  expect(near(null, full.profiles[0].upper, 1e-6)).toBe(false);
  expect(near(full.profiles[0].upper, null, 1e-6)).toBe(false);
});

nodeTest('multilevel-ma-plus engine: the tolerance check fails on planted errors', () => {
  const corpus = read('validate/corpus/corpus.json'), r = read('validate/plus-corpus/reference-plus.json')['dat.konstantopoulos2011'];
  const a = AlmMultilevelPlusEngine.fit(corpus['dat.konstantopoulos2011']);
  expect(near(a.robust.p, r.robust.p, 1e-9, true)).toBe(true);
  expect(near(a.robust.p + 2e-9, r.robust.p, 1e-9, true)).toBe(false);
  expect(near(a.profiles[0].upper + 2e-6 * Math.max(1, Math.abs(r.profiles[0].upper)), r.profiles[0].upper, 1e-6)).toBe(false);
  const cr = AlmMultilevelPlusEngine.cr2(corpus['dat.konstantopoulos2011'], ...r.cr2Sigma2);
  expect(near(cr.se, r.robust.se, 1e-9)).toBe(true);
  expect(near(cr.se + 2e-9 * Math.max(1, Math.abs(r.robust.se)), r.robust.se, 1e-9)).toBe(false);
});

nodeTest('multilevel-ma-plus engine: invalid rows, too few clusters and unidentifiable components refuse', () => {
  const valid = [{cluster: 'A', y: .1, v: .01}, {cluster: 'A', y: .2, v: .02}, {cluster: 'B', y: .3, v: .03}];
  expect(() => AlmMultilevelPlusEngine.fit(valid.slice(0, 1))).toThrow(/three valid/);
  expect(() => AlmMultilevelPlusEngine.fit(valid.map(r => ({...r, cluster: 'A'})))).toThrow(/two clusters/);
  expect(() => AlmMultilevelPlusEngine.fit(valid.map((r, i) => ({...r, cluster: i})))).toThrow(/not identifiable/);
  for (const value of [0, -1, NaN, Infinity]) expect(() => AlmMultilevelPlusEngine.fit(valid.map((r, i) => i ? r : {...r, v: value}))).toThrow(/positive variances/);
  expect(() => AlmMultilevelPlusEngine.fit(valid.map((r, i) => i ? r : {...r, y: NaN}))).toThrow(/finite effects/);
});

nodeTest('multilevel-ma-plus engine: prototype-key cluster labels do not change membership', () => {
  const rows = read('validate/corpus/corpus.json')['dat.konstantopoulos2011'], keys = [...new Set(rows.map(r => r.cluster))];
  const a = AlmMultilevelPlusEngine.fit(rows), b = AlmMultilevelPlusEngine.fit(rows.map(r => ({...r, cluster: keys.indexOf(r.cluster) === 0 ? '__proto__' : 'c' + keys.indexOf(r.cluster)})));
  expect(b).toEqual(a);
});

nodeTest('multilevel-ma-plus pins: seven LF corpus files verify and every changed byte is refused', async () => {
  nodeTest.setTimeout(180000);
  const context = vm.createContext({crypto: webcrypto, TextDecoder, TextEncoder});
  vm.runInContext(readFileSync(new URL('../../../shared/alm-validate.js', import.meta.url), 'utf8'), context);
  const manifest = read('validate/MANIFEST-plus.json');
  const pinContext = vm.createContext({window: {}});
  vm.runInContext(readFileSync(new URL('validate/plus-pins.js', root), 'utf8'), pinContext);
  const pins = pinContext.window.AlmMultilevelPlusPins;
  expect(manifest.files).toHaveLength(7); expect(manifest.checks).toBe(10749); expect(pins.checks).toBe(10749);
  expect(manifest.configurations).toBe(65); expect(manifest.numericalChecks).toBe(3835);
  expect(pins.files.map(f => f.sha256)).toEqual(manifest.files.map(f => f.sha256));
  for (const f of manifest.files) {
    const bytes = readFileSync(new URL(f.path, root)); expect(bytes.length).toBe(f.bytes); expect(bytes.includes(13)).toBe(false);
    await context.AlmValidate.verify(bytes, f.sha256, f.path);
    const changed = Buffer.from(bytes); changed[0] ^= 1;
    await expect(context.AlmValidate.verify(changed, f.sha256, f.path)).rejects.toThrow(/SHA-256 mismatch/);
  }
});

async function loadExample(page) {
  await page.evaluate(async () => {
    const c = await (await fetch('validate/corpus/corpus.json')).json(), refs = await (await fetch('validate/plus-corpus/reference-plus.json')).json();
    const rows = c['dat.konstantopoulos2011'];
    document.getElementById('src').value = rows.map(r => [r.cluster, r.y, Math.sqrt(r.v)].join(',')).join('\n');
    window.plusTestRef = refs['dat.konstantopoulos2011']; window.plusTestApp = AlmMultilevelPlus.calculate();
  });
}

test('multilevel-ma-plus original 528 replay unchanged and extras replay 10,749/10,749', async ({page}) => {
  test.setTimeout(1800000);
  await page.goto(url);
  const before = await page.locator('#src').inputValue();
  const navigation = await page.evaluate(() => ({href: location.href, state: history.state, length: history.length}));
  const old = await page.evaluate(() => AlmMultilevelValidation.runCorpus());
  console.log('MULTILEVEL ORIGINAL', old.passed + '/' + old.checks, 'failed', old.failed.length);
  expect(old.checks).toBe(528); expect(old.passed).toBe(528); expect(old.failed).toEqual([]);
  const plus = await page.evaluate(() => AlmMultilevelPlusValidation.runCorpus());
  console.log('MULTILEVEL PLUS', plus.passed + '/' + plus.checks, 'failed', plus.failed.length);
  evidence('replay-plus.json', {original: {checks: old.checks, passed: old.passed, failed: old.failed}, extras: {checks: plus.checks, passed: plus.passed, failed: plus.failed, summaryLines: plus.summaryLines}, userAgent: await page.evaluate(() => navigator.userAgent)});
  expect(plus.checks).toBe(10749); expect(plus.passed).toBe(10749); expect(plus.failed).toEqual([]);
  await expect(page.locator('#alm-plus-validate [role=status]')).toContainText('10749/10749 passed; 0 failed');
  await expect(page.locator('#alm-plus-validate h2')).toHaveText('Validate the extras in R');
  expect(await page.locator('#src').inputValue()).toBe(before);
  expect(await page.evaluate(() => ({href: location.href, state: history.state, length: history.length}))).toEqual(navigation);
});

test('multilevel-ma-plus clean table and plots pass at 1280 px and 375 px', async ({page}) => {
  test.setTimeout(120000);
  await page.goto(url); await loadExample(page);
  for (const width of [1280, 375]) {
    await page.setViewportSize({width, height: 900});
    const bad = await page.evaluate(async () => (await AlmMultilevelPlusAudit.audit(plusTestApp, plusTestRef)).filter(r => !r.pass));
    expect(bad, 'width ' + width).toEqual([]);
  }
  const box = await page.locator('#alm-plus-output svg').first().boundingBox();
  expect(box.width).toBeLessThanOrEqual(375);
  // The extras section itself must not force horizontal page scroll at phone width.
  expect(await page.evaluate(() => { const r = document.getElementById('alm-plus').getBoundingClientRect(); return r.right <= window.innerWidth + 1; })).toBe(true);
});

test('multilevel-ma-plus every numerical, display and export check can fail', async ({page}) => {
  test.setTimeout(300000);
  await page.goto(url); await loadExample(page);
  const outcome = await page.evaluate(async () => {
    const keys = Object.keys(AlmMultilevelPlus.quantities(plusTestApp)), failed = [];
    function alter(obj, key) { const parts = key.split('.'); let v = obj; for (const p of parts.slice(0, -1)) v = v[p === 'profile' ? 'profiles' : p]; v[parts.at(-1)] += 1; }
    const realExport = AlmMultilevelPlus.exportText;
    for (const key of keys) {
      const changed = structuredClone(plusTestApp); alter(changed, key);
      if ((await AlmMultilevelPlusAudit.audit(changed, plusTestRef)).find(x => x.quantity === key)?.pass !== false) failed.push('number ' + key);
      const cell = document.querySelector(`#alm-plus-output [data-quantity="${key}"]`), old = cell.textContent; cell.textContent = String(Number(old) + 1);
      if ((await AlmMultilevelPlusAudit.audit(plusTestApp, plusTestRef)).find(x => x.quantity === 'display.' + key)?.pass !== false) failed.push('display ' + key); cell.textContent = old;
      const exp = JSON.parse(realExport()); alter(exp, key); AlmMultilevelPlus.exportText = () => JSON.stringify(exp);
      if ((await AlmMultilevelPlusAudit.audit(plusTestApp, plusTestRef)).find(x => x.quantity === 'export.' + key)?.pass !== false) failed.push('export ' + key);
      AlmMultilevelPlus.exportText = realExport;
    }
    const clean = (await AlmMultilevelPlusAudit.audit(plusTestApp, plusTestRef)).filter(r => !r.pass).map(r => r.quantity);
    return {keys: keys.length, failed, clean};
  });
  console.log('MULTILEVEL PLUS NEGATIVES', outcome.keys * 3, 'planted;', outcome.failed.length, 'undetected');
  expect(outcome.keys).toBe(52); expect(outcome.failed).toEqual([]); expect(outcome.clean).toEqual([]);
});

test('multilevel-ma-plus extra cells, altered labels, schema and export metadata fail', async ({page}) => {
  await page.goto(url); await loadExample(page);
  const checks = await page.evaluate(async () => {
    const find = async q => (await AlmMultilevelPlusAudit.audit(plusTestApp, plusTestRef)).find(x => x.quantity === q).pass;
    const output = document.getElementById('alm-plus-output'), cell = output.querySelector('[data-quantity]'), clone = cell.cloneNode(true); output.append(clone);
    const count = await find('display.count'); clone.remove();
    const label = cell.previousElementSibling, text = label.textContent; label.textContent = 'Incorrect label';
    const labelled = await find('display.rows'); label.textContent = text;
    const fn = AlmMultilevelPlus.exportText; AlmMultilevelPlus.exportText = () => JSON.stringify({...JSON.parse(fn()), inference: 'CR1'});
    const exported = await find('export.schema'); AlmMultilevelPlus.exportText = fn;
    const title = output.querySelector('h3'), old = title.textContent; title.textContent = 'CR1';
    const schema = await find('display.schema'); title.textContent = old;
    const after = (await AlmMultilevelPlusAudit.audit(plusTestApp, plusTestRef)).filter(r => !r.pass).length;
    return [count, labelled, exported, schema, after];
  });
  expect(checks).toEqual([false, false, false, false, 0]);
});

test('multilevel-ma-plus each plot fails on geometry, paint and axis-label changes', async ({page}) => {
  await page.goto(url); await loadExample(page);
  const checks = await page.evaluate(async () => {
    const out = [];
    for (let j = 0; j < 2; j++) {
      for (const [kind, apply] of [
        ['geometry', svg => svg.querySelector('circle').setAttribute('transform', 'translate(15 0)')],
        ['paint', svg => { svg.querySelector('circle').style.fill = 'red'; }],
        ['labels', svg => { svg.querySelector('text').textContent = 'Wrong axis'; }]
      ]) {
        apply(document.querySelectorAll('#alm-plus-output svg')[j]);
        out.push((await AlmMultilevelPlusAudit.plotChecks(plusTestApp)).find(x => x.quantity === `plot.${j}.${kind}`).pass);
        AlmMultilevelPlus.render(plusTestApp);
      }
    }
    out.push((await AlmMultilevelPlusAudit.plotChecks(plusTestApp)).every(x => x.pass));
    return out;
  });
  expect(checks).toEqual([false, false, false, false, false, false, true]);
});

test('multilevel-ma-plus all eight refusals pass and each reason/display/export check can fail', async ({page}) => {
  await page.goto(url);
  const outcome = await page.evaluate(() => {
    const checks = [];
    for (const c of AlmMultilevelPlusAudit.refusalCases) {
      document.getElementById('src').value = c.text; let reason = ''; try { AlmMultilevelPlus.calculate(); } catch (e) { reason = e.message; }
      checks.push(...AlmMultilevelPlusAudit.refusalChecks(reason, c.reason).map(x => x.pass));
      checks.push(!AlmMultilevelPlusAudit.refusalChecks('Incorrect refusal', c.reason)[0].pass);
      const shown = document.querySelector('#alm-plus-output [data-refusal]'), text = shown.textContent; shown.textContent = 'Incorrect display';
      checks.push(!AlmMultilevelPlusAudit.refusalChecks(reason, c.reason)[1].pass); shown.textContent = text;
      const original = AlmMultilevelPlus.exportText; AlmMultilevelPlus.exportText = () => '{}';
      checks.push(!AlmMultilevelPlusAudit.refusalChecks(reason, c.reason)[2].pass); AlmMultilevelPlus.exportText = original;
    }
    return checks;
  });
  expect(outcome).toHaveLength(48); expect(outcome.every(Boolean)).toBe(true);
});

// Number() reads hexadecimal, binary and octal literals, so '0x1F' would be analysed as 31
// instead of refused. The extras row contract promises a finite effect and a positive standard
// error, so only decimal and exponent forms are accepted.
test('multilevel-ma-plus the extras parser refuses radix literals and keeps decimal forms', async ({page}) => {
  await page.goto(url);
  const outcome = await page.evaluate(() => {
    const refused = [], accepted = [];
    const run = text => {
      document.getElementById('src').value = text;
      try { return {rows: AlmMultilevelPlus.rows()}; } catch (e) { return {reason: e.message}; }
    };
    for (const bad of ['0x1F', '0b101', '0o17', '0X1f', 'Infinity', '-Infinity', 'NaN', '1_000', '', ' ']) {
      const effect = run(`A,${bad},0.1\nA,2,0.1\nB,3,0.1`), se = run(`A,1,${bad}\nA,2,0.1\nB,3,0.1`);
      refused.push([bad, !!effect.reason, !!se.reason]);
    }
    for (const good of ['-.5', '1e-1', '+2.5', '0.0', '3', '2E2']) {
      const r = run(`A,${good},0.1\nA,2,0.1\nB,3,0.1`);
      accepted.push([good, r.rows ? r.rows[0].y : 'refused: ' + r.reason]);
    }
    const zero = run('A,1,0\nA,2,0.1\nB,3,0.1'), negative = run('A,1,-0.1\nA,2,0.1\nB,3,0.1');
    return {refused, accepted, zero: !!zero.reason, negative: !!negative.reason};
  });
  expect(outcome.refused.filter(([, effect, se]) => !effect || !se)).toEqual([]);
  expect(outcome.accepted).toEqual([['-.5', -0.5], ['1e-1', 0.1], ['+2.5', 2.5], ['0.0', 0], ['3', 3], ['2E2', 200]]);
  expect(outcome.zero).toBe(true); expect(outcome.negative).toBe(true);
  console.log('MULTILEVEL PLUS PARSER', outcome.refused.length * 2, 'radix/non-finite forms refused;', outcome.accepted.length, 'decimal forms accepted');
});

// Keys the original app saves on main (measured independently on main's index.html with the
// same page and the same one-edit-then-debounce procedure). #alm-plus must not change this list:
// shared/autosave.js keys controls without an id positionally as idx:N, so a single <select> or
// <input> inside the extras would both write extras state into the original app's storage key and
// shift every later positional key, silently mis-restoring older drafts.
const MAIN_AUTOSAVE_KEYS = ['src', 'idx:1', 'alm-plot-1-format', 'alm-plot-1-resolution', 'alm-plot-1-physical-width', 'idx:5', 'idx:6', 'idx:7', 'idx:8', 'idx:9', 'idx:10'];
const PLUS_SELECTORS = ['textarea', 'select', 'input[type=text]', 'input[type=number]', 'input[type=checkbox]', 'input[type=radio]', 'input[type=range]'];

test('multilevel-ma-plus the extras stay out of the original autosave', async ({page}) => {
  test.setTimeout(120000);
  await page.goto(url);
  const saved = await page.evaluate(async () => {
    localStorage.clear();
    const el = document.getElementById('src');
    el.value = el.value + '\n';
    el.dispatchEvent(new Event('input', {bubbles: true}));
    await new Promise(r => setTimeout(r, 1200)); // the installed debounce is 600 ms
    const stored = AlmAutosave.peek('multilevel-ma');
    return {keys: stored && Object.keys(stored.values), src: stored && stored.values.src};
  });
  expect(saved.keys).toEqual(MAIN_AUTOSAVE_KEYS);
  // shared/autosave.js swallows a rejected selector in a try/catch, so also prove it still saves.
  expect(saved.src).toContain('outcome A');
  // Planted negative: controls inside #alm-plus, snapshotted with the two selector sets on a
  // fresh page each time so the positional dataset indices are not carried over.
  const measure = async selectors => {
    await page.reload();
    return page.evaluate(sel => {
      const plus = document.getElementById('alm-plus');
      const area = document.createElement('textarea'); area.id = 'plus-data'; plus.append(area);
      const box = document.createElement('input'); box.type = 'checkbox'; box.id = 'plus-interaction'; plus.append(box);
      const grid = document.createElement('input'); grid.type = 'number'; grid.value = '9'; plus.append(grid);
      const seen = new Set(), els = [];
      sel.forEach(s => document.querySelectorAll(s).forEach(el => { if (!seen.has(el)) { seen.add(el); els.push(el); } }));
      return Object.keys(AlmAutosave._snapshot(els));
    }, selectors);
  };
  const withDefaults = await measure(PLUS_SELECTORS);
  // Mirror the selectors index.html installs: since 861a8133 they also exclude the #alm-features
  // panel (entry/share controls), so modelling only the #alm-plus exclusion measured a selector
  // set the app does not use. The real-save assertion above is the requirement; this is its model.
  const withExclusion = await measure(PLUS_SELECTORS.map(s => s + ':not(#alm-plus *):not(#alm-features *)'));
  expect(withExclusion).toEqual(MAIN_AUTOSAVE_KEYS);
  expect(withDefaults).toContain('plus-data');
  expect(withDefaults).toContain('plus-interaction');
  expect(withDefaults).not.toEqual(MAIN_AUTOSAVE_KEYS);
  console.log('MULTILEVEL PLUS AUTOSAVE', withExclusion.length, 'keys, equal to main; default selectors would save', withDefaults.length);
});

// A profile limit the bounded search did not reach is shown as text and exported as null, never
// as the search bound. The pinned corpora never reach the default bound, so the state is forced
// here with the engine's searchBound option, the analogue of metafor's control vc.max.
test('multilevel-ma-plus an unavailable profile limit is displayed and exported as not estimable', async ({page}) => {
  test.setTimeout(300000);
  await page.goto(url);
  const outcome = await page.evaluate(async () => {
    const c = await (await fetch('validate/corpus/corpus.json')).json();
    const rows = c['dat.konstantopoulos2011'];
    document.getElementById('src').value = rows.map(r => [r.cluster, r.y, Math.sqrt(r.v)].join(',')).join('\n');
    const result = AlmMultilevelPlusEngine.fit(AlmMultilevelPlus.rows(), {searchBound: 0.1});
    AlmMultilevelPlus.render(result);
    const cell = document.querySelector('#alm-plus-output [data-quantity="profile.0.upper"]');
    const numeric = document.querySelector('#alm-plus-output [data-quantity="profile.1.upper"]');
    return {
      value: result.profiles[0].upper,
      text: cell.textContent,
      expected: AlmMultilevelPlus.display(null),
      label: cell.previousElementSibling.textContent,
      numericText: numeric.textContent,
      numericValue: result.profiles[1].upper,
      cells: document.querySelectorAll('#alm-plus-output [data-quantity]').length,
      quantities: Object.keys(AlmMultilevelPlus.quantities(result)).length,
      exported: JSON.stringify(result.profiles[0].upper)
    };
  });
  expect(outcome.value).toBeNull();
  expect(outcome.text).toBe('not estimable (> upper search bound)');
  expect(outcome.text).toBe(outcome.expected);
  expect(outcome.label).toBe('Between-study variance 95% profile CI upper');
  expect(outcome.numericText).toBe(String(outcome.numericValue));
  expect(outcome.cells).toBe(outcome.quantities);
  expect(outcome.exported).toBe('null');
});

test('multilevel-ma-plus edited inputs invalidate extras and exports', async ({page}) => {
  await page.goto(url); await page.locator('#alm-plus-run').click();
  await expect(page.locator('#alm-plus-status')).toHaveText('Extras calculated.');
  await expect(page.locator('#alm-plus-export')).toBeEnabled();
  await page.locator('#src').fill('A,0.1,0.1');
  await expect(page.locator('#alm-plus-status')).toHaveText('Extras out of date — calculate again');
  await expect(page.locator('#alm-plus-output [data-quantity]')).toHaveCount(0);
  await expect(page.locator('#alm-plus-export')).toBeDisabled();
  expect(await page.evaluate(() => { try { AlmMultilevelPlus.exportText(); return false; } catch { return true; } })).toBe(true);
});

test('multilevel-ma-plus one-click example, keyboard use, labels, refusal messages and JSON download', async ({page}) => {
  await page.goto(url);
  await page.locator('#src').fill('A,1,0.1\nA,2,0.1\nA,3,0.1');
  await page.locator('#alm-plus-run').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#alm-plus-output [data-refusal]')).toHaveText('Need at least two clusters');
  await expect(page.locator('#alm-plus-output [role=alert]')).toHaveCount(1);
  await expect(page.locator('#alm-plus-status')).toHaveText('Extras refused: Need at least two clusters');
  await page.locator('#src').fill('A,1,0.1\nA,x,0.1\nB,3,0.1');
  await page.locator('#alm-plus-run').click();
  await expect(page.locator('#alm-plus-status')).toHaveText('Extras refused: Row 2: need a study label, a finite effect and a positive standard error');
  await page.locator('#alm-plus-example').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#alm-plus-status')).toHaveText('Extras calculated.');
  expect(await page.locator('#src').inputValue()).toBe(await page.evaluate(() => document.getElementById('src').defaultValue));
  for (const id of ['alm-plus-example', 'alm-plus-run', 'alm-plus-export']) await expect(page.locator('#' + id)).toHaveAccessibleName(/.+/);
  await expect(page.locator('#alm-plus-run')).toHaveAccessibleDescription(/Each row is one effect/);
  await expect(page.locator('#alm-plus-output svg[role=img]')).toHaveCount(2);
  await expect(page.locator('#alm-plus-output svg').first()).toHaveAttribute('aria-label', 'Between-study variance profile likelihood');
  await expect(page.locator('#alm-plus-output table th[scope=row]').first()).toHaveText('Effect rows');
  // The two validation panels expose distinct button names.
  await expect(page.getByRole('button', {name: 'Replay published corpus (stored references)', exact: true})).toHaveCount(1);
  await expect(page.getByRole('button', {name: 'Replay the extras corpus (stored references)', exact: true})).toHaveCount(1);
  const download = page.waitForEvent('download'); await page.locator('#alm-plus-export').click();
  const file = await download; expect(file.suggestedFilename()).toBe('multilevel-extras.json');
  const json = JSON.parse(readFileSync(await file.path(), 'utf8'));
  expect(json.status).toBe('ok'); expect(json.inference).toBe('CR2; Satterthwaite; 95% confidence'); expect(json.profiles).toHaveLength(2);
  await page.setViewportSize({width: 375, height: 900});
  await page.locator('#alm-plus').screenshot({path: 'test-results/multilevel-ma-plus-375.png'});
  await page.setViewportSize({width: 1280, height: 900});
  await page.locator('#alm-plus-output').screenshot({path: 'test-results/multilevel-ma-plus-1280.png'});
});

test('multilevel-ma-plus extras section has no WCAG A/AA axe violations', async ({page}) => {
  await page.goto(url); await page.locator('#alm-plus-example').click();
  await expect(page.locator('#alm-plus-status')).toHaveText('Extras calculated.');
  await page.locator('#alm-plus-output summary').click();
  const r = await new AxeBuilder({page}).include('#alm-plus').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', '))).toEqual([]);
});

test('multilevel-ma-plus SHA-256 changed reference bytes are refused', async ({page}) => {
  await page.goto(url);
  await page.route('**/validate/plus-corpus/reference-plus.json', r => r.fulfill({contentType: 'application/json', body: '{}'}));
  const error = await page.evaluate(async () => { try { await AlmMultilevelPlusValidation.runCorpus(); return ''; } catch (e) { return e.message; } });
  expect(error).toMatch(/SHA-256 mismatch/);
  await expect(page.locator('#alm-plus-validate [role=status]')).toContainText('SHA-256 mismatch');
});

test('multilevel-ma-plus live webR metafor profiles and log-likelihood @slow', async ({page}) => {
  test.setTimeout(300000);
  await page.goto(url);
  const r = await page.evaluate(() => AlmMultilevelPlusValidation.runLive());
  console.log('MULTILEVEL PLUS LIVE', r.rows.filter(x => x.pass).length + '/' + r.rows.length, JSON.stringify(r.versions));
  evidence('live-plus.json', r);
  expect(r.versions.webR).toBe('0.5.5'); expect(r.versions.metafor).toBe('4.8-0');
  expect(r.rows).toHaveLength(43); expect(r.rows.filter(x => !x.pass)).toEqual([]);
  await expect(page.locator('#alm-plus-validate [role=status]')).toContainText('43/43 live R quantities passed.');
});
