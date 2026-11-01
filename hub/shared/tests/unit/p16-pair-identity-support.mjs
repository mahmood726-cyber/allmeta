import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import P from '../../../../nma-inconsistency/plus-core.js';

export { P };
export const app = new URL('../../../../nma-inconsistency/', import.meta.url);
const html = readFileSync(new URL('index.html', app), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('function nodeSplit('));
// Execute the actual parser/math/engine declarations, without page startup.
const engine = vm.createContext({});
vm.runInContext(script.slice(0, script.indexOf('    function run(')), engine);
export const E = engine;
export const labels = ['A', 'A vs B', 'B vs C', 'C'];
export const plainLabels = ['T0', 'T1', 'T2', 'T3'];
export const key = (a, b) => JSON.stringify([a, b].sort());
export function rowsFor(names = labels) {
  const rows = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    rows.push({ A: names[i], B: names[j], te: i === 0 && j === 2 ? 1 : 0, se: 0.2, study: `s${i}${j}` });
  }
  return rows;
}
export function plainSplit(pair, fit, names) {
  const ids = pair.map(t => plainLabels[names.indexOf(t)]).sort();
  return fit.nodeSplit.find(s => s.comparison === ids.join(' vs '));
}
export const json = x => JSON.parse(JSON.stringify(x));
export function detailMarkup(base) {
  const source = readFileSync(new URL('plus-ui.js', app), 'utf8');
  const start = source.indexOf('  function renderDetail()');
  const end = source.indexOf('  function drawChart()', start);
  const box = { innerHTML: '' };
  const c = vm.createContext({ P, $: () => box, fmt: P.fmt, fmtP: P.fmtP, esc: String,
    state: { selected: 0, loo: { status: 'ok', base, drops: [{ ...base, study: 'unchanged' }] } } });
  vm.runInContext(source.slice(start, end) + '\nrenderDetail();', c);
  return box.innerHTML;
}

export function pageState(rows, model = 'FE') {
  // Execute the real run() mapping as well: it is the live validator's input.
  const start = script.indexOf('    function run(');
  const end = script.indexOf('    window.__almIncoLoad', start);
  const elements = {
    src: { value: rows.map(r => [r.A, r.B, r.te, r.se, r.study]
      .map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\n') },
    'f-model': { value: model }, 'ns-body': {}, dbt: {},
  };
  engine.document = { getElementById: id => elements[id] };
  engine.drawNS = () => {};
  vm.runInContext(script.slice(start, end) + '\nrun();', engine);
  return vm.runInContext('_lastInco', engine);
}

export function liveAdapter(rows, model = 'FE', transformSource = source => source) {
  const source = transformSource(readFileSync(new URL('validate/live.js', app), 'utf8'));
  const start = source.indexOf('function currentState()');
  const end = source.indexOf('const live=', start);
  const adapter = readFileSync(new URL('validate/adapter.js', app), 'utf8');
  const helpers = adapter.slice(adapter.indexOf('function leaves('), adapter.indexOf('function referenceState(')) +
    adapter.slice(adapter.indexOf('function sortedState('), adapter.indexOf('function shape('));
  let current = pageState(rows, model);
  const text = rows.map(r => [r.A, r.B, r.te, r.se, r.study]
    .map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\n');
  // Exercise the real currentState()/structuredClone boundary. DOM checks are
  // placeholders here; p16-live-replay.mjs checks those using the full DOM harness.
  const elements = { src: { value: text }, 'ns-body': { querySelectorAll: () => [] }, dbt: { textContent: '' } };
  const context = {
    structuredClone, fmt: P.fmt, $: id => elements[id],
    window: { parse: E.parse, inputIssue: E.inputIssue, _almLastInco: () => current,
      __almIncoLoad: () => { current = pageState(rows, model); } },
    a: { snapshot: () => ({ text, state: current }), restore: s => { current = s.state; },
      controls: () => true, pageText: () => [], contract: { pageText: [] }, chartControls: () => true },
  };
  return vm.runInNewContext(helpers + '\na.leaves=leaves; a.sortedState=sortedState;\n' +
    source.slice(start, end) + '\n({currentState, buildScript});', context);
}

export function liveScript(rows, model = 'FE', mutate = () => {}) {
  const live = liveAdapter(rows, model);
  const persisted = json(live.currentState());
  mutate(persisted);
  return live.buildScript(persisted);
}
