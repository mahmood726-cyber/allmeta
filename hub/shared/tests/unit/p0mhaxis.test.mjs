import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('../../../../mh-peto/index.html', import.meta.url), 'utf8');
const renderer = html.slice(html.indexOf('    function drawForest('), html.indexOf("    document.getElementById('btn-run').addEventListener"));
const studies = [{ label: 'A', est: 1, lo: 0.1, hi: 10 }];
const pooled = [{ name: 'MH', est: 1, lo: 0.5, hi: 2 }];
function render(measure, state = {}, source = renderer) {
  const svg = { innerHTML: '', setAttribute(k, v) { this[k] = v; } };
  const note = { textContent: '', hidden: true }, toggle = {
    tagName: 'INPUT', type: 'checkbox', dataset: { autosaveIndex: '8' },
    setAttribute(k, v) { this[k] = v; },
  };
  runInNewContext(source + '\ndrawForest(studies, pooled, measure);', {
    studies, pooled, measure, _axisState: state, escSvg: String,
    document: { getElementById: id => id === 'forest' ? svg : note, querySelector: () => toggle },
  });
  const ticks = Object.fromEntries([...svg.innerHTML.matchAll(/class="forest-tick-label" x="([^"]+)"[^>]*>([^<]+)</g)].map(m => [m[2], +m[1]]));
  return { svg, note, toggle, ticks, ref: +svg.innerHTML.match(/<line x1="([^"]+)"/)[1] };
}
const close = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('pre-fix controls: explicitly logarithmic OR/RR and linear RD', () => {
  for (const measure of ['OR', 'RR']) {
    const r = render(measure, { x: [0.1, 10], xLog: true });
    close(r.ref, 350);
    close(r.ticks['1'] - r.ticks['0.1'], r.ticks['10'] - r.ticks['1']);
  }
  close(render('RD', { x: [-1, 1], xLog: false }).ref, 350);
});

for (const measure of ['OR', 'RR']) {
  test(`${measure}: plant false xLog with custom limits; control true xLog`, () => {
    for (const xLog of [false, true]) {
      const r = render(measure, { x: [0.1, 10], xLog });
      close(r.ticks['1'] - r.ticks['0.1'], r.ticks['10'] - r.ticks['1']);
      close(r.ref, r.ticks['1']);
      assert.match(r.svg.innerHTML, /\(log scale\)/);
    }
  });
}
test('RD: plant true xLog; control false xLog both stay linear at zero', () => {
  for (const xLog of [true, false]) {
    const r = render('RD', { x: [-1, 1], xLog });
    close(r.ref, r.ticks['0']);
    close(r.ticks['0'] - r.ticks['-0.5'], r.ticks['0.5'] - r.ticks['0']);
    assert.doesNotMatch(r.svg.innerHTML, /\(log scale\)/);
  }
});
test('nonpositive ratio limit is refused with recovery advice; positive control clears warning', () => {
  for (const measure of ['OR', 'RR']) for (const x of [[0, 10], [-1, 10], [null, 0]]) {
    const r = render(measure, { x, xLog: true });
    assert.equal(r.note.hidden, false);
    assert.match(r.note.textContent, /positive/i);
    assert.match(r.note.textContent, /enter|clear/i);
    assert.equal(r.svg.innerHTML, render(measure).svg.innerHTML);
  }
  assert.equal(render('OR', { x: [0.1, 10] }).note.hidden, true);
});
test('positive ratio limits smaller than 1e-6 are not clamped', () => {
  const r = render('OR', { x: [1e-9, 10], xLog: true });
  // Plot edges are 130 and 570; historical 10% padding is retained.
  const expected = 130 + (Math.log(1) - Math.log(1e-9) + Math.log(1e10) * 0.1) / (Math.log(1e10) * 1.2) * 440;
  close(r.ref, expected);
  close(render('OR', { x: [0.1, 10], xLog: true }).ref, 350);
});
test('default SVG bytes match pre-fix renderer for every measure', () => {
  const hashes = { OR: '28f15743a9fb7fbf0aaee72df26135f9d3feb2bd6427a613d02d1d01fff36d96', RR: '710f6fd03703b2941f73718b71fd0793520c151f3a5c06b30b4b58b698a1e153', RD: '6ab824d1d0de568ce9b96e3891295abe0c935308962cce361f07562d1adcffbb' };
  for (const measure of Object.keys(hashes)) {
    const r = render(measure);
    const bytes = r.svg.viewBox + '\n' + r.svg.innerHTML;
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hashes[measure]);
    const plant = render(measure, {}, renderer.replace('var padL = 130', 'var padL = 131'));
    assert.notEqual(createHash('sha256').update(plant.svg.viewBox + '\n' + plant.svg.innerHTML).digest('hex'), hashes[measure]);
    assert.equal(render(measure, { x: [null, null], xLog: measure !== 'RD' }).svg.innerHTML, r.svg.innerHTML);
  }
});
test('geometry oracle rejects a planted linear ratio renderer', () => {
  const plant = renderer.replace("var logScale = measure !== 'RD';", 'var logScale = false;');
  assert.notEqual(plant, renderer);
  const r = render('OR', { x: [0.1, 10] }, plant);
  assert.throws(() => close(r.ref, 350));
  close(render('OR', { x: [0.1, 10], xLog: true }).ref, 350);
});

const autosaveContext = {};
runInNewContext(readFileSync(new URL('../../../../shared/autosave.js', import.meta.url), 'utf8'), autosaveContext);
function savedScale(toggle) {
  return autosaveContext.AlmAutosave._snapshot([toggle]);
}
test('autosave control retains idx:8; native-disabled plant loses that key', () => {
  const toggle = { ...render('OR').toggle, disabled: false };
  assert.equal(savedScale(toggle)['idx:8'], true);
  assert.equal(Object.hasOwn(savedScale({ ...toggle, disabled: true }), 'idx:8'), false);
});
test('measure-locked scale remains in the existing autosave schema for OR/RR/RD', () => {
  for (const measure of ['OR', 'RR', 'RD']) {
    const { toggle } = render(measure);
    assert.deepEqual(Object.keys(savedScale(toggle)), ['idx:8']);
    assert.equal(savedScale(toggle)['idx:8'], measure !== 'RD');
    assert.equal(toggle['aria-disabled'], 'true');
    let prevented = false;
    toggle.onclick({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
});
