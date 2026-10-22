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
  const mutant = src.replace("const methods = typeof opts.methods === 'function' ? opts.methods(results) : '';",
    "const methods = _grab('.footer-note') || _grab('footer');");
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
  context.window.alm.resultsExport({ target: '#export', getResults: () => result, methods: 'STATIC BOILERPLATE' });
  handlers['[data-action="report-md"]']();
  assert.ok((await blob.text()).includes('not recorded by this app'));
  console.log('PASS fallback MD/TXT, null results, snapshot callback, static methods rejection');
})().catch(error => { console.error(error); process.exitCode = 1; });
