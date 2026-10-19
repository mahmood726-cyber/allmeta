import {readFileSync,writeFileSync} from 'node:fs';
await import('../plus-engine.js');await import('./contract.js');
const corpus=JSON.parse(readFileSync(new URL('./plus/corpus.json',import.meta.url))),refs=JSON.parse(readFileSync(new URL('./plus/reference.json',import.meta.url)));
let checks=0,passed=0;const failed=[],maxima={};
for(let i=0;i<corpus.length;i++){
 const actual=AlmMetaPlus.compute(corpus[i]);
 for(const row of AlmMetaPlusContract.audit(actual,refs[i].result)){
  checks++;if(row.pass)passed++;else failed.push({id:corpus[i].id,...row});
  if(row.kind!=='exact')maxima[row.key]=Math.max(maxima[row.key]||0,row.diff);
 }
}
const result={configurations:corpus.length,checks,passed,failed,maxima};
writeFileSync(new URL('./plus/numeric-evidence.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({configurations:corpus.length,checks,passed,failed:failed.length,firstFailures:failed.slice(0,12)},null,2));
if(failed.length)process.exitCode=1;
