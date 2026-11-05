// Read-only replay: original validation sources run with output redirected to TEMP.
// No references, manifests, validation corpora or base files are rewritten.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { loadPage } from './p08-harness.mjs';
const sourceRoot=pathToFileURL(resolve('.')+'/'), read=p=>readFileSync(new URL(p,sourceRoot),'utf8');
if(!existsSync(new URL('meta-regression/index.html',sourceRoot))){console.log('UNAVAILABLE: this tree has no meta-regression/index.html; no base replay or base planted-defect result can be claimed.');process.exitCode=1;}
else {
 const temp=join(tmpdir(),'p08-bcg-example-evidence'); mkdirSync(temp,{recursive:true});
 const snapshotPath=join(temp,'original-sources.json');
 const sourceNames=['meta-regression/index.html','shared/canonical-datasets.js','shared/hero-examples.js','meta-regression/plus-engine.js','meta-regression/plus-ui.js'];
 const sources=Object.fromEntries(sourceNames.map(p=>[p,read(p)]));
 const phase=existsSync(snapshotPath)?'after':'before';
 if(phase==='before')writeFileSync(snapshotPath,JSON.stringify(sources));
 const h=loadPage({sourceRoot}), scenarios=[h.capture()];
 h.setData('A, .1, .2, 1\nB, .5, .15, 2\nC, -.3, .1, 3\nD, .4, .12, 4\nE, -.2, .2, 5\nF, .6, .18, 6');scenarios.push(h.capture());
 const baselinePath=join(temp,'before-scenarios.json');
 if(phase==='before')writeFileSync(baselinePath,JSON.stringify(scenarios));
 else assert.deepEqual(scenarios,JSON.parse(readFileSync(baselinePath,'utf8')),'Both supplied baseline-dom scenarios retain identical calculations, cards and serialized SVG');
 const picker=loadPage({sourceRoot});picker.chooseBCG();
 console.log(JSON.stringify({phase,scope:'actual page VM; supplied baseline-dom scenarios; no browser paint',baselineScenarios:scenarios.length,picker:{k:picker.parse().studies.length,rejected:picker.parse().warnings.length,results:picker.window.__almResults()},sourceHashes:Object.fromEntries(sourceNames.map(n=>[n,createHash('sha256').update(sources[n]).digest('hex')]))}));
 if(phase==='after'){
  const originalSources=JSON.parse(readFileSync(snapshotPath,'utf8'));
  for(const [name,hash] of Object.entries({'meta-regression/index.html':'263d040ca4bd53d7125181b00687c78be3630efb41ba4573da0d8b95c81ed067','shared/canonical-datasets.js':'32f5b35faff14429602f95a72d79ddc8b6864098e94c652a81cd537579770aca'}))assert.equal(createHash('sha256').update(originalSources[name]).digest('hex'),hash,'Original source snapshot must match pass-1 evidence');
  for(const name of ['shared/hero-examples.js','meta-regression/plus-engine.js','meta-regression/plus-ui.js'])assert.equal(sources[name],originalSources[name],name+' remains unchanged');
  const before=loadPage({sourceRoot,overrides:originalSources});before.chooseBCG();
  assert.equal(before.parse().studies.length,0);assert.equal(before.parse().warnings.length,13);
  assert.equal(picker.parse().studies.length,13);assert.equal(picker.parse().warnings.length,0);
  const oldAPI=before.window.AlmDatasets,newAPI=picker.window.AlmDatasets;
  for(const key of oldAPI.list())for(const adapter of Object.keys(oldAPI).filter(k=>k.startsWith('to')))assert.equal(newAPI[adapter](newAPI.get(key)),oldAPI[adapter](oldAPI.get(key)),key+' '+adapter+' unchanged');
  console.log('Verified original wt source snapshot (not base): picker k=0/rejected=13 -> k=13/rejected=0; all existing adapters return identical text for every dataset.');
  const r=JSON.parse(read('hub/shared/tests/unit/p08-bcg-reference.json')).PM,a=picker.window.__almResults();
  const expected={intercept:r.beta[0],slope:r.beta[1],intercept_se:r.se[0],slope_se:r.se[1],intercept_ci_lb:r.ci_lb[0],intercept_ci_ub:r.ci_ub[0],slope_ci_lb:r.ci_lb[1],slope_ci_ub:r.ci_ub[1],tau2_pm:r.tau2,R2_tau2:r.R2/100,QE:r.QE,QE_p:r.QEp};
  const differences=Object.fromEntries(Object.entries(expected).map(([key,value])=>[key,Math.abs(a[key]-value)/Math.max(1,Math.abs(value))]));
  for(const [key,diff] of Object.entries(differences))assert.ok(Number.isFinite(diff)&&diff<=1e-9,key+' retains the paper tolerance');
  console.log(JSON.stringify({BCG_PM_normalized_differences:differences,max:Math.max(...Object.values(differences)),prediction:picker.window._almLastPI(),permutation:picker.window._almLastPerm()}));
  // Separate the paper's Use case quantities from additional model/PI fields.
  // Its 1.1e-14 sentence follows the slope/CI, tau2, R2 and QE results, not intercept CIs.
  const useCaseKeys=['slope','slope_ci_lb','slope_ci_ub','tau2_pm','R2_tau2','QE','QE_p'];
  const pi=picker.window._almLastPI();
  const predictionExpected={pred:r.pred,se:r.pred_se,lo:r.pi_lb,hi:r.pi_ub};
  const predictionDifferences=Object.fromEntries(Object.entries(predictionExpected).map(([key,value])=>[key,Math.abs(pi[key]-value)/Math.max(1,Math.abs(value))]));
  for(const [key,diff] of Object.entries(predictionDifferences))assert.ok(Number.isFinite(diff)&&diff<=1e-9,'prediction '+key+' retains the paper tolerance');
  const cards=Object.fromEntries([...picker.elements.get('stats-wrap').innerHTML.matchAll(/<span class="k">([^<]*)<\/span><span class="v">([^<]*)<\/span>/g)].map(m=>[m[1],m[2]]));
  const printed={
   'k':'13',
   'β₁ (slope)':'-0.0286 [-0.0485, -0.0086]',
   'τ² (PM)':'0.1421',
   'R² (τ² explained)':'55.3%',
   'Q_E (residual)':'30.73 (df 11), p = 0.001',
   '95% PI at x̄=33.46':'[-1.614, 0.146]',
   'β₁ permutation p (MC 2000)':'0.019',
  };
  for(const [label,value] of Object.entries(printed))assert.equal(cards[label],value,'Figure 1 printed '+label);
  assert.equal(a.tau2_pm.toFixed(3),'0.142','Use case printed tau2');
  assert.match(cards['β₁ test'],/, p = 0\.009$/,'Use case printed slope p');
  assert.equal(r.pval[1].toFixed(3),'0.009','Native R displayed slope p');
  // A functioning manual-input path in the pre-fix snapshot is the control.
  before.setData(picker.elements.get('f-data').value);
  const numerics=page=>JSON.parse(JSON.stringify({model:page.window.__almResults(),prediction:page.window._almLastPI(),permutation:page.window._almLastPerm()}));
  assert.deepEqual(numerics(before),numerics(picker),'Identical four-column input retains identical pre-fix calculations');
  const comparison={
   scope:'Native R fixture versus repaired picker; historical primary archive is absent',
   useCaseKeys,useCaseNormalizedMax:Math.max(...useCaseKeys.map(key=>differences[key])),
   model12NormalizedMax:Math.max(...Object.values(differences)),
   predictionNormalizedDifferences:predictionDifferences,
   modelAndPredictionNormalizedMax:Math.max(...Object.values(differences),...Object.values(predictionDifferences)),
   printedCards:cards,originalManualInputNumericsIdentical:true,
  };
  writeFileSync(join(temp,'after-bcg-paper-comparison.json'),JSON.stringify(comparison,null,2)+'\n');
  console.log(JSON.stringify({BCG_paper_comparison:comparison}));
 }
 const manifest=JSON.parse(read('meta-regression/validate/MANIFEST-plus.json'));
 for(const entry of manifest.files){const data=readFileSync(new URL('meta-regression/'+entry.path,sourceRoot));assert.equal(data.length,entry.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256);}
 async function runValidation(name){
  const scriptUrl=new URL('meta-regression/validate/'+name,sourceRoot);
  let script=readFileSync(scriptUrl,'utf8').replaceAll('import.meta.url',JSON.stringify(scriptUrl.href));
  script=script.replace(/import \{([^}]+)\} from 'node:fs';/,(_,list)=>`import {${list.replace('writeFileSync','writeFileSync as nativeWrite')}} from 'node:fs';\nconst writeFileSync=(path,data)=>{globalThis.__p08Outputs.push({path:String(path),data});};`);
  script=script.replace(/await import\('([^']+)'\)/g,(_,path)=>`await import(${JSON.stringify(new URL(path,scriptUrl).href)})`);
  // Do not consult module-path environment variables in the original harness.
  script=script.replace("await import(pathToFileURL(process.env.LINKEDOM_MODULE).href)","await import('linkedom')");
  globalThis.__p08Outputs=[];
  const tempScript=join(temp,name);writeFileSync(tempScript,script);
  try{await import(pathToFileURL(tempScript).href+'?phase='+phase);for(const out of globalThis.__p08Outputs){const filename=basename(new URL(out.path).pathname);writeFileSync(join(temp,phase+'-'+filename),out.data);if(phase==='after'&&name==='check-numeric.mjs')assert.equal(out.data,readFileSync(join(temp,'before-'+filename),'utf8'),'All 52,573 checks and per-quantity maxima remain identical');}console.log(name+': completed; outputs redirected to TEMP');}
  catch(error){console.log(name+': UNAVAILABLE/FAILED: '+error.message);if(name!=='baseline-dom.mjs')throw error;}
  finally{delete globalThis.__p08Outputs;}
 }
 await runValidation('check-numeric.mjs');
 await runValidation('baseline-dom.mjs');
 console.log('Original 1,742-configuration archive: absent from supplied tree; full published 129,903-check replay is UNVERIFIED.');
 console.log('Evidence directory: '+temp);
}
