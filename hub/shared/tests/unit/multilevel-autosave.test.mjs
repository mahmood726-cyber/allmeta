import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../multilevel-ma/index.html', import.meta.url), 'utf8');
const install = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('AlmAutosave.install'));
const autosave = readFileSync(new URL('../../../../shared/autosave.js', import.meta.url), 'utf8');

// A small control/selector double exercises the actual app installation and
// shared debounce/storage code. Browser coverage checks the rendered controls.
function setup(extraControls = []) {
  const listeners = {}, timers = new Map(), stored = new Map();
  let timer = 0;
  function control(tagName, id, value, type = '', scope = '') {
    return { tagName, id, value, type, scope, dataset: {}, checked: false,
      matches(selector) {
        const exclusions = [...selector.matchAll(/:not\(#([\w-]+) \*\)/g)].map(m => m[1]);
        const simple = selector.replace(/:not\(#[\w-]+ \*\)/g, '');
        const match = /^(textarea|select|input)(?:\[type=(\w+)\])?$/.exec(simple);
        assert.ok(match, 'selector supported by the control double: ' + selector);
        return !exclusions.includes(this.scope) && this.tagName.toLowerCase() === match[1] &&
          (!match[2] || this.type === match[2]);
      }
    };
  }
  const controls = [
    control('TEXTAREA', 'src', '1, 0.35, 0.12, outcome A'),
    control('SELECT', '', 'en'),
    control('SELECT', 'alm-plot-1-format', 'png'),
    control('SELECT', 'alm-plot-1-resolution', '300'),
    control('INPUT', 'alm-plot-1-physical-width', '8', 'number'),
    control('INPUT', '', '-1', 'number'), control('INPUT', '', '2', 'number'),
    control('INPUT', '', '', 'checkbox'),
    ...extraControls.map(args => control(...args))
  ];
  const context = vm.createContext({
    document: { readyState: 'complete',
      querySelectorAll: selector => controls.filter(c => c.matches(selector)),
      addEventListener: (type, fn) => (listeners[type] ||= []).push(fn)
    },
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    setTimeout: fn => { timers.set(++timer, fn); return timer; },
    clearTimeout: id => timers.delete(id)
  });
  context.window = context;
  vm.runInContext(autosave, context);
  vm.runInContext(install, context);
  return {
    edit(id, value) {
      const target = controls.find(c => c.id === id); target.value = value;
      for (const fn of listeners.input || []) fn({ target });
      for (const [id, fn] of timers) { timers.delete(id); fn(); }
    },
    saved: () => JSON.parse(stored.get('alm-autosave:multilevel-ma') || 'null')?.values
  };
}

const extras = ['alm-plus', 'alm-features'].flatMap(scope => [
  ['TEXTAREA', scope + '-paste', 'Unconfirmed source text', '', scope],
  ['SELECT', scope + '-decimal', 'comma', '', scope],
  ['INPUT', scope + '-source', 'Source reference', 'text', scope],
  ['INPUT', scope + '-number', '7', 'number', scope],
  ['INPUT', scope + '-confirm', '', 'checkbox', scope],
  ['INPUT', scope + '-choice', '', 'radio', scope],
  ['INPUT', scope + '-range', '5', 'range', scope]
]);

test('multilevel autosave CONTROL: main input and positional axis settings still save', () => {
  const app = setup(); app.edit('src', 'edited effects');
  assert.deepEqual(app.saved(), {
    src: 'edited effects', 'idx:1': 'en', 'alm-plot-1-format': 'png',
    'alm-plot-1-resolution': '300', 'alm-plot-1-physical-width': '8',
    'idx:5': '-1', 'idx:6': '2', 'idx:7': false
  });
});

test('multilevel autosave PLANTED: additive controls cannot leak or shift original draft keys', () => {
  const control = setup(), planted = setup(extras);
  control.edit('src', 'edited effects'); planted.edit('src', 'edited effects');
  assert.deepEqual(planted.saved(), control.saved());
});

test('multilevel autosave: editing feature-only controls does not create an analysis draft', () => {
  const app = setup(extras);
  app.edit('alm-features-paste', 'changed unconfirmed source');
  assert.equal(app.saved(), undefined);
});
