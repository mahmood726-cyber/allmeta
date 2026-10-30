import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const root = new URL('../../../../', import.meta.url);
export const heterogeneous = '12,150\n8,40\n30,200\n3,100\n25,120';
export const homogeneous = '10,100\n10,100\n10,100';

// By default execute the unmodified primary app script and shared numerical core.
// Only unrelated UI mounts and the DOM surface are stubbed; run/render/export
// are real. The explicit defect option below changes one guard in memory.
export function createApp({ plantHistoricalFEPI = false } = {}) {
  const html = readFileSync(new URL('proportion-ma/index.html', root), 'utf8');
  let script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes('function parseTable('));
  assert.ok(script, 'primary app script found');
  if (plantHistoricalFEPI) {
    // Reproduce the archived FE-PI behavior in memory; never edit the app or
    // its references. This is a controlled defect, not an archived checkout.
    const guard = "tauEst !== 'FE' && ";
    assert.equal(script.split(guard).length, 2, 'exactly one FE PI guard');
    script = script.replace(guard, '');
  }
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) {
      const attributes = new Map();
      const listeners = new Map();
      nodes.set(id, {
        value: '', innerHTML: '', textContent: '', style: {},
        get innerText() { return this.innerHTML.replace(/<[^>]*>/g, ''); },
        get attributes() { return [...attributes].map(([name, value]) => ({ name, value })); },
        setAttribute(name, value) { attributes.set(name, value); },
        removeAttribute(name) { attributes.delete(name); },
        addEventListener(event, fn) { listeners.set(event, fn); },
        click() { listeners.get('click')?.(); },
        closest() { return null; }
      });
    }
    return nodes.get(id);
  }
  node('src').value = heterogeneous;
  node('trans').value = 'logit';
  node('tau-est').value = 'PM';
  const document = {
    getElementById: node,
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '#het') return [node('het')];
      const [id, pattern] = selector === '#res-body tr' ? ['res-body', /<tr\b[^>]*>[\s\S]*?<\/tr>/g]
        : selector === '.pooled-row' ? ['res-body', /<tr class="pooled-row">[\s\S]*?<\/tr>/g]
          : selector === '#forest polygon' ? ['forest', /<polygon\b[^>]*\/>/g] : [];
      assert.ok(id, 'supported harness selector: ' + selector);
      return [...node(id).innerHTML.matchAll(pattern)].map(m => ({
        innerText: m[0].replace(/<[^>]*>/g, ''), closest() { return null; }
      }));
    }
  };
  let exportOptions;
  const noop = () => {};
  const window = { alm: {
    analysisLifecycle: fn => fn, csvUpload: noop, plotExport: noop,
    axisControls: noop, resultsExport: opts => { exportOptions = opts; },
    urlState: Object.assign(noop, { read: () => ({}), write: noop }),
    resetUndo: noop, tooltips: noop
  } };
  const context = vm.createContext({ window, document, console, setTimeout });
  const evaluate = path => vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path });
  evaluate('shared/ma-core.js');
  vm.runInContext(script, context, { filename: 'proportion-ma/index.html' });
  const clone = value => JSON.parse(JSON.stringify(value));
  return {
    context, window, document, evaluate,
    run(trans = 'logit', method = 'FE', src = heterogeneous) {
      node('src').value = src;
      node('trans').value = trans;
      node('tau-est').value = method;
      node('btn-run').click();
      return {
        exported: clone(exportOptions.getResults()),
        snapshot: clone(window.__almPropValidation.snapshot()),
        heterogeneity: node('het').innerText,
        table: node('res-body').innerHTML,
        forest: node('forest').innerHTML
      };
    }
  };
}
