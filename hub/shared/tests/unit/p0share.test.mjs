import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../../../', import.meta.url);
const writer = fs.readFileSync(new URL('hub/shared/url-state.js', root), 'utf8');
for (const app of ['gosh', 'copas']) {
  const html = fs.readFileSync(new URL(app + '/index.html', root), 'utf8');
  const block = html.split('// URL state')[1].split(/\r?\n    }/)[0];
  async function suspendedShare(hidden) {
    const note = { hidden };
    const context = vm.createContext({ window: { location: { hash: "" } }, console: { warn() {} },
      btoa: s => Buffer.from(s, "binary").toString("base64"),
      atob: s => Buffer.from(s, "base64").toString("binary"),
      escape, unescape, encodeURIComponent, decodeURIComponent,
      document: { getElementById: id => id === "src" ? { value: "0.2, 0.1, A" } : note },
      text: "0.2, 0.1, A", model: "FE" });
    vm.runInContext(writer, context);
    await context.window.alm.urlState.withoutWrites(async () => {
      await context.window.alm.urlState.withoutWrites(() => vm.runInContext(block, context));
      assert.equal(note.hidden, hidden);
      assert.equal(context.window.location.hash, "");
    });
  }
  test(app + ": suspended writes preserve a hidden notice (regression plant)", async () => {
    await suspendedShare(true);
  });
  test(app + ": suspended writes preserve an already visible notice", async () => {
    await suspendedShare(false);
  });
  function share(src, legacy = false) {
    const note = { hidden: true, textContent: '' };
    const context = vm.createContext({ window: { location: { hash: '' } }, console: { warn() {} },
      btoa: s => Buffer.from(s, 'binary').toString('base64'),
      atob: s => Buffer.from(s, 'base64').toString('binary'),
      escape, unescape, encodeURIComponent, decodeURIComponent,
      document: { getElementById: id => id === 'src' ? { value: src } : note },
      text: src, model: 'FE' });
    vm.runInContext(writer, context);
    const code = legacy ? (app === 'gosh'
      ? 'window.alm.urlState.write({model:model,src:text.substring(0,600)});'
      : "window.alm.urlState.write({src:document.getElementById('src').value.substring(0,500)});") : block;
    vm.runInContext(code, context);
    return { state: context.window.alm.urlState.read(), note };
  }
  test(app + ': short control round trips', () => {
    const src = '0.2, 0.1, A\n0.4, 0.2, B';
    const out = share(src);
    assert.equal(out.state.src, src);
    assert.equal(out.note.hidden, true);
  });
  test(app + ': planted old cutoff never splits data', () => {
    const src = '0.2, 0.1, ' + 'A'.repeat(700) + '\n0.9, 0.2, B';
    assert.equal(share(src).state.src, src);
  });
  test(app + ': regression assertion rejects the planted historical writer', () => {
    const src = '0.2, 0.1, ' + 'A'.repeat(700) + '\n0.9, 0.2, B';
    assert.throws(() => assert.equal(share(src, true).state.src, src), assert.AssertionError);
    assert.equal(share(src).state.src, src);
  });
  test(app + ': encoded Unicode budget, not character count', () => {
    const src = '0.2, 0.1, ' + '界'.repeat(1100) + '\n0.9, 0.2, B';
    const out = share(src);
    assert.equal(Object.hasOwn(out.state, 'src'), false);
    assert.equal(out.note.hidden, false);
    assert.equal(share('0.2, 0.1, 界\n0.9, 0.2, B').note.hidden, true);
  });
  test(app + ': over-budget data omitted with actionable notice', () => {
    const out = share('0.2, 0.1, ' + 'A'.repeat(5000));
    assert.equal(Object.hasOwn(out.state, 'src'), false);
    assert.equal(out.note.hidden, false);
  });
}

test('suspension accessor tracks nesting and releases after failure', async () => {
  const context=vm.createContext({window:{location:{hash:''}}});
  vm.runInContext(writer,context);
  const state=context.window.alm.urlState;
  assert.equal(state.isSuspended(),false);
  await assert.rejects(state.withoutWrites(async () => {
    assert.equal(state.isSuspended(),true);
    await state.withoutWrites(() => assert.equal(state.isSuspended(),true));
    assert.equal(state.isSuspended(),true);
    throw new Error('plant');
  }),/plant/);
  assert.equal(state.isSuspended(),false);
});
