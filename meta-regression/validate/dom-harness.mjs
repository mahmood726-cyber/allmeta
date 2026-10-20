import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
export async function loadDOM(){
 const {parseHTML}=await import(process.env.LINKEDOM_MODULE?pathToFileURL(process.env.LINKEDOM_MODULE).href:'linkedom');
 const {window}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8')),{document}=window;
 document.styleSheets=[];
 for(const n of document.querySelectorAll('input[type="checkbox"]'))n.checked=false;
 const context=vm.createContext({window,document,console,structuredClone,URL,Blob,setTimeout,clearTimeout,TextEncoder,TextDecoder});
 context.AlmValidate={mount(el){el.innerHTML='<h2></h2>';return {};}};
 for(const name of ['plus-engine.js','validate/contract.js','plus-ui.js','validate/plus-pins.js','validate/plus-adapter.js']){
  vm.runInContext(readFileSync(new URL('../'+name,import.meta.url),'utf8'),context,{filename:name});
  for(const key of ['AlmMetaPlus','AlmMetaPlusContract','AlmMetaPlusUI','AlmMetaPlusManifest','AlmMetaPlusDisplay','AlmMetaPlusValidationAdapter'])if(window[key])context[key]=window[key];
 }
 return {window,document,context};
}
