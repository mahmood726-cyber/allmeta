import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../dta-sroc/index.html', import.meta.url), 'utf8');
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('AlmAutosave.install'));
const key = 'dta-sroc-draft-title-v1';
const originalSelectors = ['textarea', 'select', 'input[type=text]', 'input[type=number]',
  'input[type=checkbox]', 'input[type=radio]', 'input[type=range]']
  .map(s => s + ':not(#alm-plus *)');
const plain = value => JSON.parse(JSON.stringify(value));

function boot(state, saved = {}) {
  const storage = new Map(Object.entries(saved)), listeners = {}, timers = new Map();
  let options, restored, nextTimer = 0;
  const c = vm.createContext({
    document: {readyState:'complete', addEventListener(type, fn) {(listeners[type] ||= []).push(fn);}},
    AlmAutosave: {install(o) {options = o;}},
    localStorage: {getItem:k => storage.get(k) ?? null, setItem:(k,v) => storage.set(k,v)},
    setTimeout(fn) {timers.set(++nextTimer,fn); return nextTimer;},
    clearTimeout(id) {timers.delete(id);},
    __almSnapshot: () => state,
    __almRestore: s => {restored = plain(s);}
  });
  c.window = c;
  vm.runInContext(source, c);
  return {storage, get options() {return options;}, get restored() {return restored;},
    event(type, extra = false) {
      const target = {matches:selector => !extra && selector === originalSelectors[0]};
      for (const fn of listeners[type] || []) fn({target});
    },
    flush() {for (const fn of timers.values()) fn(); timers.clear();}
  };
}

test('draft provenance does not add fields or change original autosave selectors', () => {
  const p = boot({});
  assert.equal(p.options.appKey, 'dta-sroc');
  assert.deepEqual(plain(p.options.selectors), originalSelectors);
});

for (const exampleTitle of ['AuditC: citation', null]) {
  test('separate draft metadata restores ' + (exampleTitle ? 'automatic' : 'explicit') + ' title provenance', () => {
    const state = {data:'A,80,12,20,88', title:'AuditC: citation', exampleTitle};
    const p = boot(state);
    p.event('input'); p.flush();
    assert.deepEqual(JSON.parse(p.storage.get(key)), state);
    const restored = boot({}, Object.fromEntries(p.storage));
    restored.options.onRestore(2, {'f-data':state.data, 'f-title':state.title});
    assert.deepEqual(restored.restored, state);
  });
}

test('extras controls never write original draft provenance', () => {
  const p = boot({data:'A', title:'Custom', exampleTitle:null});
  p.event('input', true); p.event('change', true); p.flush();
  assert.equal(p.storage.size, 0);
});

test('mismatched, malformed and legacy metadata retain legacy title reconciliation', () => {
  for (const metadata of [undefined, '{bad', 'null', JSON.stringify({data:'old', title:'Citation', exampleTitle:null}),
    JSON.stringify({data:'current', title:'different', exampleTitle:null})]) {
    const p = boot({}, metadata === undefined ? {} : {[key]:metadata});
    p.options.onRestore(2, {'f-data':'current', 'f-title':'Citation'});
    assert.deepEqual(p.restored, {data:'current', title:'Citation'});
  }
});

test('old hidden-field drafts preserve explicit titles and take precedence over separate metadata', () => {
  const p = boot({}, {[key]:JSON.stringify({data:'current',title:'Citation',exampleTitle:'Citation'})});
  p.options.onRestore(3, {'f-data':'current', 'f-title':'Citation', 'example-title-source':'null'});
  assert.deepEqual(p.restored, {data:'current', title:'Citation', exampleTitle:null});
});

test('restore uses metadata captured before field input events schedule another save', () => {
  const state = {data:'saved',title:'Citation',exampleTitle:null};
  const p = boot({data:'partially restored',title:'Citation',exampleTitle:'Citation'}, {[key]:JSON.stringify(state)});
  p.event('change'); p.flush();
  p.options.onRestore(2, {'f-data':state.data,'f-title':state.title});
  assert.deepEqual(p.restored, state);
});
