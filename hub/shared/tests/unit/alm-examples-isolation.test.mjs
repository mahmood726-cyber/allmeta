import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const root = new URL('../../../../', import.meta.url);
const apps = ['dta-sroc', 'meta-regression', 'mh-peto', 'multilevel-ma', 'pubbias-tests'];
for (const app of apps) {
  test(app + ': example picker is excluded before autosave assigns positional keys', () => {
    const html = readFileSync(new URL(app + '/index.html', root), 'utf8');
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('AlmAutosave.install'));
    let options;
    const context = { document: { readyState: 'complete' }, AlmAutosave: { install: o => { options = o; } } };
    context.window = context;
    vm.runInNewContext(script, context);
    // Each selector must exclude the entire new panel, before element enumeration.
    // Filtering only saved values would still corrupt the anonymous plot indices.
    for (const selector of options.selectors) assert.ok(selector.includes(':not(#alm-real-example-panel *)'), selector);
    assert.deepEqual(Array.from(options.selectors, s => s.split(':not(')[0]),
      ['textarea', 'select', 'input[type=text]', 'input[type=number]', 'input[type=checkbox]', 'input[type=radio]', 'input[type=range]']);
    // Existing exclusions remain part of the contract.
    assert.ok(options.selectors.every(s => s.includes(app === 'mh-peto' ? ':not(#loo-only-flagged)' : ':not(#alm-plus *)')));
  });
}
