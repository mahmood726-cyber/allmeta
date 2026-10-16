const fs=require('fs'),vm=require('vm');
const matrix=require('./numeric-matrix.cjs');
const html=fs.readFileSync(process.argv[2],'utf8'),nodes={};
for(const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g))nodes[m[1]]={value:m[0].match(/\bvalue="([^"]*)"/)?.[1]||'',textContent:'',innerHTML:'',style:{},addEventListener(e,f){const key=e==='click'?'clickHandler':e,previous=this[key];this[key]=(...args)=>{previous?.(...args);f(...args);};},click(){this.clickHandler?.();}};
nodes.src.value='0,1\n2,1\n4,1';nodes.model.value='FE';
const noop=()=>{};let axis;
const window={alm:{csvUpload:noop,plotExport:noop,axisControls:o=>axis=o.onChange,resultsExport:noop,resetUndo:noop,tooltips:noop,urlState:Object.assign(noop,{read:()=>null,write:noop})}};
let code=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const hook=`
const originalAll=allSubsets,originalSample=sampledSubsets;
allSubsets=function(...a){return window.__empty?[]:originalAll(...a);};
sampledSubsets=function(...a){return window.__empty?[]:originalSample(...a);};
`;
code=code.replace("    // ---- module init ----",hook+"    // ---- module init ----");
const document={readyState:'complete',getElementById:id=>nodes[id],querySelector:s=>nodes[s.slice(1)]};
window.document=document;
const storage=new Map();window.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const context=vm.createContext({window,document,console});
for(const name of ['ma-studies-v1.js','truthcert-ui.js'])vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../../shared',name),'utf8'),context);
context.MaStudies=window.MaStudies;context.TruthCertUI=window.TruthCertUI;
require('./export-boundaries.cjs')(window);
vm.runInContext(code,context);
for(const m of [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].slice(1))vm.runInContext(m[1],context);
const result=matrix({select:name=>!process.argv.includes('--quick')||name==='enumerated',axis:s=>axis(s),model:s=>nodes.model.value=s,draws:s=>nodes['n-sample'].value=s,empty:s=>window.__empty=s,
 load:values=>window.__almGoshLoad(values),
 read:()=>({exports:window.__readExports(),declarations:matrix.declarations(html),count:nodes['m-n'].textContent,median:nodes['m-est'].textContent,i2:nodes['m-i2'].textContent,
 plot_error:nodes['plot-error'].textContent,note:nodes['plot-note'].textContent,error:nodes['sample-error'].textContent,draws:nodes['n-sample'].value,
 src:nodes.src.value,svg:nodes.plot.innerHTML,result:window._almLastGosh()})});
console.log(JSON.stringify(result));
