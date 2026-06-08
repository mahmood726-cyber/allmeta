/**
 * design-behavior.spec.mjs — PICO/protocol Design builder compute core.
 *
 * Deterministic checks over window.__almDesign:
 *  - Review-question assembly from P/I/C/O.
 *  - Boolean strategy: multi-word terms quoted, synonyms OR-joined within a
 *    block, PICO blocks AND-joined.
 *  - Screening-term suggestion from PICO.
 *  - sr-project-v1 envelope shape (pico fields read by Search; screenTerms
 *    read by Screen).
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/design/';

const PICO = {
  framework: 'PICO', pop: 'adults with heart failure',
  int: 'SGLT2 inhibitors, dapagliflozin', comp: 'placebo',
  out: 'cardiovascular death, HF hospitalization',
};

test.describe('design', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') && t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => { if (m.type() === 'error' && !benign(m.text())) errs.push(m.text()); });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almDesign && typeof window.__almDesign.buildProject === 'function', { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('question, boolean, terms, envelope', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almDesign, { timeout: 10_000 });
    const res = await page.evaluate((pico) => {
      const A = window.__almDesign;
      return {
        q: A.buildQuestion(pico),
        bool: A.buildBoolean(pico),
        terms: A.suggestTerms(pico),
        proj: A.buildProject(pico),
        prompt: A.aiPrompt(pico),
      };
    }, PICO);

    expect(res.q).toContain('adults with heart failure');
    expect(res.q).toContain('cardiovascular death');
    expect(res.bool).toContain('"adults with heart failure"'); // multi-word quoted
    expect(res.bool).toContain('\nAND ');                       // blocks AND-joined
    expect(res.terms).toContain('SGLT2 inhibitors');            // suggested from PICO
    expect(res.proj._schema).toBe('sr-project-v1');
    expect(res.proj.pico.intervention).toContain('SGLT2');
    expect(res.proj.screenTerms.include.length).toBeGreaterThan(0);
    expect(res.prompt).toContain('"search"');                   // structured AI ask
  });
});
