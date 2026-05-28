/**
 * Accessibility regression for the nma-pro-v2 tab nav: proper ARIA tablist,
 * roving tabindex, and Arrow/Home/End keyboard navigation.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://127.0.0.1:8080/nma-pro-v2/nma-pro-v8.0.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('tab nav is an ARIA tablist with roving tabindex + arrow-key nav', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.tabs-nav[role="tablist"]') !== null, { timeout: 15000 });

  const state = await page.evaluate(() => {
    const nav = document.querySelector('.tabs-nav');
    const tabs = Array.from(nav.querySelectorAll('.tab-btn[data-tab]'));
    return {
      tablist: nav.getAttribute('role'),
      total: tabs.length,
      withRoleTab: tabs.filter(t => t.getAttribute('role') === 'tab').length,
      selected: tabs.filter(t => t.getAttribute('aria-selected') === 'true').length,
      activeTabindex0: tabs.filter(t => t.classList.contains('tab-btn--active') && t.tabIndex === 0).length,
      inactiveTabindexNeg1: tabs.filter(t => !t.classList.contains('tab-btn--active') && t.tabIndex === -1).length,
      firstControls: tabs[0].getAttribute('aria-controls'),
      firstPanelRole: document.getElementById(tabs[0].getAttribute('aria-controls'))?.getAttribute('role'),
    };
  });
  console.log('  a11y state:', JSON.stringify(state));

  expect(state.tablist).toBe('tablist');
  expect(state.withRoleTab).toBe(state.total);          // every tab has role=tab
  expect(state.selected).toBe(1);                        // exactly one selected
  expect(state.activeTabindex0).toBe(1);                 // active is focusable
  expect(state.inactiveTabindexNeg1).toBe(state.total - 1); // others removed from tab order
  expect(state.firstPanelRole).toBe('tabpanel');

  // Arrow-key navigation: focus active tab, ArrowRight should move + activate next.
  const before = await page.evaluate(() => {
    const a = document.querySelector('.tab-btn--active'); a.focus(); return a.dataset.tab;
  });
  await page.keyboard.press('ArrowRight');
  const after = await page.evaluate(() => ({
    focused: document.activeElement?.dataset?.tab,
    selected: document.activeElement?.getAttribute('aria-selected'),
  }));
  console.log(`  ArrowRight: ${before} -> ${after.focused} (selected=${after.selected})`);
  expect(after.focused).not.toBe(before);
  expect(after.selected).toBe('true');

  expect(errors, 'no console/page errors:\n' + errors.join('\n')).toEqual([]);
});
