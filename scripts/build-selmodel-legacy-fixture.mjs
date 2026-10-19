// Run explicitly when reviewing the legacy contract; tests never regenerate it.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n');
const ctx=vm.createContext({});ctx.window=ctx;
for(const p of ['shared/ma-core.js','shared/selmodel.js'])vm.runInContext(read(p),ctx);
const encode=x=>typeof x==='number'&&!Number.isFinite(x)?{$number:String(x)}:Object.is(x,-0)?{$number:'-0'}:x;
const corpus=JSON.parse(read('limit-ma/validate/plus/corpus.json'));
const fixture={sha256:createHash('sha256').update(read('shared/selmodel.js')).digest('hex'),outputs:corpus.map(c=>({id:c.id,result:ctx.AlmSelModel.fit(c.te,c.se.map(s=>s*s),{steps:[.025],method:'REML'})}))};
writeFileSync(new URL('hub/shared/tests/fixtures/selmodel-legacy-plus.json',root),JSON.stringify(fixture,(_,x)=>encode(x),2)+'\n');
console.log(fixture.sha256,fixture.outputs.length);
