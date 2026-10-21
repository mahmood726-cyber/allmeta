// Data-entry UX + integrity fixes U1-U8 from the multi-persona review (clinician, student, non-native speaker),
// asserted on the persona walkthrough flow (PR #189, scripts/personas/walkthrough.spec.mjs) for app 9 (proportion-ma).
// Source: PMC5244530 abstract Results paragraph (CC BY 4.0; fixtures/personas/LICENCE.md), outcome
// "continued antidepressants until the 6 month follow-up (86/125 vs 78/133)". One printed arm per single-proportion row.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MD = fs.readFileSync(path.join(HERE, 'fixtures', 'personas', 'PMC5244530.md'), 'utf8');
const START = MD.indexOf('## Results ') + '## Results '.length;
const PASTE = MD.slice(START, MD.indexOf(' ## Conclusions', START));
const TYPO = PASTE.replace('86/125', '186/125');
const REFERENCE = 'PRI-SMA trial report, BMC Family Practice; doi:10.1186/s12875-016-0578-9 (PMC5244530)';
const NOTICE = 'These rows are different arms of ONE trial. This app pools single groups; it does not compare arms. To compare intervention with control, use a two-group analysis.';

async function mountEntry(page, id, provenance = true) {
  await page.evaluate(async ({ id, provenance }) => {
    const add = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
    if (!window.AlmEntry) await add('../shared/alm-entry.js');
    if (!window.AlmEntryUI) await add('../shared/alm-entry-ui.js');
    if (!document.querySelector('link[href$="alm-entry.css"]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '../shared/alm-entry.css'; document.head.appendChild(l);
      await new Promise(r => { l.onload = r; l.onerror = r; });
    }
    const host = document.createElement('section');
    host.id = id; host.setAttribute('aria-label', 'Data entry test container');
    document.querySelector('main, body').prepend(host);
    const entry = {
      schema: 'proportion',
      usedAs: 'events and total of the chosen arm, entered as one study proportion (events, n)',
      apply(records) {
        document.getElementById('src').value = records.map(r => `${r.xi}, ${r.ni}, ${String(r.study).replace(/[,\r\n]/g, ' ')}`).join('\n');
        document.getElementById('btn-run').click();
        return { ok: true, n: records.length };
      },
    };
    window['__' + id] = provenance ? window.AlmEntryUI.mountProvenance(host, entry) : window.AlmEntryUI.mount(host, { schema: 'proportion', apply: () => ({ ok: false }) });
  }, { id, provenance });
  return page.locator('#' + id);
}
// RFC-4180: quoted cells, "" escapes, CRLF rows.
function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  row.push(cell); rows.push(row);
  return rows;
}
const card = (host, i) => host.locator('fieldset').filter({ has: host.page().locator('legend', { hasText: new RegExp(`^Study source ${i}$`) }) });

async function fillCard(c, label, arm, unit = 'individuals') {
  const initials = c.page().getByLabel('Your initials (recorded with each confirmation)');
  if (!(await initials.first().inputValue())) await initials.first().fill('MA');
  await c.getByLabel('Study label (author and year, e.g. Smith 2019)').fill(label);
  await c.getByLabel('Full reference').fill(REFERENCE);
  await c.getByLabel('Source type', { exact: true }).selectOption('Abstract');
  await c.getByLabel('Location: number or page (e.g. 2, p. 5 or Results paragraph)').fill('Results paragraph');
  if (unit) await c.getByLabel('What was randomised?', { exact: true }).selectOption(unit);
  await c.getByLabel('DOI', { exact: true }).fill('10.1186/s12875-016-0578-9');
  await c.getByLabel('Arm to use', { exact: true }).selectOption(String(arm));
  await c.getByLabel('Outcome measured').fill('continued antidepressants');
}

test('entry UX U1-U8 on PMC5244530 (app 9): arm integrity, same-source guard, evidence, plain words', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/proportion-ma/index.html');
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  const host = await mountEntry(page, 'entry-ux-host');
  const pasteBox = host.getByLabel('Paste the exact paper text or table');

  // U8 layout: Extract is the primary button directly under the paste box; fixed counts note.
  const order = await host.locator('section.alm-entry > *').evaluateAll(es => es.map(e => e.tagName + ':' + e.textContent.trim().slice(0, 40)));
  const ta = order.findIndex(s => s.startsWith('TEXTAREA'));
  expect(order[ta + 1]).toBe('BUTTON:Extract candidates');
  await expect(host.getByRole('button', { name: 'Extract candidates', exact: true })).toHaveClass(/alm-entry-primary/);
  await expect(host.getByText('Percentages and p-values are never used as counts.', { exact: true })).toBeVisible();

  await pasteBox.fill(PASTE);
  await host.getByLabel('Outcome to look for (used only to rank candidates)').fill('continued antidepressants');
  await host.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  // U8: plural, "Best match" wording, no rank/score/rule IDs on screen.
  await expect(host.locator('[role=status]').first()).toContainText(/^1 candidate\./);
  const chooser = host.getByLabel('Choose the source result to add');
  const opts = await chooser.locator('option').allTextContents();
  expect(opts).toContain("Best match for 'continued antidepressants': 86/125 vs 78/133");
  expect(await host.innerText()).not.toMatch(/Rank \d|score \d|R-[A-Z]+-\d|\bxi\b|\bni\b/);
  // Facet prompts are not listed globally: only inside each card.
  expect(await host.innerText()).not.toContain('Choose the timepoint for this result.');
  await chooser.selectOption({ label: "Best match for 'continued antidepressants': 86/125 vs 78/133" });
  const add = host.getByRole('button', { name: 'Add chosen result', exact: true });
  await add.click(); await add.click();
  const c1 = card(host, 1), c2 = card(host, 2);
  await fillCard(c1, 'PRI-SMA 2016 intervention arm', 0);
  await fillCard(c2, 'PRI-SMA 2016 TAU arm', 1);

  // U1: arm options show the words next to EACH number; the role is required with no default.
  const armOpts = await c2.getByLabel('Arm to use', { exact: true }).locator('option').allTextContents();
  expect(armOpts).toEqual(['Choose…', 'Printed arm 1: 86 of 125 (text next to it: “in the intervention group”)', 'Printed arm 2: 78 of 133 (no arm phrase recognised next to these numbers)']);
  const role2 = c2.getByLabel('This arm is', { exact: true });
  await expect(role2).toHaveValue('');
  expect(await role2.locator('option').allTextContents()).toEqual(['Choose…', 'Intervention', 'Control (usual care, placebo)', 'Other']);

  // U4: one merged timepoint control with evidence; nothing preselected; warning when not nearest.
  const tp2 = c2.getByLabel('Timepoint', { exact: true });
  await expect(tp2).toHaveValue('');
  expect(await tp2.locator('option').allTextContents()).toEqual(['Choose…', '6 month — written next to these numbers', '12 month — elsewhere in the paste', 'Not stated', 'Other…']);
  await expect(c2.getByLabel('Timepoint (or not stated)')).toHaveCount(0);
  await tp2.selectOption('12 month');
  await expect(c2).toContainText('The timepoint written next to these numbers is "6 month"; you chose "12 month". Check the paper.');
  await tp2.selectOption('__other__');
  await expect(c2.getByLabel('Other timepoint (as written in the paper)')).toBeVisible();
  await tp2.selectOption('6 month');
  await expect(c2.getByLabel('Other timepoint (as written in the paper)')).toBeHidden();

  // U6: plain denominator question for counts; adjustment/phase hidden.
  const den2 = c2.getByLabel('Who is counted in 133?', { exact: true });
  expect(await den2.locator('option').allTextContents()).toEqual(['Choose…', 'All randomised (ITT)', 'Only those followed up', 'Not stated']);
  await expect(c2.getByText(/^Choose (phase|adjustment)|^Type of value/)).toHaveCount(0);

  // U5: checkbox enabled only after role + timepoint (+ denominator) are CHOSEN.
  const confirm2 = c2.getByLabel('I confirm this row');
  await expect(confirm2).toBeDisabled();
  // U1 regression: TAU row as Intervention -> blocked until acknowledged; as Control -> facet "control", never "intervention".
  await role2.selectOption('intervention');
  await den2.selectOption('not stated');
  await expect(c2.locator('.alm-entry-arm-check')).toContainText('The row label "PRI-SMA 2016 TAU arm" suggests Control, but you chose Intervention.');
  await expect(confirm2).toBeDisabled();
  await role2.selectOption('control');
  await expect(c2.locator('.alm-entry-arm-check')).toBeHidden();
  await expect(confirm2).toBeEnabled();
  await expect(c2.locator('.alm-entry-line')).toHaveText('78 events of 133 · Control · continued antidepressants · 6 month · counted: not stated · randomised: individuals');

  // U1: cue 'intervention group' vs role Control on row 1 -> blocked until the explicit acknowledgement.
  await c1.getByLabel('This arm is', { exact: true }).selectOption('control');
  await c1.getByLabel('Timepoint', { exact: true }).selectOption('6 month');
  await c1.getByLabel('Who is counted in 125?', { exact: true }).selectOption('ITT');
  await expect(c1.locator('.alm-entry-arm-check')).toContainText('The text next to these numbers says "in the intervention group", but you chose Control.');
  await expect(c1.getByLabel('I confirm this row')).toBeDisabled();
  await c1.getByLabel('I have checked the arm in the paper and my choice is correct').check();
  await expect(c1.getByLabel('I confirm this row')).toBeEnabled();
  await c1.getByLabel('This arm is', { exact: true }).selectOption('intervention');
  await expect(c1.locator('.alm-entry-arm-check')).toBeHidden();

  // U1: the same printed arm twice from one source is flagged.
  await c2.getByLabel('Arm to use', { exact: true }).selectOption('0');
  await expect(c1.locator('.alm-entry-todo')).toContainText('Rows 1 and 2 use the same printed numbers (86 of 125).');
  await c2.getByLabel('Arm to use', { exact: true }).selectOption('1');
  await c2.getByLabel('Who is counted in 133?', { exact: true }).selectOption('not stated');
  await expect(c1.locator('.alm-entry-todo')).toBeEmpty();

  // U5: structured line, source clause with the numbers highlighted, full paste behind a disclosure; confirm next to it.
  await expect(c1.locator('.alm-entry-line')).toHaveText('86 events of 125 · Intervention · continued antidepressants · 6 month · counted: all randomised (ITT) · randomised: individuals');
  await expect(c1.locator('.alm-entry-clause')).toContainText('However, significantly more patients in the intervention group continued antidepressants');
  await expect(c1.locator('.alm-entry-clause mark')).toHaveCount(2);
  await expect(c1.locator('.alm-entry-clause')).not.toContainText('12-month');
  await expect(c1.locator('details > summary')).toHaveText('Show full pasted text');
  await expect(c1.locator('details pre.alm-entry-source')).toBeHidden();
  const next = await c1.locator('.alm-entry-clause').evaluate(e => e.nextElementSibling.textContent);
  expect(next).toBe('I confirm this row');

  for (const c of [c1, c2]) await c.getByLabel('I confirm this row').check();

  // U2: blocking same-source notice with explicit opt-in before "Use these rows".
  const use = host.getByRole('button', { name: 'Use these rows', exact: true });
  const notice = host.locator('.alm-entry-same-source');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(NOTICE);
  await expect(use).toBeDisabled();
  const axe = await new AxeBuilder({ page }).include('#entry-ux-host').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = axe.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  expect(serious.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ") + " " + n.failureSummary).join(" | ")}`)).toEqual([]);
  await host.getByLabel('I understand these rows are arms of one trial and want them pooled as separate single groups').check();
  await expect(use).toBeEnabled();

  // U8 + N6: the label tracks the confirmed rows' OWN sources; another paper in the paste box changes nothing.
  await pasteBox.fill('Another paper: 3/40 vs 5/41');
  await expect(host.locator('label', { hasText: 'Paste the exact paper text or table' })).not.toContainText('Edited since confirmation');
  await expect(use).toBeEnabled();
  await pasteBox.fill(PASTE);
  await expect(host.locator('label', { hasText: 'Paste the exact paper text or table' })).not.toContainText('Edited since confirmation');

  await use.click();
  await expect(host.locator('[role=status]').first()).toContainText('Applied 2 confirmed rows. Data were extracted from 1 report (2 arms).');
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  const state = await page.evaluate(() => ({ prov: window.AlmFeaturesState.provenance, summary: window.AlmFeaturesState.provenanceSummary }));
  expect(state.summary).toEqual({ reports: 1, rows: 2, arms: 2 });
  expect(state.prov.map(r => r.facets.arm)).toEqual(['intervention', 'control']);
  expect(state.prov[1].armCue).toBeNull();
  expect(state.prov.every(r => r.sameSourceOptIn && r.sameSourceOptIn.acknowledged)).toBe(true);
  expect(state.prov.map(r => r.facets.analysisSet)).toEqual(['ITT', 'not stated']);

  // CSV stores the chosen role and the printed cue separately.
  const [dl] = await Promise.all([page.waitForEvent('download'), host.getByRole('button', { name: 'Export provenance CSV', exact: true }).click()]);
  const csv = parseCSV(fs.readFileSync(await dl.path(), 'utf8'));
  expect(csv).toHaveLength(3);
  const head = csv[0];
  const col = (row, name) => row[head.indexOf(name)];
  expect(col(csv[1], 'armRole')).toBe('intervention');
  expect(col(csv[1], 'armCue')).toBe('in the intervention group');
  expect(col(csv[2], 'armRole')).toBe('control');
  expect(col(csv[2], 'armCue')).toBe('none next to these numbers');
  expect(col(csv[1], 'candidateRank')).toBe('1');

  // U3: impossible counts in free text are SHOWN as a flagged candidate (never skipped).
  await pasteBox.fill(TYPO);
  await host.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  await expect(host.locator('[role=status]').first()).toContainText('1 candidate (1 flagged: check the paper)');
  expect(await host.getByLabel('Choose the source result to add').locator('option').allTextContents()).toContain('Found 186/125 — events cannot exceed the total; check the paper');

  // U7: comma between digits -> "ask" with a preview of the parsed numbers.
  await pasteBox.fill('Mean age 68,8 years (SD 12,1)');
  const decimal = host.getByLabel('Decimal mark in this paste (1.5 = point, 1,5 = comma)', { exact: true });
  await expect(decimal).toHaveValue('ask');
  await expect(host.locator('.alm-entry-decimals')).toContainText('68,8: choose the decimal mark');
  await decimal.selectOption('comma');
  await expect(host.locator('.alm-entry-decimals')).toContainText('68,8 read as 68.8 — correct?');

  // U8 table workflow: schema columns first, plain block text, plurals.
  const table = await mountEntry(page, 'entry-ux-table', false);
  await table.locator('textarea').fill('Study\tEvents\tTotal\nPRI-SMA 2016 intervention arm\t186\t125');
  await table.getByRole('button', { name: 'Preview and convert', exact: true }).click();
  await expect(table.locator('li.alm-entry-block').first()).toHaveText("⛔ Block: Events (186) cannot be more than the total in this group (125). Check row 'PRI-SMA 2016 intervention arm'.");
  expect(await table.locator('select[id$="map-1"] option').allTextContents()).toEqual(['Ignore column', 'Study label', 'events', 'total in this group']);
  await table.getByRole('button', { name: 'More column types…', exact: true }).click();
  expect((await table.locator('select[id$="map-1"] option').allTextContents()).length).toBeGreaterThan(10);
  await expect(table.locator('[role=status]')).toHaveText('1 row; 2 blocking issues; 1 warning.');
  expect(await table.innerText()).not.toMatch(/\bxi\b|\bni\b/);
  expect(errors).toEqual([]);
});

test('PLANTED DEFECT: first-cue arm stamping (the persona P1 bug) is caught by the arm gate', async ({ page }) => {
  await page.goto('/proportion-ma/index.html');
  const host = await mountEntry(page, 'entry-ux-planted');
  // Plant the old behaviour: every printed arm inherits the first arm cue in the sentence.
  await page.evaluate(() => {
    const real = window.AlmEntry.extract;
    window.AlmEntry.extract = (...a) => { const out = real(...a); out.candidates.forEach(c => { if (c.armCues) c.armCues = c.armCues.map(() => c.armCues[0]); }); return out; };
  });
  await host.getByLabel('Paste the exact paper text or table').fill(PASTE);
  await host.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  await host.getByLabel('Choose the source result to add').selectOption('0');
  await host.getByRole('button', { name: 'Add chosen result', exact: true }).click();
  const c = card(host, 1);
  await fillCard(c, 'PRI-SMA 2016 TAU arm', 1);
  await c.getByLabel('This arm is', { exact: true }).selectOption('control');
  await c.getByLabel('Timepoint', { exact: true }).selectOption('6 month');
  await c.getByLabel('Who is counted in 133?', { exact: true }).selectOption('not stated');
  // The planted cue contradicts the TAU row's Control role, so the gate must FAIL (confirmation blocked).
  await expect(c.locator('.alm-entry-arm-check')).toContainText('says "in the intervention group", but you chose Control');
  await expect(c.getByLabel('I confirm this row')).toBeDisabled();
});

// Second-batch personas (guideline methodologist, Cochrane statistician, journal peer reviewer): N1-N6.
test('entry N1-N6 on PMC5244530 (app 9): randomisation unit + design effect, not stated, structured source, outcome definition, initials, compare, source hash', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/proportion-ma/index.html');
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  const host = await mountEntry(page, 'entry-n-host');
  const pasteBox = host.getByLabel('Paste the exact paper text or table');
  await pasteBox.fill(PASTE);
  await host.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  await host.getByLabel('Choose the source result to add').selectOption('0');
  const add = host.getByRole('button', { name: 'Add chosen result', exact: true });
  await add.click(); await add.click();
  const c1 = card(host, 1), c2 = card(host, 2);
  await fillCard(c1, 'PRI-SMA 2016 intervention arm', 0, '');
  await fillCard(c2, 'PRI-SMA 2016 TAU arm', 1, '');
  await c1.getByLabel('This arm is', { exact: true }).selectOption('intervention');
  await c2.getByLabel('This arm is', { exact: true }).selectOption('control');
  for (const [c, n] of [[c1, 125], [c2, 133]]) {
    await c.getByLabel('Timepoint', { exact: true }).selectOption('6 month');
    await c.getByLabel(`Who is counted in ${n}?`, { exact: true }).selectOption('not stated');
  }

  // N1: required unit of randomisation; PRI-SMA randomised GPs (clusters).
  const unit1 = c1.getByLabel('What was randomised?', { exact: true });
  expect(await unit1.locator('option').allTextContents()).toEqual(['Choose…', 'Individuals', 'Clusters (e.g. practices)', 'Crossover periods', 'Not randomised', 'Not stated']);
  await expect(c1.getByLabel('I confirm this row')).toBeDisabled();
  await expect(c1.locator('.alm-entry-todo')).toContainText('Say what was randomised');
  await expect(c1.locator('.alm-entry-cluster')).toBeHidden();
  await unit1.selectOption('clusters');
  await expect(c1.locator('.alm-entry-cluster')).toBeVisible();
  await c1.getByLabel('Number of clusters').fill('45');
  await c1.getByLabel('Total participants in all clusters').fill('258');
  await c1.getByLabel('ICC (intracluster correlation)').fill('0.02');
  await c1.getByLabel('Source of the ICC or design effect').selectOption('external');
  await c1.getByLabel('Adjust for clustering?').selectOption('adjust');
  const de = 1 + (258 / 45 - 1) * 0.02;
  await expect(c1.locator('.alm-entry-cluster-preview')).toHaveText(`Design effect = 1 + (M − 1) × ICC = ${de.toFixed(3)} (M = 258 / 45); events 86 → ${+(86 / de).toFixed(2)}, total in this group 125 → ${+(125 / de).toFixed(2)} (entered as ${Math.round(86 / de)} of ${Math.round(125 / de)})`);
  await expect(c1.locator('.alm-entry-line')).toContainText(`randomised: clusters (adjusted, design effect ${+de.toFixed(3)})`);
  await c2.getByLabel('What was randomised?', { exact: true }).selectOption('clusters');
  await c2.getByLabel('Adjust for clustering?').selectOption('decline');
  await expect(c2.locator('.alm-entry-line')).toContainText('randomised: clusters (not adjusted)');
  await expect(c2).toContainText('Cluster-randomised trial not adjusted for clustering');

  // N3: structured source with the abstract warning and an optional "Verified against".
  expect(await c1.getByLabel('Source type', { exact: true }).locator('option').allTextContents()).toEqual(['Choose…', 'Abstract', 'Table', 'Figure', 'Text', 'Supplement', 'Registry']);
  await expect(c1.locator('.alm-entry-abstract-note')).toHaveText('Abstracts often round values or differ from the full-text tables; check the full text if available.');
  await c1.getByLabel('Verified against (optional, e.g. Table 2 of the full text)').fill('Table 2');
  await c2.getByLabel('Source type', { exact: true }).selectOption('Table');
  await expect(c2.locator('.alm-entry-abstract-note')).toBeHidden();
  await c2.getByLabel('Source type', { exact: true }).selectOption('Abstract');

  // N2: outcome definition taken from the selection in the paste box (stored with its span).
  const phrase = PASTE.slice(PASTE.indexOf('continued antidepressants until'), PASTE.indexOf(' (86/125'));
  await pasteBox.evaluate((e, [a, b]) => { e.focus(); e.setSelectionRange(a, b); }, [PASTE.indexOf(phrase), PASTE.indexOf(phrase) + phrase.length]);
  await c1.getByRole('button', { name: 'Use the text selected in the paste box', exact: true }).click();
  await expect(c1.getByLabel('Outcome as defined in the paper (optional, verbatim)')).toHaveValue(phrase);

  // N4 + N5: initials recorded; "not stated" choices are user statements.
  for (const c of [c1, c2]) { await expect(c.getByLabel('I confirm this row')).toBeEnabled(); await c.getByLabel('I confirm this row').check(); }
  await host.getByLabel('I understand these rows are arms of one trial and want them pooled as separate single groups').check();
  const use = host.getByRole('button', { name: 'Use these rows', exact: true });
  await expect(use).toBeEnabled();
  const axe = await new AxeBuilder({ page }).include('#entry-n-host').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);

  // N6: a second paper in the paste box never marks the confirmed rows (each row keeps its own source).
  await pasteBox.fill('Another paper: 3/40 vs 5/41 had the outcome.');
  await host.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  await expect(c1.locator('.alm-entry-source-changed')).toBeHidden();
  await expect(c1.getByLabel('I confirm this row')).toBeChecked();
  await expect(use).toBeEnabled();
  // PLANTED: a row whose own stored source no longer matches its hash is marked and blocks "Use these rows".
  const tamper = (restore) => page.evaluate((restore) => {
    const rec = window['__entry-n-host'].getResult().provenance[0];
    window.__own = window.__own || rec.pastedText;
    rec.pastedText = restore ? window.__own : window.__own.slice(0, 20) + (window.__own[20] === '#' ? '%' : '#') + window.__own.slice(21);
  }, restore);
  await tamper(false);
  await pasteBox.fill(PASTE);
  await expect(c1.locator('.alm-entry-source-changed')).toBeVisible();
  await expect(c1.locator('.alm-entry-source-changed')).toContainText('Source text changed since confirmation');
  await expect(use).toBeDisabled();
  const axeChanged = await new AxeBuilder({ page }).include('#entry-n-host').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axeChanged.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id)).toEqual([]);
  await tamper(true);
  await pasteBox.fill(PASTE + ' ');
  await pasteBox.fill(PASTE);
  await expect(c1.locator('.alm-entry-source-changed')).toBeHidden();
  await expect(use).toBeEnabled();

  await use.click();
  const status = host.locator('[role=status]').first();
  await expect(status).toContainText('Applied 2 confirmed rows.');
  await expect(status).toContainText('1 row from a cluster-randomised trial was not adjusted for clustering (flag CLUSTER_NOT_ADJUSTED)');
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  expect(await page.locator('#src').inputValue()).toBe(`${Math.round(86 / de)}, ${Math.round(125 / de)}, PRI-SMA 2016 intervention arm\n78, 133, PRI-SMA 2016 TAU arm`);
  const state = await page.evaluate(() => ({ prov: window.AlmFeaturesState.provenance, methods: window.AlmFeaturesState.entryMethods }));
  expect(state.prov.map(r => r.confirmedBy)).toEqual(['MA', 'MA']);
  expect(state.prov.map(r => r.confirmedVia)).toEqual(['row', 'row']);
  expect(state.prov[0].conversions.find(c => c.fn === 'clusterCounts').output).toEqual({ events: 86 / de, n: 125 / de, designEffect: de });
  expect(state.prov[0].source).toEqual({ type: 'Abstract', detail: 'Results paragraph', verifiedAgainst: 'Table 2' });
  expect(state.prov[0].outcomeDefinition.text).toBe(phrase);
  expect(state.methods.join(' ')).toContain('Cochrane Handbook v6.5 §23.1.4');

  // CSV: initials, how confirmed, hash, design, structured source and NOT_STATED_* flags.
  const [dl] = await Promise.all([page.waitForEvent('download'), host.getByRole('button', { name: 'Export provenance CSV', exact: true }).click()]);
  const csvText = fs.readFileSync(await dl.path(), 'utf8');
  const csv = parseCSV(csvText), head = csv[0], col = (row, name) => row[head.indexOf(name)];
  expect(col(csv[1], 'confirmedBy')).toBe('MA');
  expect(col(csv[1], 'confirmedVia')).toBe('row');
  expect(col(csv[1], 'sourceHash')).toMatch(/^[0-9a-f]{64}$/);
  expect(col(csv[1], 'randomisation')).toBe('clusters');
  expect(col(csv[1], 'sourceType')).toBe('Abstract');
  expect(col(csv[1], 'verifiedAgainst')).toBe('Table 2');
  expect(col(csv[2], 'flags')).toContain('CLUSTER_NOT_ADJUSTED');
  expect(col(csv[1], 'flags')).toContain('NOT_STATED_ANALYSISSET');

  // N4: compare with a second extractor's CSV (read-only differences).
  const theirs = csvText.replace('""value"":86', '""value"":85');
  expect(theirs).not.toBe(csvText);
  await host.getByLabel('Compare with another extraction (CSV)').setInputFiles({ name: 'second.csv', mimeType: 'text/csv', buffer: Buffer.from(theirs, 'utf8') });
  await expect(host.locator('.alm-entry-compare')).toContainText('1 difference between this extraction and the other one. Read-only: nothing here was changed.');
  await expect(host.locator('.alm-entry-compare')).toContainText('value xi: 86 here, 85 in the other extraction');
  expect(errors).toEqual([]);
});

test('PLANTED DEFECT: a design-effect conversion stored with the wrong formula is refused at "Use these rows"', async ({ page }) => {
  await page.goto('/proportion-ma/index.html');
  const host = await mountEntry(page, 'entry-n-planted');
  await host.getByLabel('Paste the exact paper text or table').fill(PASTE);
  await host.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  await host.getByLabel('Choose the source result to add').selectOption('0');
  await host.getByRole('button', { name: 'Add chosen result', exact: true }).click();
  const c = card(host, 1);
  await fillCard(c, 'PRI-SMA 2016 intervention arm', 0, 'clusters');
  await c.getByLabel('This arm is', { exact: true }).selectOption('intervention');
  await c.getByLabel('Timepoint', { exact: true }).selectOption('6 month');
  await c.getByLabel('Who is counted in 125?', { exact: true }).selectOption('ITT');
  await c.getByLabel('Mean cluster size (M)').fill('5');
  await c.getByLabel('ICC (intracluster correlation)').fill('0.05');
  await c.getByLabel('Source of the ICC or design effect').selectOption('this paper');
  await c.getByLabel('Adjust for clustering?').selectOption('adjust');
  await c.getByLabel('I confirm this row').check();
  const use = host.getByRole('button', { name: 'Use these rows', exact: true });
  await expect(use).toBeEnabled();
  const before = await page.locator('#src').inputValue();
  // Plant 1 + M x ICC (instead of 1 + (M - 1) x ICC) into the confirmed record's logged conversion.
  await page.evaluate(() => {
    const rec = window['__entry-n-planted'].getResult().provenance[0];
    const conv = rec.conversions.find(x => x.fn === 'clusterCounts'), wrong = 1 + 5 * 0.05;
    conv.result = conv.output = { events: 86 / wrong, n: 125 / wrong, designEffect: wrong };
  });
  await use.click();
  await expect(host.locator('[role=status]').first()).not.toContainText('Applied');
  expect(await page.locator('#src').inputValue()).toBe(before);
  // Nothing was stored: the panel host may initialise provenance to [], but the refused snapshot never lands.
  expect(await page.evaluate(() => (window.AlmFeaturesState || {}).provenance || [])).toEqual([]);
});
