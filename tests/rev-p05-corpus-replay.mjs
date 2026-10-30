import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

// Run the shipped page and unchanged publication adapter without Playwright.
// DOM stubs expose text from the actual generated cards/table; this verifies
// numerical/rendered text, not browser layout, network isolation or live webR.
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sha = text => createHash('sha256').update(text).digest('hex');
const manifest = JSON.parse(read('heterogeneity/validate/MANIFEST.json'));
const loaded = {};
for (const file of manifest.files) {
  const text = read('heterogeneity/' + file.path);
  assert.equal(Buffer.byteLength(text), file.bytes, file.path + ' LF bytes');
  assert.equal(sha(text), file.sha256, file.path + ' LF hash');
  loaded[file.path] = JSON.parse(text);
}
const source = read('shared/ma-core.js');
const start = source.indexOf('  function tau2PM(yi, vi) {');
const end = source.indexOf('\n  // (Restricted) profile log-likelihood', start);
assert.ok(start >= 0 && end > start);
const supplied = source.slice(0, start) + read('tests/fixtures/rev-p05-r2-old-pm.txt') + source.slice(end);
assert.equal(sha(supplied), 'bcf0bd43eb0d762060f7d408d9eff9a8c04fe7fbc3fb8e9aee046670ed22b391');
const html = read('heterogeneity/index.html');
const main = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('function tau2_PM('));
assert.ok(main?.includes('    const loaded = loadSaved();'));
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
const textContent = html => html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, key) => entities[key]);

async function replay(label, core) {
  const nodes = new Map();
  let context;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', innerHTML: '', textContent: '',
      classList: { add() {}, remove() {} },
      setAttribute(key, value) { this[key] = value; },
      dispatchEvent() { context.__revP05Render(); }
    });
    return nodes.get(id);
  };
  const document = {
    getElementById: node,
    querySelectorAll(selector) {
      if (selector === '#stats-wrap .stat') {
        return [...node('stats-wrap').innerHTML.matchAll(/<div class="stat"><span class="k">([\s\S]*?)<\/span><span class="v">([\s\S]*?)<\/span><\/div>/g)]
          .map(m => ({ querySelector(s) {
            assert.ok(s === '.k' || s === '.v');
            return { textContent: textContent(m[s === '.k' ? 1 : 2]) };
          } }));
      }
      if (selector === '#loo-table tr') {
        return [...node('loo-table').innerHTML.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
          .map(m => ({ children: [...m[1].matchAll(/<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/g)]
            .map(cell => ({ textContent: textContent(cell[1]) })) }));
      }
      throw new Error('Unexpected DOM selector: ' + selector);
    }
  };
  const sandbox = { document, console, setTimeout, Event,
    localStorage: { getItem() { return null; }, setItem() {} },
    alm: { analysisLifecycle: fn => fn, urlState: { withoutWrites: fn => fn() } } };
  sandbox.window = sandbox;
  context = vm.createContext(sandbox);
  vm.runInContext(core, context, { filename: label + '/ma-core.js' });
  vm.runInContext(read('shared/heterogeneity-ci.js'), context);
  vm.runInContext(read('shared/alm-validate.js'), context);
  // Mounting the widget is browser plumbing; its comparator and the complete
  // adapter replay (including every numerical/display assertion) stay intact.
  context.AlmValidate.mount = () => ({});
  vm.runInContext(main.slice(0, main.indexOf('    const loaded = loadSaved();')) +
    '\nwindow.__revP05Render = render;\n})();', context);
  vm.runInContext(read('heterogeneity/validate/adapter.js'), context);
  const result = await context.AlmHetValidationAdapter.corpus.run(loaded, () => {});
  console.log(label, JSON.stringify({ sourceLFsha256: sha(core), checks: result.checks,
    passed: result.passed, failedCount: result.failed.length, firstFailures: result.failed.slice(0, 20), maxima: result.maxima,
    refusals: result.refusals, displayed: result.displayed, displayFailureCount: result.displayFails.length,
    firstDisplayFailures: result.displayFails.slice(0, 20) }));
  assert.equal(result.checks, 131781);
  assert.equal(result.passed, 131781);
  assert.equal(result.failed.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.refusals)), { configurations: 704, refused: 28, compared: 676 });
  assert.equal(result.displayed, 121424);
  assert.equal(result.displayFails.length, 0);
  return result;
}

const before = await replay('supplied-PR', supplied);
const after = await replay('repaired-PR', source);
console.log('Publication comparison', JSON.stringify({ before: before.maxima, after: after.maxima,
  numericalCountChanged: before.checks !== after.checks,
  renderedCountChanged: before.displayed !== after.displayed }));
