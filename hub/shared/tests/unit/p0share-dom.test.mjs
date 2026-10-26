import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../../../', import.meta.url);
const writer = fs.readFileSync(new URL('hub/shared/url-state.js', root), 'utf8');
for (const app of ['gosh', 'copas']) {
  const html = fs.readFileSync(new URL(app + '/index.html', root), 'utf8');
  const block = html.split('// URL state')[1].split(/\r?\n    }/)[0];
  function harness() {
    let note = null;
    const source = { value: '' };
    const status = { before(el) { note = el; } };
    const document = {
      getElementById(id) { return id === 'src' ? source : id === 'share-data-note' ? note : status; },
      createElement() { return { hidden: false, setAttribute(k,v) { this[k]=v; }, remove() { note=null; } }; }
    };
    const context = vm.createContext({document, window:{location:{hash:''}}, console:{warn(){}},
      btoa:s=>Buffer.from(s,'binary').toString('base64'), atob:s=>Buffer.from(s,'base64').toString('binary'),
      escape, unescape, encodeURIComponent, decodeURIComponent, model:'FE'});
    vm.runInContext(writer,context);
    return { get note() { return note; }, state:context.window.alm.urlState,
      run(src) { source.value=src; context.text=src; vm.runInContext(block,context); } };
  }
  test(app + ': static notice plant must be absent from default markup', () => {
    assert.doesNotMatch(html, /<div[^>]*id="share-data-note"/);
  });
  test(app + ': oversized control creates one actionable notice; fitting data removes it', () => {
    const h=harness();
    h.run('0.2, 0.1, A');
    assert.equal(h.note,null);
    h.run('0.2, 0.1, '+ 'A'.repeat(5000));
    const notice=h.note;
    assert.ok(notice);
    assert.equal(notice.textContent,'Data too long for a link — use Export/Download to share the data');
    assert.equal(notice.role,'status');
    assert.equal(Object.hasOwn(h.state.read(),'src'),false);
    h.run('0.2, 0.1, '+ 'B'.repeat(5000));
    assert.equal(h.note,notice);
    h.run('0.2, 0.1, A');
    assert.equal(h.note,null);
    assert.equal(h.state.read().src,'0.2, 0.1, A');
  });
  test(app + ': suspended writes preserve both absent and existing notice', async () => {
    const h=harness();
    await h.state.withoutWrites(()=>h.run('0.2, 0.1, A'));
    assert.equal(h.note,null);
    h.run('0.2, 0.1, '+ 'A'.repeat(5000));
    const notice=h.note, state=JSON.stringify(h.state.read());
    await h.state.withoutWrites(()=>h.run('0.2, 0.1, A'));
    assert.equal(h.note,notice);
    assert.equal(JSON.stringify(h.state.read()),state);
  });
}
