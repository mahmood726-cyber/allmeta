import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();await page.goto('http://localhost:8088/meta-regression/');
 await page.waitForFunction(()=>typeof window._almLastFitted==='function'&&window._almLastFitted());
 const result=[];
 for(const rows of [null,Array.from({length:8},(_,i)=>({study:'row '+i,yi:Math.sin(i)*.4,vi:.01+i*.005,year:2000+i}))]) {
  if(rows)await page.evaluate(r=>__almLoad(r),rows);
  result.push(await page.evaluate(()=>({fit:_almLastFitted(),studies:_almLastStudies(),hk:_almLastHK(),r2:_almLastR2(),qe:_almLastQE(),pi:_almLastPI(),exports:__almResults(),table:document.querySelector('#stats-wrap').textContent,svg:document.querySelector('#svg-host').innerHTML})));
 }
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(x=>x[1].trim()).map(x=>createHash('sha256').update(x[1].replaceAll('\r\n','\n')).digest('hex'));
 const output={scripts,result};
 const filename=new URL('./plus/'+(process.argv[2]||'baseline')+'.json',import.meta.url);
 writeFileSync(filename,JSON.stringify(output,null,2)+'\n');
 if(process.argv[2]==='after') {
  const before=JSON.parse(readFileSync(new URL('./plus/baseline.json',import.meta.url)));
  if(JSON.stringify(before)!==JSON.stringify(output))throw Error('Original outputs or inline computation changed');
  console.log('2/2 original scenarios identical; all inline-script hashes identical. Original MANIFEST replay unavailable at base.');
 }else console.log('Captured 2 original scenarios and inline-script hashes before editing index.html.');
}finally{await browser.close();}
