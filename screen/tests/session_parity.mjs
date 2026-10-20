// Measurement only: node screen/tests/session_parity.mjs data.csv --priors priors.json [--emb review.f32]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {args,records,floats} from './parity-input.mjs';
try{
 const a=args(),rows=records(a.csv),raw=JSON.parse(fs.readFileSync(a.priors,'utf8'));
 const prior=Array.isArray(raw)?raw:raw.prior||raw.priors;
 if(!Array.isArray(prior)||new Set(prior).size!==prior.length||prior.some(i=>!Number.isInteger(i)||i<0||i>=rows.length))throw Error('Priors JSON must be an array of unique zero-based row indices (or {prior:[...]})');
 const gold=rows.map(r=>{const value=String(r.label??r.included??r.relevant??'').trim();if(!['0','1'].includes(value))throw Error('CSV needs binary label, included, or relevant column');return Number(value);});
 if(prior.filter(i=>gold[i]===1).length<2||prior.filter(i=>gold[i]===0).length<2)throw Error('Need 2+2 priors');
 const root=fileURLToPath(new URL('../',import.meta.url));let reply;
 const ctx=vm.createContext({performance,postMessage:m=>{reply=m;}});ctx.self=ctx;
 ctx.importScripts=f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
 vm.runInContext(fs.readFileSync(path.join(root,'rank-worker.js'),'utf8'),ctx);
 const R=ctx.ScreenRank;
 let X=R.tfidf(rows.map(r=>r.title+' '+r.abstract),R.ELAS_U4),embedding;
 if(a.emb){const values=floats(a.emb,rows.length);if(fs.statSync(a.emb).size!==rows.length*768*4)throw Error('Embedding row count mismatch');
 embedding={model:'specter2',dim:768,values,packSha:'2b1dc054c82e7ad6cf20456b11bee978416468c1af399383dbbd66b307d5748a',pooling:'cls',maxTokens:256,prefix:''};X=R.appendDense(X,values,768,0.5);}
 const warm=Array.from(R.simulate(X,gold,prior,{...R.ELAS_U4,retrainEvery:1,seed:1}));
 const cold=prior.slice(),labels=Object.fromEntries(prior.map(i=>[rows[i].id,gold[i]])),total=gold.reduce((s,y)=>s+y,0);
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Record IDs must be unique');
 while(cold.reduce((s,i)=>s+gold[i],0)<total){
  ctx.onmessage({data:{id:cold.length,records:rows,labels,embedding}});
  if(reply.error)throw Error(reply.error);
  const next=reply.result.ranked[0].index;cold.push(next);labels[rows[next].id]=gold[next];
 }
 const firstDivergenceIndex=Array.from({length:Math.max(cold.length,warm.length)},(_,i)=>i).find(i=>cold[i]!==warm[i])??-1;
 function wss(order){let found=0;for(let i=0;i<order.length;i++){found+=gold[order[i]];if(found>=Math.ceil(.95*total))return .95-(i+1)/rows.length;}return null;}
 console.log(JSON.stringify({firstDivergenceIndex,coldWSS95:wss(cold),warmWSS95:wss(warm),coldOrder:cold,warmOrder:warm},null,2));
}catch(error){console.error('Session measurement unavailable: '+error.message);}
process.exitCode=0;
