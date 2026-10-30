// Compare the unchanged main replay on the LF-pinned original and current page.
// The existing DOM suite still enforces every recorded value. The final tests
// intentionally fail on original code; p16-r4-old-replay.cjs checks those outcomes.
require('./p16-r4-dom-runtime.cjs');
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { harness, root } = require('./nma-inconsistency-dom.cjs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const edits = JSON.parse(read('hub/shared/tests/unit/p16-r4-original-edits.json'));
const pins = JSON.parse(read('hub/shared/tests/unit/p16-r4-original-sha256.json'));
function original(file) {
  return code => {
    const edit = edits.reverseEdits.find(e => e.path === file);
    code = code.replace(/\r\n/g, '\n');
    assert.equal(code.split(edit.current).length, 2, 'one inverse edit: ' + file);
    const old = code.replace(edit.current, () => edit.original);
    assert.equal(crypto.createHash('sha256').update(old).digest('hex'), pins[file], file);
    return old;
  };
}
const manifest = JSON.parse(read('nma-inconsistency/validate/MANIFEST.json'));
const files = Object.fromEntries(manifest.files.map(f => [f.path, fs.readFileSync(path.join(root, 'nma-inconsistency', f.path))]));
function firstDifference(app, ref, at = '$') {
  if (JSON.stringify(app) === JSON.stringify(ref)) return null;
  if (app && ref && typeof app === 'object' && typeof ref === 'object') {
    for (const key of new Set([...Object.keys(app), ...Object.keys(ref)])) {
      const difference = firstDifference(app[key], ref[key], at + '.' + key);
      if (difference) return difference;
    }
  }
  return { path: at, app, ref };
}
async function inspect(label, options) {
  const { c, document, storage } = harness(options), a = c.AlmIncoValidationAdapter;
  document.getElementById('src').value = 'pending input';
  storage.set('ma-comparisons-v1', 'pending bus');
  storage.set('alm-autosave:nma-inconsistency', 'draft');
  const before = JSON.stringify(a.snapshot());
  const result = await a.corpus.run(files);
  assert.equal(JSON.stringify(a.snapshot()), before, label + ': replay must restore state');
  const groups = {};
  for (const failure of result.failed) {
    const group = groups[failure.quantity] ||= { count: 0, firstCase: failure.id,
      difference: firstDifference(failure.app, failure.ref) };
    group.count++;
  }
  console.log(label + ': ' + JSON.stringify({ checks: result.checks, passed: result.passed,
    failed: result.failed.length, refusals: result.refusals, groups }));
  const live = {};
  for (const model of ['FE', 'DL', 'PM']) {
    document.getElementById('f-model').value = model;
    c.__almIncoLoad('A,B,.2,.1\nB,C,.3,.2\nA,C,.6,.15');
    live[model] = a.live.currentState().values.filter(v => v.key.startsWith('display.'));
    console.log(label + ' live ' + model + ': ' + JSON.stringify(live[model]));
  }
  // Report parser structure without changing the page, harness or reference.
  const note = document.querySelector('#ns-plot').nextElementSibling;
  const plot = document.getElementById('ns-plot');
  console.log(label + ' DOM parser: ' + JSON.stringify({
    noteText: note.textContent.trim(),
    noteTextNodes: [...note.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent),
    plotFirstChild: plot.firstElementChild.localName,
    plotFirstChildChildren: [...plot.firstElementChild.children].slice(0, 3).map(n => n.localName)
  }));
  // Compare every failure, quantity maximum and live display assertion across versions.
  return JSON.parse(JSON.stringify({ checks: result.checks, passed: result.passed,
    failed: result.failed, maxima: result.maxima, refusals: result.refusals, live }));
}
(async () => {
  console.log('Main replay comparison: Node ' + process.version + ', linkedom 0.18.12');
  const originalOptions = {
    transformPage: original('nma-inconsistency/index.html'),
    transformPlus: original('nma-inconsistency/plus-ui.js')
  };
  const old = await inspect('original PR head', originalOptions);
  const current = await inspect('current page', {});
  assert.deepEqual(current, old, 'follow-up must preserve all main replay and live results');
  console.log('Original/current main replay results, maxima, refusals and live display checks are identical.');
  const preGuard = await inspect('reconstructed pre-guard', {
    ...originalOptions,
    transformPage: code => {
      const oldPage = originalOptions.transformPage(code);
      assert.equal(oldPage.split(edits.preGuard.remove).length, 2, 'one pre-guard inverse edit');
      const page = oldPage.replace(edits.preGuard.remove, '');
      assert.equal(crypto.createHash('sha256').update(page).digest('hex'), edits.preGuard.sha256);
      return page;
    }
  });
  assert.deepEqual(current, preGuard, 'importer guard must preserve all existing main replay and live results');
  console.log('Original/current/pre-guard main replay results, maxima, refusals and live display checks are identical.');
  const { defineTests } = await import('./unit/p16-r4-plus-cases.mjs');
  defineTests(() => {
    const h = harness({ ...originalOptions, live: true }), clipboard = [];
    h.c.navigator = { clipboard: { writeText: async text => { clipboard.push(text); } } };
    return { ...h, clipboard };
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
