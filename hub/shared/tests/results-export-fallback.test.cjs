// Minimal DOM adapter tests the real click/download path without a DOM dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = process.argv[2] || path.join(__dirname, '..', 'results-export.js');
const handlers = {};
let blob;
const target = { set innerHTML(v) {}, querySelector: sel => ({
  addEventListener: (event, fn) => { handlers[sel] = fn; }
}) };
const document = {
  title: 'Test app', head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} },
  createElement: () => ({ click() {} }),
  querySelector: sel => sel === '#export' ? target : {
    textContent: sel === 'h1' ? 'Test app' : 'STATIC BOILERPLATE random-effects REML and DL'
  }
};
const context = {
  window: {}, document, Blob, console,
  URL: { createObjectURL: b => { blob = b; return 'blob:test'; }, revokeObjectURL() {} },
  setTimeout: fn => fn()
};
let src = fs.readFileSync(source, 'utf8');
if (process.env.V181_MUTANT === 'footer') {
  const mutant = src.replace(/const methods = typeof opts\.methods[\s\S]*?;\n    return \{ title, methods \};/,
    "const methods = _grab('.footer-note') || _grab('footer');\n    return { title, methods };");
  assert.notEqual(mutant, src, 'Footer mutation target must exist');
  src = mutant;
}
vm.runInNewContext(src, context);
(async () => {
  for (const result of [{ method: 'FE', model: 'fixed', estimator: 'none' }, null]) {
    context.window.alm.resultsExport({ target: '#export', getResults: () => result });
    for (const action of ['report-md', 'report-txt']) {
      handlers['[data-action="' + action + '"]']();
      const text = await blob.text();
      assert.ok(text.includes('Methods of this run: not recorded by this app; the settings used are listed under Results.'), text);
      assert.ok(!text.includes('STATIC BOILERPLATE'), text);
      if (result) for (const value of ['method', 'FE', 'model', 'fixed', 'estimator', 'none']) assert.ok(text.includes(value), text);
    }
  }
  const result = { method: 'FE' };
  let received;
  context.window.alm.resultsExport({
    target: '#export', getResults: () => result,
    methods: r => { received = r; return 'Run-specific fixed effect (FE).'; }
  });
  handlers['[data-action="report-md"]']();
  assert.equal(received, result, 'Methods must use the exact exported results snapshot');
  assert.ok((await blob.text()).includes('Run-specific fixed effect (FE).'));
  assert.ok(!(await blob.text()).includes('STATIC BOILERPLATE'));
  // Explicit strings are part of the API; page scraping is not.
  for (const opts of [
    { methods: 'Explicit app methods.' },
    { description: 'Explicit app description.' },
    { methods: 'Explicit app methods.', description: 'Explicit app description.' },
    { methods: 'Same explicit copy.', description: 'Same explicit copy.' }
  ]) {
    context.window.alm.resultsExport({ target: '#export', getResults: () => result, ...opts });
    for (const action of ['report-md', 'report-txt']) {
      handlers['[data-action="' + action + '"]']();
      const text = await blob.text();
      for (const value of new Set(Object.values(opts))) {
        assert.equal(text.split(value).length - 1, 1, text);
      }
      assert.ok(!text.includes('STATIC BOILERPLATE'), text);
      if (opts.methods) assert.ok(!text.includes('not recorded by this app'), text);
    }
  }
  for (const result of [{}, null, { _schema: 'stub-v1', k: 0 }]) {
    context.window.alm.resultsExport({ target: '#export', getResults: () => result, methods: () => '' });
    for (const action of ['report-md', 'report-txt']) {
      handlers['[data-action="' + action + '"]']();
      const text = await blob.text();
      assert.match(text, /No completed run/i);
      assert.ok(!text.includes('not recorded by this app'), text);
      assert.ok(!text.includes('STATIC BOILERPLATE'), text);
    }
  }
  console.log('PASS fallback MD/TXT, null results, snapshot callback, explicit strings, no completed run');
})().catch(error => { console.error(error); process.exitCode = 1; });
