// Captures real offline Validate results; never substitutes expected numbers.
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, extname, sep, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
const PORT=Number((process.argv.find(a=>a.startsWith('--port='))||'--port=8000').slice(7));const ORIGIN='http://127.0.0.1:'+PORT;

export const contracts = [
  ['screen',29,29], ['dose-response-ma',724,724], ['dta-sroc',855,855], ['nma',410,410],
  ['heterogeneity',131781,131781], ['pubbias-tests',2113,2107], ['multilevel-ma',528,528],
  ['proportion-ma',298116,298116], ['mh-peto',68461,68461], ['influence',164802,164802],
  ['limit-ma',55525,55524], ['gosh',876760,876760], ['cumulative-subgroup',609398,609398]
];
export function canonical(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function summarize(result) {
  if (!Number.isInteger(result.checks) || !Number.isInteger(result.passed) || !Array.isArray(result.failed) || result.passed + result.failed.length !== result.checks || !result.maxima) throw Error('Invalid replay accounting');
  const ids = result.failed.map(f=>{if(typeof f.id!=='string')throw Error('Missing failure id');return f.id;}).sort();
  return canonical({checks:result.checks, passed:result.passed,
    failedIdsSha256:createHash('sha256').update(JSON.stringify(ids),'utf8').digest('hex'),
    failures:result.failed.map(f=>({id:f.id,quantity:f.quantity??null,method:f.method??null})).sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0),
    maxima:result.maxima, ...(result.displayed===undefined?{}:{displayed:result.displayed,displayFailures:result.displayFails.length})});
}
async function main() {
  const {values} = parseArgs({options:{root:{type:'string'},out:{type:'string'},compare:{type:'string'},channel:{type:'string'},port:{type:'string'}}});
  const root=resolve(values.root||fileURLToPath(new URL('../',import.meta.url)));
  const sourceCommit=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const require=createRequire(new URL('../hub/shared/tests/package.json',import.meta.url));
  const {chromium}=require('@playwright/test');
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'};
  const server=createServer(async(req,res)=>{
    try {
      let path=resolve(root,'.'+decodeURIComponent(new URL(req.url,ORIGIN).pathname));
      if(!path.startsWith(root+sep))throw Error('Path refused');
      if((await stat(path)).isDirectory())path=resolve(path,'index.html');
      res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));
    } catch { res.writeHead(404);res.end(); }
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(PORT,'127.0.0.1',ok);});
  let browser;
  try {
    browser=await chromium.launch({headless:true,channel:values.channel||undefined});
    const apps={};
    for(const [app,checks,passed] of contracts) {
      const context=await browser.newContext({locale:'en-US',timezoneId:'UTC',serviceWorkers:'block'});
      try {
        const outside=[];
        await context.route('**/*',route=>{
          const u=new URL(route.request().url());
          if(u.origin!==ORIGIN){outside.push(u.href);return route.abort();}
          return route.continue();
        });
        const page=await context.newPage();page.setDefaultTimeout(600000);
        // Capture the public mount return, including apps which do not name it.
        await page.addInitScript(()=>{
          let value;
          Object.defineProperty(window,'AlmValidate',{configurable:true,get:()=>value,set:v=>{
            value=v;const mount=v.mount;v.mount=(...args)=>{const widget=mount(...args);window.__replayWidget=widget;return widget;};
          }});
        });
        await page.goto(ORIGIN+'/'+app+'/index.html');
        await page.waitForFunction(()=>!!window.__replayWidget);
        await page.evaluate(async()=>{if(window.ScreenValidationAdapter)await ScreenValidationAdapter.ready;await __replayWidget.prepare();});
        await context.setOffline(true);
        const result=await page.evaluate(async()=>{
          let timer;
          let result;
          try {
            result=await Promise.race([__replayWidget.runCorpus(),new Promise((_,reject)=>{
              timer=setTimeout(()=>reject(Error('Replay exceeded 30 minutes')),1800000);
            })]);
          } finally {clearTimeout(timer);}
          // Preserve Infinity/NaN rather than silently serializing them as null.
          return JSON.parse(JSON.stringify(result,(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):v));
        });
        if(outside.length)throw Error(app+': external requests refused: '+outside.join(', '));
        if(result.checks!==checks||result.passed!==passed)throw Error(app+': replay count drift');
        if(app==='heterogeneity'&&(result.displayed!==121424||result.displayFails.length))throw Error('Display audit drift');
        if(app==='pubbias-tests'){
          const manifest=JSON.parse(await readFile(resolve(root,app,'validate/MANIFEST.json'),'utf8'));
          const expected=manifest.knownExceptions.map(e=>[e.dataset_configuration,e.method,e.quantity].join(' | ')).sort();
          const actual=result.failed.map(f=>f.label.replace(' [documented]','')).sort();
          if(result.failed.some(f=>!f.knownException)||result.unexpected!==0||JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Unexpected publication-bias failure');
        }
        if(app==='limit-ma'&&(result.failed[0].id!=='dat.hartmannboyce2018::001'||result.failed[0].quantity!=='status'))throw Error('Unexpected limit failure');
        apps[app]=summarize(result);console.log(app+': '+result.passed+'/'+result.checks);
      } finally {await context.close();}
    }
    const output=canonical({schemaVersion:1,sourceCommit,apps});
    if(values.compare){
      const baseline=JSON.parse(await readFile(values.compare,'utf8'));
      if(baseline.schemaVersion!==1||JSON.stringify(canonical(baseline.apps))!==JSON.stringify(canonical(apps)))throw Error('Replay invariance failed');
    }
    const destination=resolve(values.out||'audit/replay-baseline.json');await mkdir(dirname(destination),{recursive:true});
    await writeFile(destination,JSON.stringify(output,null,2)+'\n','utf8');
  } finally {if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1;});
