// Execute the page's own inline engine; stub only DOM/shared UI plumbing.
// Read-only observers record pool memberships and draw arguments. No formula,
// enumeration, sampler, refusal or coordinate code is replaced.
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const nodes = {};
for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
  nodes[m[1]] = {value: m[0].match(/\bvalue="([^"]*)"/)?.[1] || '',
    textContent: '', innerHTML: '', style: {},
    addEventListener(event, fn) { const previous = this[event]; this[event] = (...args) => { if (previous) previous(...args); fn(...args); }; }};
}
nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
nodes.model.value = html.match(/<option value="([^"]+)" selected/)[1];
const noop = () => {};
let axisChange, points = [], memberships = [], pooled = [];
const window = {alm: {analysisLifecycle: run => run, csvUpload: noop, plotExport: noop,
  axisControls: options => { axisChange = options.onChange; },
  resultsExport: noop, resetUndo: noop, tooltips: noop,
  urlState: Object.assign(noop, {read: () => null, write: noop})}};
let script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function observe(marker, observer) {
  if (script.split(marker).length !== 2) throw new Error('Observer anchor changed: ' + marker);
  script = script.replace(marker, marker + observer);
}
script = script.replace('function pool(rows, model) {', 'function originalPool(rows, model) {');
script = script.replace('function originalPool(rows, model) {', 'function pool(rows, model) { const result = originalPool(rows, model); observePool(rows, result); return result; }\nfunction originalPool(rows, model) {');
observe('function draw(pts) {', '\nobserveDraw(pts);');
vm.runInNewContext(script, {window,
  document: {getElementById(id) {
    if (!nodes[id]) throw new Error('Unexpected DOM node: ' + id);
    return nodes[id];
  }},
  observePool: (rows, result) => { memberships.push(rows.map(r => r.label)); pooled.push(result); },
  observeDraw: pts => { points = JSON.parse(JSON.stringify(pts)); }
}, {timeout: 10000});
// Synthetic inputs are software fixtures, not clinical evidence.
function data(k) {
  return Array.from({length: k}, (_, i) => `${2 ** i}, 1, S${i}`).join('\n');
}
function snapshot() {
  return JSON.parse(JSON.stringify({result: window._almLastGosh(),
    count: nodes['m-n'].textContent, median: nodes['m-est'].textContent,
    i2: nodes['m-i2'].textContent, svg: nodes.plot.innerHTML,
    points, memberships, pooled, sampleVisible: nodes['sample-label'].style.display,
    plotNote: nodes['plot-note']?.textContent || '',
    plotError: nodes['plot-error']?.textContent || '',
    error: nodes['sample-error']?.textContent || ''}));
}
function run(k, model = 'FE') {
  points = []; memberships = []; pooled = [];
  nodes.src.value = data(k); nodes.model.value = model;
  nodes['btn-run'].click();
  return snapshot();
}
const enumeration = {};
for (const model of ['FE', 'DL']) for (const k of [4, 5]) {
  enumeration[`${model}-${k}`] = run(k, model);
}
const defaultDraws = Number(nodes['n-sample'].value);
const sampled = run(16);
const sampleRecovery = ['-1000', '0', '2.5', '', '100001'].map(value => {
  nodes['n-sample'].value = '5000';
  const before = run(16);
  nodes['n-sample'].value = value;
  const refused = run(16);
  nodes['n-sample'].value = '37';
  const after = run(16);
  return {value, before, refused, after};
});
nodes['n-sample'].value = String(defaultDraws);
const recovery = [2, 101].map(k => {
  const before = run(4), refused = run(k), after = run(4);
  return {k, before, refused, after};
});
// Select effects that exist in both old and new enumerations, so this check
// isolates the axis bug rather than depending on singleton inclusion.
run(4);
const limits = [1, 8]; // all points contained, including both endpoints
points = []; memberships = []; pooled = [];
axisChange({x: limits});
const axis = {limits, ...snapshot()};
const axisSweep = [
  {x: [1.5, 2], y: [0, 1]},
  {x: [-20, 20], y: [-10, 110]},
  {x: [-2, -1.5], y: [0, 100]},
  {x: [null, 2], y: [null, 1]},
  {x: [1.5, null], y: [0, null]},
  {}
].map(limits => {
  const negative = limits.x && limits.x[0] < 0 && limits.x[1] < 0;
  nodes.src.value = (negative ? [-2, -1.8, -1.6, -1.5] : [1.5, 1.6, 1.8, 2])
    .map((v, i) => `${v}, 1, S${i}`).join('\n');
  axisChange(limits);
  return {limits, ...snapshot()};
});
axisChange({});
run(4);
axisChange({x: [1.5, 2]});
const excluded = snapshot();
const invalidAxes = [];
for (const model of ['FE','DL']) for (const [name,limits] of [
 ['reversed-x',{x:[8,1]}], ['equal-y',{y:[50,50]}],
 ['nan-x',{x:[NaN,8]}], ['infinite-y',{y:[0,Infinity]}]]) {
 axisChange({}); const before=run(4,model);
 axisChange(limits); const refused=snapshot();
 axisChange({}); const after=snapshot();
 invalidAxes.push({model,name,before,refused,after});
}
const axisRecovered = snapshot();
const coordinateCases = [], messageRecovery = [], subnormal = [];
for (const model of ['FE', 'DL']) {
  axisChange({}); run(4, model);
  const original = snapshot().result;
  const maxI2 = Math.max(...snapshot().points.map(p => p.I2));
  for (const limits of [{x:[1,8]}, {y:[0,90]}, {x:[1,8],y:[-10,110]},
      {x:[null,4]}, {x:[2,null]}, {y:[10,null]}, {y:[null,50]},
      {x:[1.5,2],y:[0,100]}, {y:[0,maxI2]}, {x:[2.5,4],y:[10,80]}]) {
    axisChange(limits);
    coordinateCases.push({model, limits, original, ...snapshot()});
  }
  for (const source of ['note', 'error']) for (const refusal of ['small','large','sample','empty-load','invalid-load']) {
    axisChange({}); run(4, model);
    axisChange(source === 'note' ? {x:[1.5,2]} : {x:[2,1]});
    const before = snapshot();
    if (refusal === 'small') run(2,model);
    if (refusal === 'large') run(101,model);
    if (refusal === 'sample') { nodes['n-sample'].value='0'; run(16,model); }
    if (refusal === 'empty-load') window.__almGoshLoad([]);
    if (refusal === 'invalid-load') window.__almGoshLoad([{yi:'bad',sei:1}]);
    const refused = snapshot();
    nodes['n-sample'].value=String(defaultDraws); axisChange({});
    const after = run(4,model);
    messageRecovery.push({model,source,refusal,before,refused,after});
  }
  axisChange({}); nodes.model.value=model;
  nodes.src.value=Array(4).fill('5e-324, 1').join('\n'); nodes['btn-run'].click();
  subnormal.push({model,...snapshot()});
}
console.log(JSON.stringify({enumeration, defaultDraws, sampled, sampleRecovery, recovery,
  axis, axisSweep, excluded, invalidAxes, axisRecovered, coordinateCases, messageRecovery, subnormal, html}));
