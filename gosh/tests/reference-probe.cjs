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
    addEventListener(event, fn) { this[event] = fn; }};
}
nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
nodes.model.value = html.match(/<option value="([^"]+)" selected/)[1];
const noop = () => {};
let axisChange, points = [], memberships = [], pooled = [];
const window = {alm: {csvUpload: noop, chartDownload: noop,
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

const fixture = fs.readFileSync(require('path').join(__dirname,'fixtures/gosh-tiny.csv'),'utf8').trim().split(/\r?\n/).slice(1).map(line=>{
 const [study,yi,vi]=line.split(','); return {study,yi:Number(yi),vi:Number(vi)};
});
const out={};
for(const model of ['FE','DL']) {
 nodes.model.value=model; window.__almGoshLoad(fixture); out[model]=snapshot();
}
nodes.model.value='FE'; nodes['n-sample'].value='38';
window.__almGoshLoad(Array.from({length:16},(_,i)=>({yi:(13+137*i)/100,sei:(231+70*i)/1000,study:'Distinct_'+(i+11)})));
out.even=snapshot();
window.__almGoshLoad([.1,.2,.3,1*(1+1e-9)].map((yi,i)=>({yi,sei:1,study:'Edge'+i})));
axisChange({x:[0,1],y:[0,100]}); out.outside=snapshot();
console.log(JSON.stringify(out));
