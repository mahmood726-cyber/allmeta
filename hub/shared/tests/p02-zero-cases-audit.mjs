// Compare actual outputs with the unmodified local origin/main; no network or checkout.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const root=new URL('../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const current=read('shared/dose-response.js');
const baseline=execFileSync('git',['show','origin/main:shared/dose-response.js'],{encoding:'utf8'});
function engine(source){const c=vm.createContext({});vm.runInContext(source,c);return c.AlmDoseResponse;}
const before=engine(baseline), after=engine(current);
function group(rows){const m=new Map();for(const r of rows){if(!m.has(r.id))m.set(r.id,{id:r.id,mod:r.mod,rows:[]});m.get(r.id).rows.push(r);}return [...m.values()];}
function snapshot(engine,rows,opts,doses=[0,1]){const r=engine.fitDR(group(rows),opts);return JSON.parse(JSON.stringify({...r,predictions:r.ok?r.predict(doses,0):null}));}
const fixture=JSON.parse(read('hub/shared/tests/unit/p02-zero-cases-reference.json'));
const f=fixture.cases.find(f=>f.name==='cc/nonreference/h/2stage');
const b=snapshot(before,f.rows,f), a=snapshot(after,f.rows,f);
const changes=[];
function diff(b,a,path=''){if(typeof b==='number'||typeof a==='number'){if(b!==a)changes.push({field:path,before:b??null,after:a??null});return;}if((b&&typeof b==='object')||(a&&typeof a==='object')){for(const key of new Set([...Object.keys(b||{}),...Object.keys(a||{})]))diff(b?.[key],a?.[key],path?path+'.'+key:key);}}
diff(b,a);
const corpus=JSON.parse(read('dose-response-ma/validate/corpus/reference.json'));
let zeros=0;
for(const ds of corpus.datasets) zeros+=(ds.rows||[]).filter(r=>r.cases===0).length;
const html=read('dose-response-ma/index.html');const c=vm.createContext({window:{},$:()=>({value:'gl'})});
vm.runInContext(html.slice(html.indexOf('    var EXAMPLE ='),html.indexOf('    var DR =')),c);
vm.runInContext(html.slice(html.indexOf('    function inputError('),html.indexOf('    function syncControls(')),c);
const rows=c.parse(c.EXAMPLE,false).flatMap(s=>s.rows.map(r=>({...r,id:s.id})));
const eb=snapshot(before,rows,{}), ea=snapshot(after,rows,{});
if(JSON.stringify(eb)!==JSON.stringify(ea))throw Error('Built-in example changed');
const out={baseline:'origin/main',dataset:fixture.dataset,settings:{model:f.model,covariance:f.covariance,proc:f.proc,method:f.method},
 corpusZeroCaseRows:zeros,example:{dataset:'alcohol_cvd (rounded built-in)',slope:ea.coef[0],se:Math.sqrt(ea.vcov[0][0]),unchanged:true},
 before:b,after:a,changedNumbers:changes};
writeFileSync(new URL('dose-response-ma/zero-cases-derived.json',root),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({slopeBefore:b.coef[0],slopeAfter:a.coef[0],seBefore:Math.sqrt(b.vcov[0][0]),seAfter:Math.sqrt(a.vcov[0][0]),changedNumbers:changes.length,example:out.example,corpusZeroCaseRows:zeros}));
