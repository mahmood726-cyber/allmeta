'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const B = require('../../shared/dta-bivariate.js');
const C = require('./moses-cases.cjs');
const outDir = path.resolve(process.argv[2] || 'integration-evidence/dta-moses');
fs.mkdirSync(outDir,{recursive:true});
const jobs = [];
for (const name of ['ordinary','zeroCell','fprConstant','seConstant','sConstant','identical']) {
  for (const cc of ['all','single','none']) {
    if (name === 'zeroCell' && cc === 'none') continue;
    jobs.push({name:`${name}-${cc}`,rows:C[name],cc});
  }
}
const input = path.join(outDir,'input.csv'), reference = path.join(outDir,'reference.tsv');
fs.writeFileSync(input,'case,cc,TP,FP,FN,TN\n'+jobs.flatMap(j=>j.rows.map(r=>[j.name,j.cc,r.tp,r.fp,r.fn,r.tn].join(','))).join('\n')+'\n');
const run = cp.spawnSync(process.env.RSCRIPT || 'Rscript',['--vanilla',path.join(__dirname,'fixtures/moses-reference.R'),input,reference,path.join(outDir,'sessionInfo.txt')],{encoding:'utf8',timeout:120000});
fs.writeFileSync(path.join(outDir,'R.log'),run.stdout+run.stderr);
assert.equal(run.status,0,run.stderr || String(run.error));
const records = fs.readFileSync(reference,'utf8').trim().split(/\r?\n/).slice(1).map(line=>line.split('\t'));
const report = {mada:'0.5.12',input_sha256:crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'),matched:[],intentional_refusals:[]};
for (let i=0;i<jobs.length;i++) {
  const job=jobs[i], values=records[i]; assert.equal(values[0],job.name);
  const r=Object.fromEntries(['A1','B1','A2','B2','rho'].map((k,j)=>[k,values[j+2]==='NA'?null:Number(values[j+2])]));
  const opts={correctionControl:job.cc};
  const rho=B.thresholdSpearman(job.rows,opts);
  if(r.rho===null) assert.equal(rho,null);
  else assert.ok(Math.abs(rho-r.rho)<=1e-6);
  if (/^(fprConstant|sConstant|identical)-/.test(job.name)) {
    assert.throws(()=>B.mosesLittenberg(job.rows,opts),/not estimable/);
    report.intentional_refusals.push({case:job.name,mada:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Number.isFinite(v)?v:null]))});
  } else {
    const fit=B.mosesLittenberg(job.rows,opts);
    for (const k of ['A1','B1','A2','B2']) assert.ok(Number.isFinite(r[k]) && Math.abs(fit[k]-r[k])<=1e-6,`${job.name} ${k}: ${fit[k]} != ${r[k]}`);
    report.matched.push({case:job.name,mada:r,js:fit});
  }
}
fs.writeFileSync(path.join(outDir,'comparison.json'),JSON.stringify(report,null,2)+'\n');
console.log(`${report.matched.length} matched configurations at absolute tolerance 1e-6; ${report.intentional_refusals.length} intentional singular refusals; ${jobs.length} Spearman comparisons passed`);
