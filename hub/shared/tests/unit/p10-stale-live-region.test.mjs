import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('mh-peto/index.html', root), 'utf8');
const lifecycle = readFileSync(new URL('hub/shared/analysis-lifecycle.js', root), 'utf8');
const warning = 'Results out of date — press Run analysis';

// Read the actual page's body markup, including ancestors of each notice.
// This small fixture parser models hidden/ARIA attributes and text, not a
// browser accessibility tree or screen-reader speech.
function markup() {
  const tree = { tag: 'root', attrs: {}, children: [], parent: null };
  const stack = [tree], elements = [], ids = new Map();
  const body = html.slice(html.indexOf('<body>'), html.indexOf('<script', html.indexOf('<body>')));
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const token of body.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) {
      assert.equal(stack.pop().tag, token.slice(2, -1).trim().toLowerCase(), 'fixture tags must balance');
    } else if (token.startsWith('<')) {
      const [, tag, rest] = token.match(/^<([\w-]+)([\s\S]*?)>$/);
      const attrs = Object.fromEntries([...rest.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
        .map(([, key, double, single, bare]) => [key, double ?? single ?? bare ?? '']));
      const parent = stack.at(-1);
      const el = { tag, attrs, parent, children: [], hidden: Object.hasOwn(attrs, 'hidden'), id: attrs.id };
      parent.children.push(el);
      elements.push(el);
      if (el.id) ids.set(el.id, el);
      if (!voidTags.has(tag)) stack.push(el);
    } else {
      stack.at(-1).children.push(token);
    }
  }
  return { elements, ids };
}

function exposed(el) {
  for (let p = el; p; p = p.parent) {
    if (p.hidden || p.attrs['aria-hidden'] === 'true' ||
        /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(p.attrs.style ?? '')) return false;
  }
  return true;
}
function live(el) {
  if (el.attrs['aria-live'] === 'off') return false;
  return ['polite', 'assertive'].includes(el.attrs['aria-live']) || ['status', 'alert'].includes(el.attrs.role);
}
function liveAncestor(el) {
  for (let p = el; p; p = p.parent) if (live(p) && exposed(p)) return p;
  return null;
}
function exposedText(el) {
  if (!exposed(el)) return '';
  return el.children.map(child => typeof child === 'string' ? child : exposedText(child)).join('').trim();
}

function setup() {
  const { elements, ids } = markup(), handlers = {}, window = {};
  const src = ids.get('src'), measure = ids.get('measure');
  src.value = src.children.join('');
  measure.value = 'OR';
  for (const el of [src, measure]) el.matches = selector => selector.split(',').some(s => s.trim() === '#' + el.id);
  const document = {
    getElementById: id => ids.get(id) ?? null,
    querySelectorAll: () => [src, measure],
    addEventListener(type, fn, capture) { assert.equal(capture, true); handlers[type] = fn; }
  };
  runInNewContext(lifecycle, { window, document });
  const run = window.alm.analysisLifecycle(() => src.value !== 'invalid', result => result, '#src, #measure');
  return {
    src, run, stale: ids.get('analysis-stale'), updated: ids.get('analysis-status'), errors: ids.get('input-errors'),
    liveAtLoad: elements.filter(el => live(el) && exposed(el)),
    event: (type, target = src) => handlers[type]({ target })
  };
}

for (const type of ['input', 'change']) {
  test(`plant P10-R5: ${type} exposes the stale warning inside an established polite live region`, () => {
    const h = setup();
    h.run();
    const before = new Map(h.liveAtLoad.map(el => [el, exposedText(el)]));
    h.src.value += '\nStudyF, 1, 100, 2, 100';
    h.event(type);
    assert.equal(h.updated.hidden, true);
    assert.equal(h.stale.hidden, false, 'the visual warning is already working');
    const region = liveAncestor(h.stale);
    assert.ok(region, 'visible stale warning must have live-region semantics on itself or an ancestor');
    assert.ok(h.liveAtLoad.includes(region), 'live container must be exposed before the warning occurs');
    assert.equal(region.attrs['aria-live'] ?? (region.attrs.role === 'status' ? 'polite' : 'assertive'), 'polite');
    assert.equal(region.attrs['aria-atomic'] ?? (region.attrs.role === 'status' ? 'true' : 'false'), 'true');
    assert.equal(before.get(region), '', 'current results must not expose stale text');
    assert.equal(exposedText(region), warning);
  });
}

test('plant P10-R5: rerun clears the live warning and a later edit exposes it again', () => {
  const h = setup();
  h.run();
  h.src.value += '\nStudyF, 1, 100, 2, 100';
  h.event('input');
  const region = liveAncestor(h.stale);
  assert.ok(region, 'stale transition needs a live region');
  assert.equal(exposedText(region), warning);
  h.src.value += '\nStudyG, 2, 100, 3, 100';
  h.event('input');
  h.event('change');
  assert.equal(liveAncestor(h.stale), region, 'repeated edits reuse the established region');
  assert.equal(exposedText(region), warning, 'repeated edits do not change the live message');
  h.run();
  assert.equal(h.stale.hidden, true);
  assert.equal(exposed(region), true, 'the live container remains exposed when the warning is cleared');
  assert.equal(exposedText(region), '');
  h.src.value += '\nStudyH, 3, 100, 4, 100';
  h.event('input');
  assert.equal(liveAncestor(h.stale), region);
  assert.equal(exposedText(region), warning);
});

test('control P10-R5: success and input-error notices retain their live semantics', () => {
  const h = setup();
  assert.equal(h.updated.attrs.role, 'status');
  assert.equal(h.updated.attrs['aria-live'], 'polite');
  assert.equal(h.errors.attrs.role, 'alert');
  h.run();
  assert.equal(h.updated.hidden, false);
  assert.equal(liveAncestor(h.updated), h.updated);
  assert.equal(exposedText(h.updated), 'Analysis updated');
  assert.equal(h.stale.hidden, true);
  assert.equal(h.errors.hidden, true);
});

test('control P10-R5: unchanged commits and unrelated inputs do not mark results stale', () => {
  const h = setup();
  h.run();
  h.event('input');
  h.event('change');
  h.src.value += '\nStudyF, 1, 100, 2, 100';
  h.event('input', { matches: () => false });
  assert.equal(h.updated.hidden, false);
  assert.equal(h.stale.hidden, true);
});

test('control P10-R5: refused runs hide both notices and a successful rerun clears stale state', () => {
  const h = setup();
  h.run();
  const valid = h.src.value;
  h.src.value = 'invalid';
  h.event('input');
  assert.equal(h.stale.hidden, false);
  assert.equal(h.run(), false);
  assert.equal(h.stale.hidden, true);
  assert.equal(h.updated.hidden, true);
  h.event('change');
  assert.equal(h.stale.hidden, true);
  h.src.value = valid;
  assert.equal(h.run(), true);
  h.event('change');
  assert.equal(h.stale.hidden, true);
  assert.equal(h.updated.hidden, false);
});
