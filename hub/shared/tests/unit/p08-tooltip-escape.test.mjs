import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../tooltips.js', import.meta.url), 'utf8');
const glossary = JSON.parse(readFileSync(new URL('../../glossary.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../../../../meta-regression/index.html', import.meta.url), 'utf8');
const [, termKey, termText] = html.match(/<abbr data-gloss="([^"]+)">([^<]+)<\/abbr>/);

// Small DOM double: execute the full module and its real registered handlers.
// Keydown/click bubble; focus is tracked here, not in a browser or screen reader.
function harness() {
  let document;
  function element(tagName) {
    const attributes = new Map();
    const listeners = new Map();
    const el = {
      tagName, children: [], parentNode: null, style: {}, className: '', textContent: '',
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      get isConnected() { return this === document || !!this.parentNode?.isConnected; },
      getBoundingClientRect() { return { left: 20, bottom: 30 }; },
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
      },
      dispatchEvent(event) {
        event.target ??= this;
        for (const listener of listeners.get(event.type) ?? []) listener(event);
        if (event.bubbles) this.parentNode?.dispatchEvent(event);
      },
      focus() {
        if (document.activeElement === this) return;
        document.activeElement?.blur();
        document.activeElement = this;
        this.dispatchEvent({ type: 'focus' });
      },
      blur() {
        if (document.activeElement !== this) return;
        document.activeElement = document.body;
        this.dispatchEvent({ type: 'blur' });
      }
    };
    el.classList = {
      contains(name) { return el.className.split(/\s+/).includes(name); },
      add(name) { if (!this.contains(name)) el.className = `${el.className} ${name}`.trim(); },
      remove(name) { el.className = el.className.split(/\s+/).filter(c => c !== name).join(' '); }
    };
    return el;
  }
  document = element('#document');
  document.createElement = element;
  document.documentElement = document.appendChild(element('html'));
  document.head = document.documentElement.appendChild(element('head'));
  document.body = document.documentElement.appendChild(element('body'));
  document.activeElement = document.body;
  const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
  document.getElementById = id => descendants(document).find(el => el.id === id) ?? null;
  document.querySelectorAll = selector => {
    const all = descendants(document);
    const terms = all.filter(el => el.tagName === 'abbr' && el.getAttribute('data-gloss') !== null);
    switch (selector) {
      case 'abbr[data-gloss]': return terms;
      case 'abbr[data-gloss]:not([aria-describedby])':
        return terms.filter(el => el.getAttribute('aria-describedby') === null);
      case 'abbr[data-gloss][aria-describedby]':
        return terms.filter(el => el.getAttribute('aria-describedby') !== null);
      case '.alm-lang-switch': return all.filter(el => el.classList.contains('alm-lang-switch'));
      default: throw new Error(`Unsupported selector: ${selector}`);
    }
  };
  document.querySelector = selector => document.querySelectorAll(selector)[0] ?? null;
  const term = document.body.appendChild(element('abbr'));
  term.setAttribute('data-gloss', termKey);
  term.textContent = termText;
  const outside = document.body.appendChild(element('button'));
  const window = { scrollX: 0, scrollY: 0 };
  vm.runInNewContext(source, { document, window, localStorage: { getItem() { return null; } } });
  window.alm.tooltips({ glossary });
  const tip = document.getElementById(term.getAttribute('aria-describedby'));
  const visible = () => tip.classList.contains('is-visible');
  const fire = (target, type, key) => target.dispatchEvent({
    type, key, bubbles: type === 'keydown' || type === 'click'
  });
  return { document, term, outside, tip, visible, fire };
}

test('P08-R6 plant: Escape dismisses the glossary definition without moving focus', () => {
  const h = harness();
  h.term.focus();
  assert.equal(h.visible(), true);
  h.fire(h.term, 'keydown', 'Escape');
  assert.equal(h.visible(), false, 'Escape must dismiss the focused glossary tooltip');
  assert.equal(h.document.activeElement, h.term, 'Escape must leave focus on the glossary term');
  assert.equal(h.term.getAttribute('aria-describedby'), h.tip.id);
  h.fire(h.term, 'keydown', 'Escape');
  assert.equal(h.visible(), false, 'Repeated Escape must keep the tooltip dismissed');
  h.outside.focus();
  h.term.focus();
  assert.equal(h.visible(), true, 'Returning focus must show the tooltip again');
});

test('P08-R6 plant: Escape dismisses a hovered definition while focus stays elsewhere', () => {
  const h = harness();
  h.outside.focus();
  h.fire(h.term, 'mouseenter');
  assert.equal(h.visible(), true);
  h.fire(h.outside, 'keydown', 'Escape');
  assert.equal(h.visible(), false, 'Escape must also dismiss a pointer-opened tooltip');
  assert.equal(h.document.activeElement, h.outside);
  h.fire(h.term, 'mouseleave');
  h.fire(h.term, 'mouseenter');
  assert.equal(h.visible(), true, 'Pointer re-entry must show the tooltip again');
});

test('P08-R6 control: the app loads linked definitions that show on focus and hide on blur', () => {
  assert.match(html, /<script src="\.\.\/hub\/shared\/tooltips\.js"><\/script>/);
  assert.match(html, /window\.alm\.tooltips\(\{ src: '\.\.\/hub\/shared\/glossary\.json' \}\)/);
  const h = harness();
  assert.equal(h.term.tabIndex, 0);
  assert.equal(h.tip.getAttribute('role'), 'tooltip');
  assert.equal(h.tip.textContent, `${glossary[termKey].short} — ${glossary[termKey].long}`);
  assert.equal(h.visible(), false);
  h.term.focus();
  assert.equal(h.visible(), true);
  h.outside.focus();
  assert.equal(h.visible(), false);
  assert.equal(h.document.activeElement, h.outside);
});

test('P08-R6 control: pointer, click, and non-Escape keyboard behavior is preserved', () => {
  const h = harness();
  h.fire(h.term, 'mouseenter');
  assert.equal(h.visible(), true);
  for (const key of ['Enter', 'Tab', 'a']) {
    h.fire(h.term, 'keydown', key);
    assert.equal(h.visible(), true, `${key} must not dismiss the tooltip`);
  }
  h.fire(h.term, 'mouseleave');
  assert.equal(h.visible(), false);
  h.fire(h.term, 'click');
  assert.equal(h.visible(), true, 'A click on the term must not immediately close its tooltip');
  h.fire(h.outside, 'click');
  assert.equal(h.visible(), false);
  h.fire(h.outside, 'keydown', 'Escape');
  assert.equal(h.visible(), false, 'Escape with no visible tooltip must be harmless');
});
