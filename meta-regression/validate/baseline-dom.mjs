// Computation/serialised-DOM fallback; this does not claim browser paint coverage.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const {parseHTML}=await import(pathToFileURL(process.env.LINKEDOM_MODULE).href);
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const {window}=parseHTML(html),{document}=window;
const localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
window.alm={analysisLifecycle:f=>f,plotExport:()=>{}};
const context=vm.createContext({window,document,localStorage,console,Math,Date,URL,Blob,setTimeout,clearTimeout});
for(const f of ['ma-core.js','permutest.js','location-scale.js'])vm.runInContext(readFileSync(new URL('../../shared/'+f,import.meta.url),'utf8'),context);
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(x=>x[1].trim()).map(x=>x[1]);
vm.runInContext(scripts.find(x=>x.includes('const LS_KEY')),context);
if(process.argv[2]==='after-dom'){
 document.styleSheets=[];context.structuredClone=structuredClone;
 context.AlmValidate={mount(el){el.innerHTML='<h2></h2>';return {};}};
 for(const n of document.querySelectorAll('#alm-plus input[type="checkbox"]'))n.checked=false;
 for(const name of ['plus-engine.js','validate/contract.js','plus-ui.js','validate/plus-pins.js','validate/plus-adapter.js']){
  vm.runInContext(readFileSync(new URL('../'+name,import.meta.url),'utf8'),context,{filename:name});
  for(const key of ['AlmMetaPlus','AlmMetaPlusContract','AlmMetaPlusUI','AlmMetaPlusManifest','AlmMetaPlusDisplay','AlmMetaPlusValidationAdapter'])if(window[key])context[key]=window[key];
 }
}
const result=[];
for(const data of [null,'A, .1, .2, 1\nB, .5, .15, 2\nC, -.3, .1, 3\nD, .4, .12, 4\nE, -.2, .2, 5\nF, .6, .18, 6']){
 if(data!==null){document.getElementById('f-data').value=data;document.getElementById('btn-run').dispatchEvent(new window.Event('click'));}
 result.push({fit:window._almLastFitted(),studies:window._almLastStudies(),hk:window._almLastHK(),r2:window._almLastR2(),qe:window._almLastQE(),pi:window._almLastPI(),perm:window._almLastPerm(),table:document.querySelector('#stats-wrap').textContent,svg:document.querySelector('#svg-host').innerHTML});
}
const output={scope:'Original computation and serialised DOM; no browser layout or original MANIFEST replay',scripts:scripts.map(s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex')),result};
writeFileSync(new URL('./plus/'+(process.argv[2]||'baseline-dom')+'.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
if(process.argv[2]==='after-dom'){
 const before=JSON.parse(readFileSync(new URL('./plus/baseline-dom.json',import.meta.url)));
 if(JSON.stringify(before)!==JSON.stringify(output))throw Error('Original computation or inline scripts changed');
 console.log('2/2 original DOM scenarios identical; '+scripts.length+'/'+scripts.length+' inline scripts identical.');
}else console.log('Captured 2 original DOM scenarios before editing index.html.');
