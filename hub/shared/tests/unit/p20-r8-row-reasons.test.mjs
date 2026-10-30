import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../effect-size-converter/index.html', import.meta.url), 'utf8');
const pageScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('function convert('));
assert.ok(pageScript, 'execute the real conversion and rendering script');

// Small DOM sink for the unmodified page script, including its button listener.
// Assertions inspect emitted table cells, not browser layout or screen-reader output.
function page() {
  function element(tag) {
    let markup = '';
    const listeners = {}, attributes = {};
    return {
      tagName: tag.toUpperCase(), value: '', children: [], hidden: false,
      get innerHTML() { return markup; },
      set innerHTML(value) { markup = String(value); this.children = []; },
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(name, value) { attributes[name] = String(value); },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      click() { for (const fn of listeners.click || []) fn(); },
    };
  }
  const nodes = new Map([...html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g)]
    .map(m => [m[2], element(m[1])]));
  const el = id => nodes.get(id);
  for (const [id, value] of Object.entries({
    'in-type': 'RR', 'in-est': '2', 'in-se': '0.12', 'ctx-p0': '0.6',
  })) el(id).value = value;
  const context = vm.createContext({ document: { getElementById: el, createElement: element }, window: {} });
  vm.runInContext(pageScript, context, { filename: 'effect-size-converter/index.html' });
  return {
    el, context,
    convert(values) {
      for (const [id, value] of Object.entries(values)) el(id).value = value;
      el('btn-convert').click();
    },
    row(scale) {
      const index = context.window.__almResultRows.findIndex(r => r.scale === scale);
      assert.ok(index >= 0, `conversion row ${scale} exists`);
      return { data: context.window.__almResultRows[index], node: el('results-body').children[index] };
    },
  };
}

function textContent(markup) {
  return markup.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g,
    (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[name]));
}

function cells(row) {
  return [...row.node.innerHTML.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]
    .map(m => ({ attributes: m[1], markup: m[2], text: textContent(m[2]) }));
}

function assertVisibleNote(row) {
  const rowCells = cells(row);
  const note = rowCells.find(cell => cell.text === row.data.note);
  assert.ok(note, `row reason must be table-cell text, not just a title: ${row.data.note}`);
  assert.doesNotMatch(note.attributes, /\bhidden\b|aria-hidden|display\s*:\s*none|visibility\s*:\s*hidden/i);
  assert.doesNotMatch(note.markup, /<[^>]+>/, 'the note is ordinary text, with no hidden descendant or hover-only control');
  assert.equal(row.node.hidden, false);
  const header = html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1];
  const headings = [...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(m => textContent(m[1]));
  assert.equal(headings[rowCells.indexOf(note)], 'Notes', 'the reason has a table column heading');
}

test('plant P20-R8: RR=2, p0=0.6 refusal reason is visible in its OR row', () => {
  const p = page(), row = p.row('OR');
  assert.equal(row.data.note, 'implied p₁ = RR·p₀ = 1.200 outside (0,1) — OR/RD/SMD not defined');
  assert.ok(Number.isNaN(row.data.point), 'control: the impossible OR remains refused');
  assert.deepEqual(cells(row).slice(0, 4).map(c => c.text), ['OR', '—', '—', '—']);
  assertVisibleNote(row);
});

test('plant P20-R8: a finite OR with refused SE exposes its risk-ceiling reason', () => {
  const p = page();
  p.convert({ 'in-est': '1.999', 'ctx-p0': '0.5' });
  const row = p.row('OR');
  assert.ok(Number.isFinite(row.data.point));
  assert.ok(Number.isNaN(row.data.se));
  assert.match(row.data.note, /SE undefined at risk ceiling/);
  assertVisibleNote(row);
});

test('plant P20-R8: visible notes escape markup and retain literal explanation text', () => {
  const p = page();
  const note = 'Reason <unavailable> & "quoted" with \'apostrophes\'';
  p.context.render([{ scale: 'OR', point: NaN, se: NaN, note }], null);
  const row = p.row('OR');
  assertVisibleNote(row);
  assert.ok(cells(row).some(c => c.markup === 'Reason &lt;unavailable&gt; &amp; &quot;quoted&quot; with &#39;apostrophes&#39;'));
});

test('control P20-R8: valid RR conversion retains numeric cells and clears the previous refusal', () => {
  const p = page();
  p.convert({ 'ctx-p0': '0.2' });
  assert.deepEqual(cells(p.row('RR')).slice(0, 4).map(c => c.text), ['RR', '2.000', '0.120', '[1.581, 2.530]']);
  const or = p.row('OR');
  assert.deepEqual(cells(or).slice(0, 4).map(c => c.text), ['OR', '2.667', '0.200', '[1.802, 3.946]']);
  assert.equal(or.data.note, 'via RR→OR given p₀; log-scale SE');
  for (const row of p.el('results-body').children) {
    assert.doesNotMatch(row.innerHTML, /outside \(0,1\)/);
    assert.doesNotMatch(row.title || '', /outside \(0,1\)/);
  }
});

test('control P20-R8: a row without a note keeps its numeric cells and no invented explanation', () => {
  const p = page();
  p.convert({ 'in-type': 'MD', 'in-est': '1', 'in-se': '0.2', 'ctx-p0': '' });
  const row = p.row('MD');
  assert.equal(row.data.note, '');
  assert.deepEqual(cells(row).slice(0, 4).map(c => c.text), ['MD', '1.000', '0.200', '[0.608, 1.392]']);
  assert.ok(cells(row).slice(4).every(c => c.text === ''));
});

test('control P20-R8: primary actions remain native buttons and global status remains live', () => {
  for (const id of ['btn-convert', 'btn-derive']) {
    const tag = html.match(new RegExp(`<button\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
    assert.ok(tag, `${id} is a native button`);
    assert.doesNotMatch(tag, /\bdisabled\b|tabindex="-1"/);
  }
  const status = html.match(/<div\b[^>]*\bid="warn-slot"[^>]*>/)?.[0];
  assert.match(status, /role="status"/);
  assert.match(status, /aria-live="polite"/);
});
