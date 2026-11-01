const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>\s*(\(function \(\) \{(?:(?!<\/script>)[\s\S])*?AlmAutosave\.install(?:(?!<\/script>)[\s\S])*?)<\/script>/)[1];
function selectors(source) {
  let options;
  const autosave = { install(value) { options = value; } };
  vm.runInNewContext(source, {
    window: { AlmAutosave: autosave }, AlmAutosave: autosave,
    document: { readyState: 'complete' }
  });
  assert.equal(options.appKey, 'dta-sroc');
  return Array.from(options.selectors);
}
const types = ['textarea', 'select', 'input[type=text]', 'input[type=number]',
  'input[type=checkbox]', 'input[type=radio]', 'input[type=range]'];
function check(source) {
  const actual = selectors(source);
  // Keeping the original selector grouping/order preserves legacy idx:N keys.
  assert.deepEqual(actual, types.map(type => type + ':not(#alm-plus *):not(#alm-features *)'));
}
test('autosave preserves native selector order and excludes both auxiliary panels', () => {
  check(script);
});
test('PLANTED feature-panel inclusion is caught; extras exclusion alone is insufficient', () => {
  assert.throws(() => check(script.replaceAll(':not(#alm-features *)', '')), assert.AssertionError);
});
