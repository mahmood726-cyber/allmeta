// Persona walkthrough PACK for the data-entry UX (capture tool, not a UX judge).
// App 9 (proportion-ma). Source: PMC5244530 (CC BY 4.0; fixtures/LICENCE.md), abstract Results paragraph, outcome
// "continued antidepressants until the 6 month follow-up (86/125 vs 78/133)". Schema 'proportion' {study, xi, ni}:
// each printed arm becomes one single-proportion row (app 9 needs >= 2 rows), so both arms are entered.
// Steps 1-9 each write <nn>-<step>.png (full page), .txt (visible text of the entry panel / relevant region) and
// .json (provenance state) to scripts/personas/pack/, plus pack/INDEX.md with the gold values for comparison.
// The test asserts only that every step rendered (and records whether the extracted values equal gold).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK = path.join(HERE, 'pack');
const MD = fs.readFileSync(path.join(HERE, 'fixtures', 'PMC5244530.md'), 'utf8');
const GOLD = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'PMC5244530.gold.json'), 'utf8'));
const APP = 'proportion-ma';

// The exact abstract Results paragraph (between the abstract's "## Results " and " ## Conclusions").
const START = MD.indexOf('## Results ') + '## Results '.length;
const PASTE = MD.slice(START, MD.indexOf(' ## Conclusions', START));
const TYPO = PASTE.replace('86/125', '186/125'); // deliberate data-entry error: events > n
const GOLD_ROW = GOLD.find(g => /^continued antidepressants/.test(g.outcome));
const LABELS = ['PRI-SMA 2016 intervention arm', 'PRI-SMA 2016 TAU arm'];
const REFERENCE = 'PRI-SMA trial report, BMC Family Practice; doi:10.1186/s12875-016-0578-9 (PMC5244530)';
const LOCATION = 'Abstract, Results paragraph';

const steps = [];

async function capture(page, n, slug, title, regionText, extra = {}) {
  const base = `${String(n).padStart(2, '0')}-${slug}`;
  await page.screenshot({ path: path.join(PACK, base + '.png'), fullPage: true });
  fs.writeFileSync(path.join(PACK, base + '.txt'), regionText, 'utf8');
  const state = await page.evaluate(() => {
    const h = window.__personaEntry, r = h && h.getResult ? h.getResult() : null;
    return {
      ui: r ? { records: r.records, provenance: r.provenance } : null,
      appliedProvenance: (window.AlmFeaturesState && window.AlmFeaturesState.provenance) || [],
    };
  });
  fs.writeFileSync(path.join(PACK, base + '.json'), JSON.stringify({ step: n, title, ...extra, ...state }, null, 2) + '\n', 'utf8');
  steps.push({ n, base, title });
  console.log(`PERSONA step ${n} ${slug}: ${regionText.length} chars of text`);
}

function card(host, i) {
  return host.locator('fieldset').filter({ has: host.page().locator('legend', { hasText: new RegExp(`^Study source ${i}$`) }) });
}

// Fill one source card: label, reference, location, DOI, arm, required facets, outcome, timepoint.
async function fillCard(c, label, armIndex) {
  await c.getByLabel('Study label (author and year, e.g. Smith 2019)').fill(label);
  await c.getByLabel('Full reference').fill(REFERENCE);
  await c.getByLabel('Location (table, figure or page)').fill(LOCATION);
  await c.getByLabel('DOI', { exact: true }).fill('10.1186/s12875-016-0578-9');
  await c.getByLabel('Arm to use').selectOption(String(armIndex));
  // Required facets (e.g. timepoint when the paste mentions several): choose the one the source cue shows.
  for (const facet of ['timepoint', 'analysisSet', 'adjustment', 'phase']) {
    const sel = c.getByLabel('Choose ' + facet, { exact: true });
    if (!(await sel.count())) continue;
    const shown = await c.locator('p').filter({ hasText: new RegExp('^' + facet + ': ') }).first().textContent().catch(() => '');
    const value = (/^\w+: (.*?)(?: \(source cue|$)/.exec(shown || '') || [])[1];
    const options = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
    await sel.selectOption(options.includes(value) ? value : options[0]);
  }
  await c.getByLabel('Outcome measured').fill('continued antidepressants');
  await c.getByLabel('Timepoint (or not stated)').fill('6 months');
}

async function extractAndAdd(page, host, text, cueIncludes) {
  await host.getByLabel('Paste the exact paper text or table').fill(text);
  await host.getByLabel('Outcome to look for (used only to rank candidates)').fill('continued antidepressants');
  await host.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  await expect(host.locator('[role=status]').first()).toContainText('candidates');
  const chooser = host.getByLabel('Choose the source result to add');
  const opts = await chooser.locator('option').evaluateAll(os => os.map(o => ({ value: o.value, text: o.textContent })));
  const pick = opts.find(o => o.value !== '' && o.text.includes(cueIncludes));
  expect(pick, JSON.stringify(opts)).toBeTruthy();
  await chooser.selectOption(pick.value);
  return { opts, add: host.getByRole('button', { name: 'Add chosen result', exact: true }) };
}

test('persona walkthrough pack: paper text -> provenance -> app 9 -> Methods', async ({ page }) => {
  fs.rmSync(PACK, { recursive: true, force: true });
  fs.mkdirSync(PACK, { recursive: true });
  expect(PASTE).toContain('86/125 vs 78/133');
  expect(GOLD_ROW).toBeTruthy();
  const errors = []; page.on('pageerror', e => errors.push(e.message));

  await page.goto('/proportion-ma/index.html');
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  // Entry UI: the panel's Data entry tab when another lane has added it, otherwise a test container on the same page.
  const hasTab = await page.getByRole('tab', { name: 'Data entry', exact: true }).count() > 0;
  await page.evaluate(async () => {
    const add = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
    if (!window.AlmEntry) await add('../shared/alm-entry.js');
    if (!window.AlmEntryUI) await add('../shared/alm-entry-ui.js');
    if (!document.querySelector('link[href$="alm-entry.css"]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '../shared/alm-entry.css'; document.head.appendChild(l);
    }
  });
  const mode = await page.evaluate(({ app, hasTab }) => {
    const spec = window.AlmFeatures && window.AlmFeatures.get(app);
    const appEntry = spec && spec.entry && typeof spec.entry.apply === 'function' ? spec.entry : null;
    // Minimal inline spec when app 9 has no entry block yet: one printed arm -> one "events, n, label" line in #src.
    const entry = appEntry || {
      schema: 'proportion',
      usedAs: 'events and total of the chosen arm, entered as one study proportion (events, n); the app pools proportions on its selected transformation scale',
      apply(records) {
        const lines = records.map(r => `${r.xi}, ${r.ni}, ${String(r.study).replace(/[,\r\n]/g, ' ')}`);
        document.getElementById('src').value = lines.join('\n');
        document.getElementById('btn-run').click();
        return { ok: true, n: records.length };
      },
    };
    const host = document.createElement('section');
    host.id = 'persona-entry-host';
    host.setAttribute('aria-label', 'Data entry (persona walkthrough container)');
    host.style.cssText = 'margin:1rem;padding:1rem;border:2px dashed #888';
    const anchor = document.getElementById('alm-features');
    (anchor && anchor.parentNode ? anchor.parentNode : document.body).insertBefore(host, anchor ? anchor.nextSibling : null);
    window.__personaEntry = window.AlmEntryUI.mountProvenance(host, { schema: entry.schema, apply: entry.apply, usedAs: entry.usedAs });
    host.scrollIntoView();
    return { appEntry: !!appEntry, schema: entry.schema, usedAs: entry.usedAs };
  }, { app: APP, hasTab });
  console.log(`PERSONA entry UI: ${hasTab ? 'panel tab exists' : 'no Data entry tab in the panel'}; mounted in #persona-entry-host with ${mode.appEntry ? "app 9's entry spec" : 'an inline proportion spec'}`);
  const host = page.locator('#persona-entry-host');
  const hostText = () => host.innerText();

  // (1) empty entry
  await expect(host.getByLabel('Paste the exact paper text or table')).toHaveValue('');
  await expect(host.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  await capture(page, 1, 'empty-entry', 'Empty data-entry panel', await hostText(), { mode, hasTab });

  // (2) paste the paper's Results paragraph (exact substring of the fixture)
  await host.getByLabel('Paste the exact paper text or table').fill(PASTE);
  await host.getByLabel('Outcome to look for (used only to rank candidates)').fill('continued antidepressants');
  await expect(host.getByLabel('Paste the exact paper text or table')).toHaveValue(PASTE);
  await capture(page, 2, 'pasted-results-paragraph', 'Abstract Results paragraph pasted', await hostText(), { pasted: PASTE });

  // (3) detection: candidates and questions
  const { opts, add } = await extractAndAdd(page, host, PASTE, '86/125');
  await capture(page, 3, 'candidates-and-questions', 'Extracted candidates and questions', await hostText(), { candidates: opts });

  // (4) add the result twice (one row per printed arm) and answer every question / source field
  await add.click();
  await add.click();
  await expect(card(host, 1)).toHaveCount(1);
  await expect(card(host, 2)).toHaveCount(1);
  await fillCard(card(host, 1), LABELS[0], 0);
  await fillCard(card(host, 2), LABELS[1], 1);
  await capture(page, 4, 'answers-and-source-fields', 'Arms, facets, label, reference and location filled', await hostText());

  // (5) value highlights + "What we took and how we used it"
  for (const i of [1, 2]) {
    await expect(card(host, i).locator('pre.alm-entry-source mark')).toHaveCount(2);
    await expect(card(host, i).locator('p').filter({ hasText: /^From PRI-SMA 2016/ })).toContainText('We read:');
  }
  const sentences = await host.locator('p').filter({ hasText: /^From PRI-SMA 2016/ }).allTextContents();
  await capture(page, 5, 'highlights-and-sentence', 'Highlighted values and the "What we took" sentence', await hostText(), { sentences });

  // (6) deliberate error: a typo copy with 186/125 (events > n) -> blocking message, confirmation and Use disabled
  const typo = await extractAndAdd(page, host, TYPO, '186/125');
  await typo.add.click();
  await expect(card(host, 3)).toHaveCount(1);
  await fillCard(card(host, 3), 'PRI-SMA 2016 typo check', 0);
  const block = card(host, 3).locator('li').filter({ hasText: /^Block: |must be between/ });
  await expect(block.first()).toBeVisible();
  await expect(card(host, 3).getByLabel('I confirm this row')).toBeDisabled();
  await expect(host.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  await capture(page, 6, 'blocking-error', 'Deliberate error (186 events of 125): blocking message', await hostText(),
    { blocking: await block.allTextContents() });
  await card(host, 3).getByRole('button', { name: 'Remove this row', exact: true }).click();
  await expect(card(host, 3)).toHaveCount(0);

  // (7) confirm + Use these rows -> the app's result
  for (const i of [1, 2]) {
    const box = card(host, i).getByLabel('I confirm this row');
    await expect(box).toBeEnabled();
    await box.check();
  }
  const use = host.getByRole('button', { name: 'Use these rows', exact: true });
  await expect(use).toBeEnabled();
  await use.click();
  await expect(host.locator('[role=status]').first()).toContainText('Applied 2 confirmed rows.');
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  const src = await page.locator('#src').inputValue();
  const result = await page.locator('#res-body').innerText();
  const applied = await page.evaluate(() => window.__personaEntry.getResult().records);
  await capture(page, 7, 'confirmed-and-applied', 'Rows confirmed and applied; app 9 result', `${await hostText()}\n\n--- #src ---\n${src}\n\n--- app 9 result (#res-body) ---\n${result}`, { src, records: applied });

  // Gold comparison (one printed arm per row).
  const gold = [
    { field: 'intervention events', gold: GOLD_ROW.intervention_events, got: applied[0] && applied[0].xi },
    { field: 'intervention group size', gold: GOLD_ROW.intervention_group_size, got: applied[0] && applied[0].ni },
    { field: 'comparator events', gold: GOLD_ROW.comparator_events, got: applied[1] && applied[1].xi },
    { field: 'comparator group size', gold: GOLD_ROW.comparator_group_size, got: applied[1] && applied[1].ni },
  ];
  const nGold = gold.filter(g => g.got === g.gold).length;
  console.log(`PERSONA GOLD ${nGold}/${gold.length} ` + JSON.stringify(gold));

  // (8) provenance CSV export
  const [dl] = await Promise.all([page.waitForEvent('download'), host.getByRole('button', { name: 'Export provenance CSV', exact: true }).click()]);
  expect(dl.suggestedFilename()).toBe('provenance.csv');
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  fs.writeFileSync(path.join(PACK, '08-provenance.csv'), csv, 'utf8');
  expect(csv.split('\r\n')).toHaveLength(3);
  await capture(page, 8, 'provenance-csv', 'Provenance CSV export (content in 08-provenance.csv)', csv);

  // (9) Report text Methods paragraph with the provenance sentence (AlmTextUI on a test host; no Report text tab yet)
  const hasTextTab = await page.getByRole('tab', { name: 'Report text', exact: true }).count() > 0;
  await page.evaluate((app) => {
    const h = document.createElement('section');
    h.id = 'persona-text-host'; h.setAttribute('aria-label', 'Report text (persona walkthrough container)');
    h.style.cssText = 'margin:1rem;padding:1rem;border:2px dashed #888';
    document.getElementById('persona-entry-host').after(h);
    window.AlmTextUI.mount(h, { app, text: window.AlmTextSpecs[app] });
    h.scrollIntoView();
  }, APP);
  const methods = page.locator('#persona-text-host [data-para="methods"]');
  await expect(methods).toContainText('Data were extracted from');
  await capture(page, 9, 'report-text-methods', 'Report text with the provenance sentence in Methods',
    await page.locator('#persona-text-host').innerText(), { hasTextTab, methods: await methods.textContent() });

  // INDEX.md
  const lines = ['# Persona walkthrough pack — data entry (app 9, proportion-ma)', '',
    'Source: PMC5244530 (CC BY 4.0; doi:10.1186/s12875-016-0578-9) via hyesunyun/llm-meta-analysis@1bc768d4 (Yun et al. 2024, DEV split).',
    'Pasted text: the abstract Results paragraph, verbatim. Outcome: "' + GOLD_ROW.outcome + '".',
    `Entry UI: ${hasTab ? 'the panel has a Data entry tab' : 'no Data entry tab in the panel'}; AlmEntryUI provenance workflow mounted in a test container on /proportion-ma/ with ${mode.appEntry ? "app 9's entry spec" : 'an inline spec'} (schema ${mode.schema}).`,
    `Report text: ${hasTextTab ? 'the panel has a Report text tab' : 'no Report text tab in the panel'}; AlmTextUI mounted on a test host.`,
    'Study labels: the CC-BY text fixture carries no author names, so labels use the trial acronym (PRI-SMA) and 2016 from the DOI article number (s12875-016-…); a real user would type "Author Year" from the article header.',
    'Each printed arm is entered as one single-proportion row (schema proportion {study, xi, ni}); app 9 needs at least two rows.', '',
    '| Step | Title | Screenshot | Visible text | Provenance state |', '|---|---|---|---|---|',
    ...steps.map(s => `| ${s.n} | ${s.title} | ${s.base}.png | ${s.base}.txt | ${s.base}.json |`),
    '', 'Also: 08-provenance.csv (the exported CSV).', '',
    `## Extracted values vs gold (${nGold}/${gold.length} equal)`, '', '| Field | Gold | Extracted | Equal |', '|---|---|---|---|',
    ...gold.map(g => `| ${g.field} | ${g.gold} | ${g.got} | ${g.got === g.gold ? 'yes' : 'NO'} |`),
    '', '## All gold outcomes for this article (for comparison)', '',
    '| Outcome | Type | Int. events | Int. n | Comp. events | Comp. n | Notes |', '|---|---|---|---|---|---|---|',
    ...GOLD.map(g => `| ${g.outcome} | ${g.outcome_type} | ${g.intervention_events} | ${g.intervention_group_size} | ${g.comparator_events} | ${g.comparator_group_size} | ${g.notes} |`),
    ''];
  fs.writeFileSync(path.join(PACK, 'INDEX.md'), lines.join('\n'), 'utf8');
  expect(steps.map(s => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(errors).toEqual([]);
});
