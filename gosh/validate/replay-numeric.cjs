// Offline numerical replay of BOTH unchanged pinned corpora, executing the page's own engine.
// DOM, geometry and text contracts require the existing browser specs; this count excludes them.
// node gosh/validate/replay-numeric.cjs [path/to/original/index.html]
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),html=fs.readFileSync(process.argv[2]||path.join(root,'index.html'),'utf8');
const nodes={};
for(const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g))nodes[m[1]]={value:m[0].match(/\bvalue="([^"]*)"/)?.[1]||'',textContent:'',innerHTML:'',style:{},addEventListener(){}};
nodes.src.value='0,1\n.2,1\n.4,1';nodes.model.value='FE';
const noop=()=>{},window={alm:{analysisLifecycle:run=>run,csvUpload:noop,plotExport:noop,axisControls:noop,resultsExport:noop,resetUndo:noop,tooltips:noop,urlState:Object.assign(noop,{read:()=>null,write:noop})}};
vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],{window,document:{getElementById:id=>nodes[id]}});
const source=fs.readFileSync(path.join(root,'plus.js'),'utf8');
const derive=vm.runInNewContext('(function(){'+source.slice(source.indexOf('  function number('),source.indexOf('  // Shared pure plot renderer'))+'; return derive;})()');
let failures=0;
function keyed(points) { const counts=new Map();return new Map(points.map(p=>{const m=[...p.members].sort((a,b)=>a-b).join(',');const n=counts.get(m)||0;counts.set(m,n+1);return [m+'#'+n,p];})); }
for(const tier of ['','-plus']) {
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'MANIFEST'+tier+'.json'),'utf8')),loaded=[];
 for(const f of manifest.files) { const b=fs.readFileSync(path.join(root,f.path));if(b.length!==f.bytes||crypto.createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('Pin mismatch '+f.path);loaded.push(JSON.parse(b)); }
 const [corpus,refs]=loaded,byKey=new Map(refs.map(r=>[r.key,r]));let checks=0,passed=0,max=0;const quantities={};
 function check(q,a,b,exact=false) {const d=exact?0:Math.abs(a-b)/(q.includes('I2')||q==='median_i2'?100:Math.max(1,Math.abs(b)));const ok=exact?a===b:Number.isFinite(a)&&Number.isFinite(b)&&d<=1e-9;checks++;if(ok)passed++;else {failures++;if(failures<10)console.error(tier,q,a,b);}max=Math.max(max,d);quantities[q]||={passed:0,checks:0};quantities[q].checks++;if(ok)quantities[q].passed++;}
 for(const c of corpus)for(const model of ['FE','DL']) {
  const ref=byKey.get(c.id+'::'+model),a=window.__almGoshValidationRun(c.te.map((x,i)=>`${x}, ${c.se[i]}, ${c.source_rows[i]}`).join('\n'),model,'5000',{});
  if(c.k>100) {check('refusal',a.summary,null,true);check('refusal_points',a.points.length,0,true);continue;}
  const actual=tier?derive(a):a,ap=keyed(actual.points),rp=keyed(ref.points);
  check('membership_coverage',JSON.stringify([...ap.keys()].sort()),JSON.stringify([...rp.keys()].sort()),true);
  check('point_count',ap.size,rp.size,true);
  for(const [key,p]of ap) {const r=rp.get(key)||{};for(const q of tier?['mu','I2','H2','Q',...(model==='DL'?['tau2','tau']:[])]:['k','mu','I2','Q',...(model==='DL'&&p.k>1?['tau2']:[]),...(c.k>15?['se']:[])])check(q,p[q],r[q],q==='k');}
  if(tier) {check('sampled',actual.sampled,ref.sampled,true);check('rows',actual.rows.length,ref.rows.length,true);actual.rows.forEach((r,i)=>Object.keys(ref.rows[i]).forEach(q=>check('per.'+q,r[q],ref.rows[i][q],q==='study'||q.endsWith('_n'))));}
  else {check('k',a.summary.k,c.k,true);check('model',a.summary.model,model,true);check('sampled',a.summary.sampled,c.k>15,true);for(const q of ['n_subsets','median_est','median_i2','min_est','max_est','q25_est','q75_est'])check(q,a.summary[q],ref.summary[q],q==='n_subsets');}
 }
 console.log(JSON.stringify({tier:tier||'base',configurations:corpus.length,models:refs.length,passed,checks,maxNormDiff:max,quantities}));
 console.log('NUMERICAL REPLAY',tier||'base',passed+'/'+checks,'(browser-only checks excluded)');
}
process.exitCode=failures?1:0;
