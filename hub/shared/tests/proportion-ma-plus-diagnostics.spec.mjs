import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const app=new URL('../../../proportion-ma/',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,app),'utf8'));
test('Host 3 diagnostic trace',async({page},info)=>{
 test.skip(process.env.GLMM_DIAGNOSTICS!=='1','Opt-in numerical diagnostics; not a parity gate');
 test.setTimeout(1200000);
 await page.goto('/proportion-ma/index.html');
 const failures=new Set(read('validate/diagnostics/host3-comparison.json').failures.map(f=>f.id));
 let cases=read('validate/plus-corpus/corpus.json').filter(c=>failures.has(c.id)).sort((a,b)=>a.rows.length-b.rows.length||a.id.localeCompare(b.id));
 if(process.env.GLMM_DIAGNOSTICS_SMALL==='1')cases=cases.slice(0,3);
 const refs=read('validate/plus-corpus/reference-plus.json');
 const script=fs.readFileSync(new URL('validate/diagnostics/trace-glmm.R',app),'utf8').replaceAll('\r\n','\n');
 const output=info.outputPath('trace.log');
 for(const ca of cases){
  const ref=refs[ca.id].metafor.values;
  const common=ref?`.diagCommon <- c(${Math.sqrt(ref.tau2)},${ref.mu})`:'if(exists(".diagCommon"))rm(.diagCommon)';
  const result=await page.evaluate(async({script,ca,common})=>AlmWebR.runR({packages:['metafor','lme4','numDeriv'],script:'tryCatch(eval(parse(text='+JSON.stringify(script+`\n${common}\ncat('CASE:${ca.id}\\n')\ndiagnose(c(${ca.rows.map(r=>r.x)}),c(${ca.rows.map(r=>r.n)}))\nuntrace('optwrap',where=asNamespace('lme4'));untrace('glmer',where=asNamespace('lme4'))`)+')),error=function(e)cat("DIAGNOSTIC_ERROR:",conditionMessage(e)))'}),{script,ca,common});
  fs.appendFileSync(output,result.stdout||JSON.stringify(result));
  expect(result.ok).toBe(true);expect(result.stdout).toContain('SE_RICHARDSON');
 }
 await info.attach('diagnostic-trace',{path:output,contentType:'text/plain'});
});
