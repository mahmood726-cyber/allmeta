import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../../../../gosh/index.html', import.meta.url), 'utf8');
const studies = k => Array.from({ length: k }, (_, i) => `${i / 100}, 0.2, S${i + 1}`).join('\n');

// Run the production inline script and Run button handler; stub only DOM/shared UI plumbing.
function page() {
  const nodes = {};
  for (const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    let content = '';
    nodes[tag[1]] = {
      value: tag[0].match(/\bvalue="([^"]*)"/)?.[1] || '', style: {},
      get textContent() { return content; }, set textContent(value) { content = value; },
      get innerHTML() { return content; }, set innerHTML(value) { content = value; },
      addEventListener(event, handler) { this[event] = handler; }
    };
  }
  nodes.src.value = studies(3);
  nodes.model.value = 'FE';
  nodes['n-sample'].value = '5';
  nodes['enum-mode'].value = 'sample';
  const noop = () => {};
  const exactRequests = [];
  const window = {
    alm: {
      analysisLifecycle: run => run, csvUpload: noop, plotExport: noop,
      axisControls: noop, resultsExport: noop, resetUndo: noop, tooltips: noop,
      urlState: Object.assign(noop, { read: () => null, isSuspended: () => true })
    },
    AlmGoshExact: { request: request => exactRequests.push(request), labelResult: noop }
  };
  runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], {
    window, document: { getElementById: id => nodes[id] }
  });
  return { nodes, exactRequests, run(k) {
    nodes.src.value = studies(k);
    nodes['btn-run'].click();
    return window._almLastGosh();
  } };
}

function assertCleared(p) {
  assert.equal(p.nodes.plot.innerHTML, '');
  for (const id of ['m-n', 'm-est', 'm-i2']) assert.equal(p.nodes[id].textContent, '\u2014');
  assert.equal(p.nodes['sample-label'].style.display, 'none');
}

for (const k of [101, 137]) {
  test(`plant P13-R5: ${k} studies announce the actual count and maximum, clear results, and recover`, () => {
    const p = page();
    assert.equal(p.run(100).k, 100);
    assert.notEqual(p.nodes.plot.innerHTML, '');
    const before = p.exactRequests.length;
    assert.equal(p.run(k), null);
    assertCleared(p);
    assert.equal(p.exactRequests.length, before + 1);
    assert.equal(p.exactRequests.at(-1), null);
    const message = p.nodes['input-error'].textContent;
    assert.match(message, /(?:at most|maximum(?: of)?|limit(?: of)?)\s+100\b/i);
    assert.match(message, new RegExp(`\\b${k}\\b`));

    const recovered = p.run(100);
    assert.equal(recovered.k, 100);
    assert.equal(recovered.sampled, true);
    assert.equal(recovered.n_subsets, 5);
    assert.equal(p.nodes['input-error'].textContent, '');
    assert.notEqual(p.nodes.plot.innerHTML, '');
  });
}

for (const k of [1, 2]) {
  test(`control: ${k} studies still announce the minimum and clear results`, () => {
    const p = page();
    assert.equal(p.run(k), null);
    assert.match(p.nodes['input-error'].textContent, /at least 3 valid studies/);
    assert.match(p.nodes['input-error'].textContent, new RegExp(`found ${k}\\b`));
    assertCleared(p);
  });
}

test('control: 3 studies still enumerate all seven subsets without an input error', () => {
  const p = page(), result = p.run(3);
  assert.equal(result.k, 3);
  assert.equal(result.sampled, false);
  assert.equal(result.n_subsets, 7);
  assert.equal(p.nodes['input-error'].textContent, '');
  assert.notEqual(p.nodes.plot.innerHTML, '');
});

test('control: 100 studies still accept sampling without an input error', () => {
  const p = page(), result = p.run(100);
  assert.equal(result.k, 100);
  assert.equal(result.sampled, true);
  assert.equal(result.n_subsets, 5);
  assert.equal(p.nodes['input-error'].textContent, '');
  assert.equal(p.nodes['sample-label'].style.display, 'block');
  assert.notEqual(p.nodes.plot.innerHTML, '');
});

test('control: study input describes the existing alert', () => {
  const input = html.match(/<textarea\b[^>]*\bid="src"[^>]*>/)?.[0];
  const alert = html.match(/<span\b[^>]*\bid="input-error"[^>]*>/)?.[0];
  assert.ok(input);
  assert.ok(alert);
  assert.match(input, /aria-describedby="input-error"/);
  assert.match(alert, /role="alert"/);
});
