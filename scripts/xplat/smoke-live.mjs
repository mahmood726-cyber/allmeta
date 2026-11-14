// Optional dependency-free diagnostic for environments that cannot start a
// browser. Executes each original page script with minimal DOM storage.
// This is NOT browser/webR evidence and never writes the Playwright exports.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { apps } from './live-browser.mjs';
const root = new URL('../../', import.meta.url);
const output = new URL('validation/live/node-smoke/', root);
await mkdir(output, { recursive: true });
for (const app of apps) {
  const html = await readFile(new URL(`${app}/index.html`, root), 'utf8');
  const elements = new Map();
  for (const match of html.matchAll(/<(textarea|input|select|div|tbody|svg)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [,tag,attrs,id] = match;
    const content = tag === 'input' ? '' : html.slice(match.index+match[0].length).split(`</${tag}>`)[0];
    let value = tag === 'textarea' ? content : (attrs.match(/\bvalue="([^"]*)"/)?.[1] || '');
    if (tag === 'select') value = content.match(/<option value="([^"]+)"/)?.[1] || '';
    elements.set(id,{ value, innerHTML:'', textContent:'', handlers:{},
      addEventListener(event,fn) { this.handlers[event]=fn; }, setAttribute() {} });
  }
  // Buttons are only needed for the page's own run listener.
  elements.set('btn-run',{handlers:{},addEventListener(event,fn){this.handlers[event]=fn;}});
  const document = {
    currentScript: process.env.ALM_LIVE_DIAGNOSTIC_ORIGIN ?
      { src: new URL(`${app}/alm-live.js`, process.env.ALM_LIVE_DIAGNOSTIC_ORIGIN).href } : null,
    getElementById(id) { if (!elements.has(id)) throw Error('Unknown DOM element '+id); return elements.get(id); },
    addEventListener() {},
    querySelector(selector) { if(selector==='#coef-body tr') return elements.get('coef-body').innerHTML ? {} : null; throw Error('Unknown selector '+selector); }
  };
  const context = { document, console, URL, structuredClone, matchMedia:()=>({matches:false}), MutationObserver:class {observe(){}} };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  const dependencies = app==='multivariate-ma' ? ['shared/multivariate-ma.js'] : app==='rve-meta' ? ['shared/stats-qt.js','shared/rve.js'] : [];
  for (const file of dependencies) vm.runInContext(await readFile(new URL(file,root),'utf8'),context,{filename:file});
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>/function run\(\)/.test(s));
  assert.ok(inline,'page run script');
  vm.runInContext(inline,context,{filename:`${app}/index.html`});
  const adapterCode=await readFile(new URL(`${app}/alm-live.js`,root),'utf8');
  vm.runInContext(adapterCode,context,{filename:`${app}/alm-live.js`});
  const a=context.AlmLiveAdapters[app], state=a.currentState();
  const data=structuredClone({app,script:a.buildScript(state),packages:a.packages,appValues:a.appValues(state),compare:a.compare,
    provenance:'Node execution with DOM storage stubs; NOT a Playwright or webR export'});
  assert.ok(data.appValues.length>=6);
  assert.equal(new Set(data.appValues.map(v=>v.key)).size,data.appValues.length);
  await writeFile(new URL(`${app}.json`,output),JSON.stringify(data,null,2)+'\n');
  const target=data.appValues.find(v=>/^(split\.0\.direct|mu1|coef\.0\.estimate)$/.test(v.key));
  assert.ok(Number.isFinite(target.value)&&target.value!==0);
  target.value*=1.001;
  await writeFile(new URL(`${app}.planted.json`,output),JSON.stringify(data,null,2)+'\n');
  // A planted attempt to recompute must not be invoked by either reader.
  if(app==='nma-inconsistency') context.fitNMA=()=>{throw Error('Unexpected fit');};
  if(app==='multivariate-ma') context.AlmMultivariate.fit=()=>{throw Error('Unexpected fit');};
  if(app==='rve-meta') context.AlmRVE.fitCORR=()=>{throw Error('Unexpected fit');};
  assert.deepEqual(structuredClone(a.appValues(a.currentState())),structuredClone(a.appValues(state)));
  elements.get(app==='multivariate-ma'?'f-data':'src').value='pending edit';
  assert.throws(()=>a.currentState(),/out of date/);
  if(app==='rve-meta') elements.get('coef-body').innerHTML='';
  else if(app==='multivariate-ma') context._almLastMultivariate=()=>null;
  else context._almLastInco=()=>null;
  assert.throws(()=>a.currentState(),/no .*result/);
  // Module exports also work in Node without a DOM.
  const nodeContext={module:{exports:{}}};vm.createContext(nodeContext);
  vm.runInContext(adapterCode,nodeContext);
  assert.equal(nodeContext.module.exports.app,app);
  console.log(`NODE SMOKE ${app}: ${data.appValues.length} values; read-only, stale and missing-result gates passed`);
}
