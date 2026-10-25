/* RevMan extension: explicit selection, existing entry.apply, current-input exports.
 * No statistical code and no network requests. Plain Node/browser IIFE.
 */
(function(global){
  'use strict';
  const reader=()=>global.RevmanReader||(typeof require==='function'?require('./revman-reader.js'):null);
  function check(spec,review,choice,filename){
    if(!spec||!spec.entry||typeof spec.entry.apply!=='function')throw new Error('App entry adapter is unavailable.');
    const rows=reader().select(review,choice,spec.entry.schema,{filename});
    if(spec.entry.maxRows&&rows.length>spec.entry.maxRows)throw new Error('This app accepts one study at a time. Select a subgroup with one study or use a single-study file.');
    if(spec.entry.validate)spec.entry.validate(rows);
    return rows;
  }
  async function applySelection(spec,review,choice,filename){
    const rows=check(spec,review,choice,filename);
    const result=await spec.entry.apply(rows);
    if(!result||result.ok!==true||result.n!==rows.length)throw new Error(result&&result.error||'Import did not apply the complete set of study rows.');
    const st=global.AlmFeaturesState||(global.AlmFeaturesState={});
    const chosen=reader().selected(review,choice);
    st.provenance=rows.map(r=>r.provenance);
    st.entryLog=[{text:'Imported '+rows.length+' rows from '+rows[0].provenance.location+', subgroup '+chosen.subgroup.name+'. No numerical conversion.',method:'RevMan import',citation:'Source file: '+filename}];
    st.verify={revision:null,passed:false,rows:[],versions:{}};
    delete st.provenanceSummary;delete st.entryMethods;
    st.revman={records:JSON.parse(JSON.stringify(rows)),meta:{comparison:chosen.comparison.name,outcome:chosen.outcome.name,subgroup:chosen.subgroup.name,effectMeasure:chosen.outcome.effectMeasure,arm1:chosen.outcome.arm1Name,arm2:chosen.outcome.arm2Name}};
    return result;
  }
  function current(spec){
    const rows=spec.revman.read(),previous=global.AlmFeaturesState&&global.AlmFeaturesState.revman;
    // Reattach source metadata only when the native label identifies exactly one imported study.
    rows.forEach(r=>{
      const hits=previous?previous.records.filter(p=>p.study===r.study):[];
      if(hits.length===1){r.studyId=hits[0].studyId;if(r.year===undefined)r.year=hits[0].year;r.effectMeasure=r.effectMeasure||hits[0].effectMeasure;}
    });
    return reader().validateRecords(rows,spec.entry.schema);
  }
  function download(name,text){
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function mount(panel,ctx){
    const doc=panel.ownerDocument,spec=ctx.spec;
    const el=(tag,text,parent=panel,attrs={})=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));parent.appendChild(n);return n;};
    el('p','Import local RevMan 5 XML or a CSV/tab study table. Choose comparison, outcome and subgroup explicitly. File import records the source; it does not confirm extraction against a paper.');
    const fileLabel=el('label','RevMan file '),file=el('input',null,fileLabel,{type:'file',accept:'.rm5,.xml,.csv,.tsv,.txt',id:'alm-revman-file'});
    const select=(label,id)=>{const l=el('label',label+' ');return el('select',null,l,{id,'aria-label':label});};
    const comp=select('Comparison','alm-revman-comparison'),out=select('Outcome','alm-revman-outcome'),sub=select('Subgroup','alm-revman-subgroup');
    const status=el('p','Choose a RevMan file.',panel,{id:'alm-revman-status',role:'status','aria-live':'polite'});
    const preview=el('div',null,panel,{'aria-label':'Selected study preview'});
    const use=el('button','Import selected rows',panel,{type:'button'});use.disabled=true;
    el('p',reader().note,panel,{id:'alm-revman-note'});
    el('p',spec.revman.note||'The study table contains source inputs only. Use the matching columns when transferring to a RevMan custom analysis.');
    const exp=el('button','Export study table CSV',panel,{type:'button'});
    el('h3','RevMan Web study data');
    el('p','For RevMan Web CSV upload, download all three files below. Enable study-centric data and configure the matching outcome and intervention names in RevMan. Set subgroups there separately.');
    const field=(label,id)=>{const l=el('label',label+' ');return el('input',null,l,{id,type:'text'});};
    const exportOutcome=field('Export outcome name','alm-revman-export-outcome');
    const arm1=field('Experimental arm / intervention','alm-revman-arm1'),arm2=field('Control arm / intervention','alm-revman-arm2');
    const effect=select('Export effect measure','alm-revman-effect');
    el('option','Choose effect measure',effect,{value:''});
    ['OR','RR','HR','MD','SMD','RD'].forEach(m=>el('option',m,effect,{value:m}));effect.value='';
    if(spec.entry.schema!=='generic'){effect.disabled=true;el('p','Arm-level results are exported as entered; choose the pooling effect measure in RevMan.');}
    if(spec.revman.schemaControl){
      const control=doc.getElementById(spec.revman.schemaControl);
      if(control)control.addEventListener('change',()=>{effect.disabled=spec.entry.schema!=='generic';});
    }
    ['information','arms','results'].forEach(part=>{
      const button=el('button','Export study '+part+' CSV',panel,{type:'button'});
      button.addEventListener('click',()=>{
        try{
          const rows=current(spec),pack=reader().exportPackage(rows,spec.entry.schema,{outcome:exportOutcome.value,arm1:arm1.value,arm2:arm2.value,effectMeasure:effect.value});
          download(ctx.app+'-revman-study-'+part+'.csv',pack[part]);status.textContent='Exported study '+part+'. '+pack.note;
        }catch(e){status.textContent='Export refused: '+e.message;}
      });
    });
    let review=null,filename='',revision=0,busy=false;
    function options(node,items){node.replaceChildren();el('option','Choose…',node,{value:''});items.forEach((x,i)=>el('option',x.name,node,{value:String(i)}));node.value='';node.disabled=!items.length;}
    function choice(){return {comparison:comp.value===''?null:Number(comp.value),outcome:out.value===''?null:Number(out.value),subgroup:sub.value===''?null:Number(sub.value)};}
    function reset(){review=null;options(comp,[]);options(out,[]);options(sub,[]);preview.replaceChildren();use.disabled=true;}
    function update(){
      preview.replaceChildren();use.disabled=true;if(busy)return;
      try{
        const rows=check(spec,review,choice(),filename),o=reader().selected(review,choice()).outcome;
        status.textContent=rows.length+' study rows selected; '+o.type+'; effect measure '+o.effectMeasure+'.'+(o.type==='generic'?' Estimates and SE will be used as entered on the analysis scale.':'');
        const table=el('table',null,preview),head=el('tr',null,el('thead',null,table));
        const cols=['study','studyId','year'].concat(reader().fields[spec.entry.schema]);cols.forEach(k=>el('th',k,head,{scope:'col'}));
        const body=el('tbody',null,table);rows.forEach(r=>{const tr=el('tr',null,body);cols.forEach(k=>el('td',r[k]==null?'':String(r[k]),tr));});use.disabled=false;
      }catch(e){status.textContent=e.message;}
    }
    reset();
    file.addEventListener('change',async()=>{
      const token=++revision;reset();const f=file.files&&file.files[0];if(!f){status.textContent='Choose a RevMan file.';return;}
      filename=f.name;status.textContent='Reading '+filename+'…';
      try{if(f.size>20*1024*1024)throw new Error('RevMan file exceeds 20 MB limit.');const parsed=await reader().parse(await f.arrayBuffer());if(token!==revision)return;review=parsed;options(comp,review.comparisons);status.textContent='Choose comparison, outcome and subgroup.';}
      catch(e){if(token===revision){reset();status.textContent=e.message;}}
    });
    comp.addEventListener('change',()=>{options(out,review&&comp.value!==''?review.comparisons[Number(comp.value)].outcomes:[]);options(sub,[]);update();});
    out.addEventListener('change',()=>{options(sub,review&&comp.value!==''&&out.value!==''?review.comparisons[Number(comp.value)].outcomes[Number(out.value)].subgroups:[]);update();});
    sub.addEventListener('change',update);
    use.addEventListener('click',async()=>{
      if(busy)return;busy=true;use.disabled=true;file.disabled=true;comp.disabled=true;out.disabled=true;sub.disabled=true;
      try{
        const result=await applySelection(spec,review,choice(),filename),meta=global.AlmFeaturesState.revman.meta;
        exportOutcome.value=meta.outcome;arm1.value=meta.arm1;arm2.value=meta.arm2;
        effect.value=['OR','RR','HR','MD','SMD','RD'].includes(meta.effectMeasure)?meta.effectMeasure:'';
        status.textContent='Imported '+result.n+' study rows into the app. Source provenance recorded.';
      }
      catch(e){status.textContent='Import refused: '+e.message;}
      finally{busy=false;file.disabled=false;comp.disabled=false;out.disabled=false;sub.disabled=false;use.disabled=false;}
    });
    exp.addEventListener('click',()=>{
      try{
        const rows=current(spec),saved=global.AlmFeaturesState&&global.AlmFeaturesState.revman;
        const exported=reader().exportCSV(rows,spec.entry.schema,saved?saved.meta:{});
        download(ctx.app+'-revman-study-table.csv',exported.csv);status.textContent='Exported '+rows.length+' current study rows. '+exported.note;
      }catch(e){status.textContent='Export refused: '+e.message;}
    });
  }
  function install(app,config){
    const F=global.AlmFeatures;if(!F)throw new Error('AlmFeatures host is required.');
    F.registerModule('revman',{extension:{label:'RevMan',after:'entry'},render:mount});
    const existing=F.get(app);
    F.register(app,{...(!existing||!existing.entry?{entry:config.entry}:{}),revman:config});
    if(typeof document!=='undefined'){
      if(!document.getElementById('alm-features')){const n=document.createElement('div');n.id='alm-features';n.setAttribute('data-app',app);(document.querySelector('main')||document.body).appendChild(n);}
      if(!document.querySelector('link[href$="alm-features.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='../shared/alm-features.css';document.head.appendChild(link);}
    }
  }
  function label(value){
    if(typeof value!=='string'||!value.trim()||/[\r\n\t]/.test(value))throw new Error('Study name cannot be represented in this app input (blank, tab or newline).');
    return value;
  }
  function nativeNumber(value){
    const text=String(value==null?'':value).trim();
    if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)||!Number.isFinite(Number(text)))throw new Error('Invalid number in native input: '+text);
    return Number(text);
  }
  // These apps share only the native effect,SE,label input grammar, not an engine.
  function genericAdapter(config){
    function validate(rows){
      reader().validateRecords(rows,'generic');
      if(rows.length<3)throw new Error('This app requires at least 3 study rows.');
      rows.forEach(r=>{label(r.study);if(r.study!==r.study.trim()||r.study.includes(','))throw new Error('Study name cannot be preserved by the native input.');});
    }
    const entry={schema:'generic',validate,apply(rows){
      validate(rows);
      document.getElementById('src').value=rows.map(r=>[r.yi,r.sei,r.study].join(',')).join('\n');
      document.getElementById('btn-run').click();return {ok:true,n:rows.length};
    }};
    function read(){
      const lines=document.getElementById('src').value.split(/\r?\n/),rows=[];
      const leading=(lines.join('\n').match(/^\s*/)||[''])[0].split('\n').length-1;
      let first=true;
      lines.forEach((line,i)=>{
        if(!line.trim())return;
        const p=line.split(',').map(s=>s.trim());
        const header=config.header&&first&&/^(effect|yi|te)$/i.test(p[0])&&/^se$/i.test(p[1])&&(p.length===2||(p.length===3&&/^label$/i.test(p[2])));
        first=false;if(header)return;
        if(p.length<2||(!config.joinLabel&&p.length>3))throw new Error('Invalid native input columns.');
        const study=p.slice(2).join(', ')||config.defaultLabel+(i+1-(config.leading?leading:0));
        rows.push({study,yi:nativeNumber(p[0]),sei:nativeNumber(p[1])});
      });
      return reader().validateRecords(rows,'generic');
    }
    return {entry,read};
  }
  const api={applySelection,check,current,install,label,nativeNumber,genericAdapter};
  global.AlmRevman=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
