// a11y-sweep — portfolio-wide axe-core WCAG 2.1 AA discovery scan.
//
// Mirrors the R-parity sweep philosophy: this is a DISCOVERY baseline, not a
// red gate. Green == the sweep ran across every app. The deliverable is the
// ranked artifact written to a11y-findings.{json,md}: violations grouped by
// axe rule id and ranked by (impact, cross-app count) so the handful of
// structural defects shared across ~70 template-derived single-file apps
// float to the top for one-pass fixing.
//
// Promote to a red gate (per-rule allowlist) only after the first batch of
// common structural fixes lands and a clean-ish baseline exists.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Apps with a top-level index.html, excluding infra/non-app dirs.
const APPS = [
  'HTA', 'IPD-Meta-Pro', 'Pairwiseai', 'Truthcert1', 'amstar-2', 'bayesian-ma',
  'bayesian-mcmc', 'bayesian-nma', 'bucher', 'cerqual', 'citation-chaser',
  'citation-dedup', 'component-nma', 'copas', 'courses', 'cumulative-subgroup',
  'dosehtml', 'dta-sroc', 'effect-size-converter', 'evidence-board',
  'evidenceos', 'focus-studio', 'forest-plot', 'funnel-plot', 'gosh',
  'gosh-metareg', 'grade-sof', 'heterogeneity', 'hsroc', 'influence',
  'kanban-lab', 'km-reconstructor', 'limit-ma', 'living-meta', 'local-ai',
  'mcid', 'median-to-mean', 'meta-regression', 'mh-peto', 'multilevel-ma',
  'nma', 'nma-dose-response-app', 'nma-global-inconsistency',
  'nma-inconsistency', 'nma-pro-v2', 'p-curve', 'pet-peese', 'pico', 'powerma',
  'prisma-checklist', 'prisma-flow', 'prisma-nma', 'prisma-screen',
  'proportion-ma', 'pubbias-tests', 'quadas-2', 'rct-extractor',
  'rob-traffic-light', 'rob2', 'robins-e', 'robins-i', 'search-translator',
  'thematic-synthesis', 'tsa', 'webr-pilot', 'webr-studio', 'webr-validator',
  'workbench', 'workflow',
];

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const IMPACT_RANK = { critical: 4, serious: 3, moderate: 2, minor: 1, null: 0 };

test('a11y portfolio sweep (discovery baseline)', async ({ page }) => {
  test.setTimeout(15 * 60 * 1000); // ~70 apps, sequential

  const perApp = {};
  const ruleAgg = {}; // ruleId -> { impact, help, helpUrl, apps:Set, nodes }

  for (const app of APPS) {
    const url = `/${app}/index.html`;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 20_000 });
      // Let CSS/fonts settle so colour-contrast checks are accurate.
      await page.waitForTimeout(800);

      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

      const vios = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.length,
      }));
      perApp[app] = { ok: true, count: vios.length, violations: vios };

      for (const v of results.violations) {
        const r = (ruleAgg[v.id] ??= {
          impact: v.impact, help: v.help, helpUrl: v.helpUrl,
          apps: new Set(), nodes: 0,
        });
        r.apps.add(app);
        r.nodes += v.nodes.length;
      }
    } catch (err) {
      perApp[app] = { ok: false, error: String(err).split('\n')[0] };
    }
  }

  // Rank rules: impact desc, then breadth (# apps) desc, then nodes desc.
  const ranked = Object.entries(ruleAgg)
    .map(([id, r]) => ({
      id, impact: r.impact, apps: r.apps.size, nodes: r.nodes,
      help: r.help, helpUrl: r.helpUrl,
    }))
    .sort((a, b) =>
      (IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]) ||
      (b.apps - a.apps) || (b.nodes - a.nodes));

  const scanned = Object.values(perApp).filter((a) => a.ok).length;
  const failed = Object.entries(perApp).filter(([, a]) => !a.ok).map(([k]) => k);
  const totalVios = Object.values(perApp)
    .reduce((s, a) => s + (a.ok ? a.count : 0), 0);

  const payload = {
    generated: new Date().toISOString(),
    appsScanned: scanned,
    appsFailedToLoad: failed,
    totalViolationInstances: totalVios,
    rankedRules: ranked,
    perApp,
  };
  writeFileSync(join(__dirname, 'a11y-findings.json'),
    JSON.stringify(payload, null, 2));

  // Human-readable ranked report.
  const md = [];
  md.push('# a11y portfolio sweep — discovery baseline');
  md.push('');
  md.push(`Generated: ${payload.generated}`);
  md.push(`Apps scanned: ${scanned}/${APPS.length}` +
    (failed.length ? ` (failed to load: ${failed.join(', ')})` : ''));
  md.push(`Total violation instances: ${totalVios}`);
  md.push('');
  md.push('## Ranked rules (fix top-down — breadth = one fix, many apps)');
  md.push('');
  md.push('| Rank | Rule | Impact | Apps | Nodes | Description |');
  md.push('|-----:|------|--------|-----:|------:|-------------|');
  ranked.forEach((r, i) => {
    md.push(`| ${i + 1} | \`${r.id}\` | ${r.impact ?? 'n/a'} | ${r.apps} | ` +
      `${r.nodes} | ${r.help} |`);
  });
  md.push('');
  md.push('## Per-app violation counts');
  md.push('');
  md.push('| App | Rule violations | Status |');
  md.push('|-----|----------------:|--------|');
  for (const app of APPS) {
    const a = perApp[app];
    md.push(`| ${app} | ${a.ok ? a.count : '—'} | ` +
      `${a.ok ? 'scanned' : 'LOAD FAIL: ' + a.error} |`);
  }
  writeFileSync(join(__dirname, '..', 'a11y-findings.md'), md.join('\n') + '\n');

  // Discovery pass: only assert the sweep itself completed across the fleet.
  console.log(`a11y sweep: ${scanned}/${APPS.length} apps, ` +
    `${ranked.length} distinct rules, ${totalVios} instances`);
  expect(scanned, `apps that failed to load: ${failed.join(', ')}`)
    .toBeGreaterThanOrEqual(APPS.length - 3);
});
