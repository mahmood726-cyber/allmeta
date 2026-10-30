// Execute the real page's inline analysis code for unit/integration checks.
// DOM and widget stubs are not a browser or a substitute for Playwright QA.
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../../../../',import.meta.url);
export function pageHarness() {
  const html=fs.readFileSync(new URL('proportion-ma/index.html',root),'utf8');
  const elements=new Map();
  const el=id=>{
    if(!elements.has(id)) {
      const classes=new Set(),listeners={};
      elements.set(id,{id,value:'',innerHTML:'',textContent:'',hidden:true,disabled:false,style:{},dataset:{},
        classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c),contains:c=>classes.has(c)},
        setAttribute(){},matches:s=>s.split(',').some(v=>v.trim()==='#'+id),
        addEventListener:(type,fn)=>{(listeners[type]??=[]).push(fn);},
        click:()=>{for(const fn of listeners.click??[])fn();},
      });
    }
    return elements.get(id);
  };
  el('src').value=html.match(/<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  el('trans').value='logit';el('tau-est').value='PM';
  const buttons=['json','csv','plot','btn-bus-save','btn-verify-in-r','btn-truthcert'].map(el);
  const document={getElementById:el,addEventListener(){},
    querySelectorAll:s=>s.includes('button')?buttons:s.split(',').map(s=>el(s.trim().slice(1)))};
  const widgets={};
  const alm=Object.fromEntries(['csvUpload','plotExport','resultsExport','axisControls','urlState','resetUndo','tooltips'].map(k=>[k,options=>{widgets[k]=options;}]));
  alm.urlState.read=()=>({});alm.urlState.write=()=>{};alm.resetUndo.snapshot=()=>{};
  const context=vm.createContext({document,alm,MaStudies:{},console});
  context.window=context;
  for(const path of ['shared/ma-core.js','hub/shared/analysis-lifecycle.js','proportion-ma/input-validation.js']) {
    const file=new URL(path,root);
    if(fs.existsSync(file)) vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:path});
  }
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('function parseTable'))[1];
  vm.runInContext(script,context,{filename:'proportion-ma/index.html'});
  return {context,el,buttons,widgets,run(text,transform='logit',method='PM') {
    el('src').value=text;el('trans').value=transform;el('tau-est').value=method;
    context.__almPropValidation.run();
    return JSON.parse(JSON.stringify(context.__almPropValidation.snapshot()));
  }};
}
