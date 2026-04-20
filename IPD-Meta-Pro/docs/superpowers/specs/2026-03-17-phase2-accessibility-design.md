# Phase 2: Accessibility — WCAG AA Compliance

**Date:** 2026-03-17
**Project:** IPD-Meta-Pro
**Goal:** Make IPD-Meta-Pro fully keyboard-navigable and screen-reader compatible (WCAG 2.1 AA)

## Current State
- 14 canvas plots with `role="img"` + `aria-label` (good)
- Modal dialogs have `role="dialog"`, `aria-modal`, Escape key (good)
- Global Ctrl+Z/Y/S shortcuts (good)
- 103 form labels (good)
- **0 aria-live regions, 0 skip links, 0 semantic landmarks**
- **16 divs with onclick but no keyboard handlers**
- **8 tab panels as divs, no role="tab"**
- **No :focus-visible CSS, no focus trap in modals**

## Workstreams

### A: Focus & Keyboard (P0)
1. Add `:focus-visible` CSS rule to `00_head.html`
2. Add `prefers-reduced-motion` media query
3. Convert 8 inner-tab divs to `<button role="tab">` with `aria-selected`, arrow keys
4. Add Enter/Space handlers to all interactive divs with onclick
5. Add `tabindex="0"` to clickable divs that need keyboard access
6. Implement focus trap in modals (Tab/Shift+Tab boundary)
7. Return focus to trigger element on modal close

### B: ARIA & Screen Reader (P0-P1)
1. Add `aria-live="polite"` region for analysis results
2. Add `role="menu"` + `role="menuitem"` to dropdown menus
3. Add `aria-expanded` to dropdown toggle buttons
4. Add `scope="col"` to all `<th>` elements
5. Add `aria-label` to icon-only buttons (undo/redo)
6. Add skip link at top of page

### C: Semantic HTML (P1)
1. Add `<main>` landmark around content area
2. Label placeholder-only inputs with `aria-label`
3. Add `aria-describedby` to key form inputs

### D: Tests
1. Keyboard navigation test (Selenium: Tab through app, verify focus order)
2. ARIA attribute presence test (unit test: check for required attributes)
