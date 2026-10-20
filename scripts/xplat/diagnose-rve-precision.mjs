// Isolated experiment for the two RVE p-value failures. Never edits or serves
// an engine, and never writes the browser exports consumed by TEST.ps1.
// Run each resulting JSON through the unchanged validation/live/check_live.R.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const output = new URL('validation/live/precision-probe/', root);
const [html, stats, engine, adapter, patch] = await Promise.all([
  'rve-meta/index.html', 'shared/stats-qt.js', 'shared/rve.js',
  'rve-meta/alm-live.js', 'validation/live/stats-qt-accuracy.patch'
].map(file => readFile(new URL(file, root), 'utf8')));
const removed = patch.split(/\r?\n/).filter(line => /^-[^-]/.test(line)).map(line => line.slice(1));
const added = patch.split(/\r?\n/).filter(line => /^\+[^+]/.test(line)).map(line => line.slice(1));
assert.equal(removed.length, 1, 'Proposal must change exactly one engine line');
assert.equal(added.length, 1);
const applied = stats.includes(added[0]);
assert.equal(stats.split(applied ? added[0] : removed[0]).length, 2, 'Convergence line must match exactly once');
// After the source fix lands, reconstruct the old engine only in the control VM.
const baselineSource = applied ? stats.replace(added[0], removed[0]) : stats;
const candidate = applied ? stats : stats.replace(removed[0], added[0]);
const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => /function run\(\)/.test(source));
assert.ok(inline);

function capture(statsSource, variant) {
  const elements = new Map();
  for (const match of html.matchAll(/<(textarea|input|div|tbody|button)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [, tag, attrs, id] = match;
    const value = tag === 'textarea'
      ? html.slice(match.index + match[0].length).split('</textarea>')[0]
      : (attrs.match(/\bvalue="([^"]*)"/)?.[1] || '');
    elements.set(id, { value, innerHTML: '', textContent: '', addEventListener() {} });
  }
  const document = {
    getElementById(id) { assert.ok(elements.has(id), id); return elements.get(id); },
    addEventListener() {},
    querySelector(selector) {
      assert.equal(selector, '#coef-body tr');
      return elements.get('coef-body').innerHTML ? {} : null;
    }
  };
  const context = vm.createContext({
    document, console, structuredClone, MutationObserver: class { observe() {} }
  });
  context.window = context;
  for (const [filename, source] of [
    ['shared/stats-qt.js', statsSource], ['shared/rve.js', engine],
    ['rve-meta/index.html', inline], ['rve-meta/alm-live.js', adapter]
  ]) vm.runInContext(source, context, { filename });
  const a = context.AlmLiveAdapters['rve-meta'], state = a.currentState();
  return {
    fit: structuredClone(state.result.fit),
    payload: structuredClone({
      app: a.app, script: a.buildScript(state), packages: a.packages,
      appValues: a.appValues(state), compare: a.compare,
      provenance: `Isolated Node VM ${variant}; source fix applied=${applied}; NOT a browser export`
    })
  };
}

const baseline = capture(baselineSource, 'baseline');
const proposed = capture(candidate, 'candidate');
assert.deepEqual(proposed.fit, baseline.fit, 'CDF convergence must not alter the CORR/CR2 fit');
assert.equal(proposed.payload.script, baseline.payload.script, 'R oracle must remain unchanged');
assert.deepEqual(proposed.payload.compare, baseline.payload.compare, 'Comparison rules must remain unchanged');
assert.equal(proposed.payload.appValues.length, 40);
for (const value of proposed.payload.appValues) {
  const original = baseline.payload.appValues.find(item => item.key === value.key);
  assert.ok(original);
  if (!/\.(p|ci_lo|ci_hi)$/.test(value.key)) assert.equal(value.value, original.value, value.key);
  if (value.key === 'coef.1.p' || value.key === 'club.1.p') {
    console.log(`${value.key} baseline=${original.value} candidate=${value.value}`);
  }
}
const planted = structuredClone(proposed.payload);
planted.appValues.find(value => value.key === 'coef.0.estimate').value *= 1.001;
await mkdir(output, { recursive: true });
for (const [name, payload] of [
  ['baseline', baseline.payload], ['candidate', proposed.payload], ['candidate.planted', planted]
]) {
  await writeFile(new URL(`${name}.json`, output), JSON.stringify(payload, null, 2) + '\n');
}
console.log(`PRECISION PROBE: exported original baseline, ${applied ? 'applied fix' : 'in-memory candidate'} and planted candidate; diagnostic did not edit source files`);
