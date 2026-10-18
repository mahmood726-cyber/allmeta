const fs=require('node:fs'),H=require('../hybrid-core.js');
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),out=process.argv[3];
const started=performance.now(),data=H.prepare(input.records),labels=Object.create(null),order=input.priors.slice();
for(const i of order)labels[input.records[i].id]=input.gold[i];
let found=order.reduce((s,i)=>s+input.gold[i],0),total=input.gold.reduce((a,b)=>a+b,0),batches=[];
while(order.length<input.records.length&&found<total){const m=H.fit(data,labels),chosen=input.records.map((r,i)=>i).filter(i=>labels[input.records[i].id]===undefined).sort((a,b)=>m.scores[input.records[b].id]-m.scores[input.records[a].id]||a-b).slice(0,input.batch);
 for(const i of chosen){order.push(i);labels[input.records[i].id]=input.gold[i];found+=input.gold[i];}batches.push({screened:order.length,found});}
const seen=new Set(order);for(let i=0;i<input.records.length;i++)if(!seen.has(i))order.push(i);
fs.writeFileSync(out,JSON.stringify({engine:H.VERSION,config:H.DEFAULTS,order,batches,seconds:(performance.now()-started)/1000}));
