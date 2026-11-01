import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = path => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');

// Exercise the actual page installer and autosave implementation. This small
// DOM double models the selectors they use; browser coverage remains in the
// existing MH/Peto and publication-bias autosave specs.
function harness(app) {
  const nodes = [], listeners = {}, timers = new Map(), storage = new Map();
  let timerId = 0;
  function field(tagName, id = '', type = '', ancestors = []) {
    const node = {
      tagName, id, type, ancestors, dataset: {}, value: id || 'native value', checked: true,
      matches(selector) {
        const base = selector.split(':not(')[0];
        const match = /^(textarea|select|input)(?:\[type=(\w+)\])?$/.exec(base);
        assert.ok(match, 'supported base selector: ' + base);
        if (tagName.toLowerCase() !== match[1] || (match[2] && type !== match[2])) return false;
        return [...selector.matchAll(/:not\(#([\w-]+)( \*)?\)/g)].every(([, excluded, descendant]) =>
          descendant ? !ancestors.includes(excluded) : id !== excluded);
      },
      dispatchEvent(event) { for (const fn of listeners[event.type] || []) fn({ target: node }); },
    };
    nodes.push(node);
    return node;
  }
  const src = field('TEXTAREA', 'src');
  field('TEXTAREA'); // original CSV paste field uses a positional key
  field('SELECT', app === 'mh-peto' ? 'measure' : 'format');
  field('SELECT');
  field('INPUT', '', 'text');
  field('INPUT', '', 'number');
  const filter = field('INPUT', app === 'mh-peto' ? 'loo-only-flagged' : 'plus-only-flagged',
    'checkbox', app === 'mh-peto' ? [] : ['alm-plus']);
  field('INPUT', '', 'checkbox');
  field('INPUT', '', 'radio');
  field('INPUT', '', 'range');
  const context = vm.createContext({
    document: {
      readyState: 'complete',
      querySelectorAll: selector => nodes.filter(node => node.matches(selector)),
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    Event: class { constructor(type) { this.type = type; } },
  });
  context.window = context;
  vm.runInContext(source('shared/autosave.js'), context);
  const scripts = [...source(app + '/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const installer = scripts.find(([, text]) => text.includes('AlmAutosave.install'));
  assert.ok(installer, 'page autosave installer');
  vm.runInContext(installer[1], context);
  function flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }
  function values() { return JSON.parse(storage.get('alm-autosave:' + app)).values; }
  function save() { src.dispatchEvent({ type: 'input' }); flush(); return values(); }
  function features() {
    return [['TEXTAREA', ''], ['SELECT', ''], ...['text', 'number', 'checkbox', 'radio', 'range'].map(type => ['INPUT', type])]
      .map(([tag, type], i) => field(tag, 'feature-' + i, type, ['alm-features', 'alm-f-panel-revman']));
  }
  return { save, values, features, filter, flush, storage };
}

for (const app of ['mh-peto', 'pubbias-tests']) {
  test(app + ': feature controls preserve every original autosave value and positional key', () => {
    const h = harness(app), original = h.save();
    assert.equal(original.src, 'src'); // native inputs still save
    assert.ok(Object.keys(original).some(key => key.startsWith('idx:')));
    // A fresh load has no assigned indices yet: eagerly mounted RevMan selects
    // used to move the later anonymous native inputs on their first snapshot.
    const mounted = harness(app), added = mounted.features();
    assert.deepEqual(mounted.save(), original);
    assert.ok(added.every(node => node.dataset.autosaveIndex === undefined));
  });

  test(app + ': editing feature controls cannot create an original-app draft', () => {
    const h = harness(app);
    for (const node of h.features()) {
      node.value = 'changed';
      node.dispatchEvent({ type: 'input' });
      node.dispatchEvent({ type: 'change' });
    }
    h.flush();
    assert.equal(h.storage.size, 0);
    // Control: native input still triggers the same debounced snapshot.
    assert.equal(h.save().src, 'src');
  });

  test(app + ': existing leave-one-out filter remains excluded', () => {
    const h = harness(app);
    h.filter.dispatchEvent({ type: 'change' });
    h.flush();
    assert.equal(h.storage.size, 0);
    assert.equal(h.save()[h.filter.id], undefined);
    assert.equal(h.filter.dataset.autosaveIndex, undefined);
  });
}
