// Synthetic records; execute the page's real format-change handler and parsers.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../../../../'+p,import.meta.url),'utf8');

function harness(){
  const controls=new Map(),runs=[];
  function node(id){
    if(!controls.has(id)){
      const listeners=[];
      controls.set(id,{
        value:'',disabled:false,
        addEventListener(type,fn,capture=false){listeners.push({type,fn,capture:capture===true||capture.capture===true});},
        dispatchEvent(event){
          // DOM target capture listeners precede target bubble listeners, regardless of registration order.
          let stopped=false;
          const e={...event,stopImmediatePropagation(){stopped=true;}};
          for(const capture of [true,false])for(const l of listeners){
            if(stopped)return;
            if(l.type===e.type&&l.capture===capture)l.fn(e);
          }
        },
        click(){this.dispatchEvent({type:'click'});}
      });
    }
    return controls.get(id);
  }
  const context=vm.createContext({
    document:{getElementById:node,querySelector:node},console,TextDecoder,Uint8Array,ArrayBuffer,
    AlmFeatures:{registerModule(){},get(){return null;},register(){}}
  });context.window=context;
  const html=source('pubbias-tests/index.html');
  function pageFunction(name){
    const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);
    let at=html.indexOf('{',start),depth=1;
    while(depth&&++at<html.length){if(html[at]==='{')depth++;if(html[at]==='}')depth--;}
    return html.slice(start,at+1);
  }
  vm.runInContext(['parseLines','parseTESE','parseBinary'].map(pageFunction).join('\n'),context);
  context.run=()=>{
    const text=node('src').value,format=node('format').value;
    try{const rows=context[format==='binary'?'parseBinary':'parseTESE'](text);runs.push({text,format,rows});}
    catch(error){runs.push({text,format,error:error.message});}
  };
  node('btn-run').addEventListener('click',context.run);
  const start=html.indexOf("document.getElementById('format').addEventListener('change'");
  const end=html.indexOf('// ---- module init ----',start);assert.ok(start>=0&&end>start);
  vm.runInContext(html.slice(start,end),context);
  // Load the extension AFTER the original handler, exactly as the app page does.
  for(const p of ['shared/revman-reader.js','shared/alm-revman.js','pubbias-tests/alm-revman.js']){
    context.module={exports:{}};vm.runInContext(source(p),context);
  }
  const adapter=context.module.exports;
  // The feature panel's existing bubble listener must remain effective through the adapter's guard.
  node('format').addEventListener('change',()=>{node('alm-revman-effect').disabled=adapter.entry.schema!=='generic';});
  function change(format){node('format').value=format;node('format').dispatchEvent({type:'change'});}
  function review(binary){return context.AlmRevmanReader.parseText(source('hub/shared/tests/fixtures/revman/'+(binary?'pairwise-binary.csv':'pairwise.csv')));}
  async function apply(binary){return context.AlmRevman.applySelection({entry:adapter.entry},review(binary),{comparison:0,outcome:0,subgroup:0},binary?'pairwise-binary.csv':'pairwise.csv');}
  return {node,runs,context,adapter,change,apply};
}

test('native example controls remain functional before a successful import, including after a rejected import',async()=>{
  const h=harness();h.change('binary');
  assert.equal(h.runs.length,1);assert.ok(h.runs[0].rows.length>=5);
  const binary=h.node('src').value;assert.equal(h.node('alm-revman-effect').disabled,true);
  await assert.rejects(h.apply(false),/not compatible/);
  h.change('te-se');assert.notEqual(h.node('src').value,binary);
  assert.ok(h.runs.at(-1).rows.length>=5);assert.equal(h.node('alm-revman-effect').disabled,false);
});

for(const binary of [true,false])test('format changes preserve '+(binary?'binary':'generic')+' imported inputs and edits; PLANTED incompatible mode cannot substitute examples',async()=>{
  const h=harness(),format=binary?'binary':'te-se',other=binary?'te-se':'binary';
  h.change(format);await h.apply(binary);
  // Successful reimport must not attach duplicate guards or restore an older snapshot.
  await h.apply(binary);
  const imported=h.node('src').value,provenance=JSON.stringify(h.context.AlmFeaturesState);
  for(const text of [imported,imported.replace('Synthetic A','Edited synthetic A'),'']){
    h.node('src').value=text;const before=h.runs.length;
    h.change(other);
    assert.equal(h.node('src').value,text,'the current input survives immediately, before another import is attempted');
    assert.equal(h.runs.length,before+1,'only current data is run; no transient example analysis');
    assert.equal(h.runs.at(-1).text,text);
    if(text)assert.match(h.runs.at(-1).error,/Input not used/);
    assert.equal(h.node('alm-revman-effect').disabled,other==='binary');
    await assert.rejects(h.apply(binary),/not compatible/);
    assert.equal(h.node('src').value,text);assert.equal(JSON.stringify(h.context.AlmFeaturesState),provenance);
    h.change(format);assert.equal(h.node('src').value,text);
    assert.equal(h.runs.length,before+2);assert.equal(h.node('alm-revman-effect').disabled,format==='binary');
    if(text)assert.equal(h.runs.at(-1).rows.length,5);
  }
});
