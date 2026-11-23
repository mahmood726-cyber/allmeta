/* Load alm-entry.js and alm-entry.css before mounting. No app wiring. */
(function(global){
  "use strict";
  let serial=0;
  function mount(el,{schema="generic",extras=[],apply}={}){
    const core=global.AlmEntry||(typeof module!=="undefined"&&module.exports?require("./alm-entry.js"):null);
    if(!core)throw new Error("Load AlmEntry before mounting the paste panel");
    if(typeof apply!=="function")throw new Error("An apply(records) callback is required");
    const doc=el.ownerDocument,prefix="alm-entry-"+(++serial)+"-";
    let table=null,detection=null,answers={},output=null,fileRevision=0;
    function node(tag,text,parent){
      const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;
    }
    const root=node("section",undefined,el);root.className="alm-entry";root.setAttribute("aria-label","Smart data entry");
    const label=node("label","Paste from a paper, Excel, RevMan, Covidence or a PDF table",root);
    const textarea=node("textarea",undefined,root);textarea.id=prefix+"paste";textarea.rows=7;label.htmlFor=textarea.id;
    const fileLabel=node("label","Or choose a CSV, TSV or text file",root);
    const file=node("input",undefined,root);file.type="file";file.accept=".csv,.tsv,.txt";file.id=prefix+"file";fileLabel.htmlFor=file.id;
    const parse=node("button","Preview and convert",root);parse.type="button";
    const status=node("p","Paste a table to begin.",root);status.setAttribute("role","status");status.setAttribute("aria-live","polite");
    const preview=node("div",undefined,root);preview.className="alm-entry-preview";
    const questionBox=node("div",undefined,root);
    const logTitle=node("h3","Conversion log",root),log=node("ul",undefined,root);
    log.setAttribute("aria-labelledby",logTitle.id=prefix+"log");
    const use=node("button","Use these rows",root);use.type="button";use.disabled=true;
    function refresh(){
      if(!table)return;
      output=core.convert(table,detection,schema,answers);
      // Preserve focus when rebuilding questions after a radio selection.
      const active=doc.activeElement,focusId=active&&active.id;
      questionBox.replaceChildren();
      output.questions.forEach(q=>{
        const group=node("fieldset",undefined,questionBox);node("legend",q.text,group);
        q.choices.forEach((choice,j)=>{
          const wrap=node("label",undefined,group),radio=node("input",undefined,wrap);
          radio.type="radio";radio.name=prefix+q.id;radio.id=prefix+q.id+"-"+j;radio.value=choice;radio.checked=answers[q.id]===choice;
          node("span",choice,wrap);
          radio.addEventListener("change",()=>{
            answers[q.id]=choice;
            if(q.id==="table:delimiter"&&choice==="columns"){
              table=core.parseTable(textarea.value,{delimiter:","});detection=core.detect(table,schema);
              Object.keys(answers).filter(k=>k.startsWith("column:")).forEach(k=>delete answers[k]);
              renderPreview();
            }else if(q.id.startsWith("column:")){
              const col=q.id.slice(7);detection.mapping[col]=choice;
              renderPreview();
            }
            refresh();
          });
        });
      });
      log.replaceChildren();
      output.steps.forEach(s=>node("li","✓ "+s.text,log));
      output.flags.forEach(f=>{const li=node("li",(f.blocking?"⛔ Block: ":"⚠ Warning: ")+(f.study?f.study+": ":"")+f.text,log);li.className=f.blocking?"alm-entry-block":"alm-entry-warning";});
      const blocked=output.flags.some(f=>f.blocking);
      use.disabled=blocked||!output.records.length;
      status.textContent=`${output.records.length} rows; ${output.flags.filter(f=>f.blocking).length} blocking issues; ${output.flags.filter(f=>!f.blocking).length} warnings.`;
      if(focusId){const target=doc.getElementById(focusId);if(target)target.focus();}
    }
    function renderPreview(){
      preview.replaceChildren();
      const grid=node("table",undefined,preview);node("caption","Detected table — choose the meaning of each column",grid);
      const head=node("thead",undefined,grid),hr=node("tr",undefined,head);
      const fields=core.SCHEMAS[typeof schema==="object"?schema.name||schema.schema:schema]||core.SCHEMAS.generic;
      const choices=[...new Set(["ignore",...fields,...extras,"est","lo","hi","p","se","sd","mean","n","min","q1","median","q3","max","pct","ci_bounds","summary","summary1","summary2","se1","se2","lo1","hi1","lo2","hi2"])];
      const width=Math.max((table.header||[]).length,...table.rows.map(r=>r.length),0);
      for(let i=0;i<width;i++){
        const th=node("th",undefined,hr);th.scope="col";
        const name=(table.header||[])[i]||"Column "+(i+1);
        const lab=node("label",name,th),select=node("select",undefined,th);
        select.id=prefix+"map-"+i;lab.htmlFor=select.id;
        choices.forEach(v=>{const option=node("option",v==="ignore"?"Ignore column":v,select);option.value=v;});
        select.value=detection.mapping[i]||"ignore";
        select.addEventListener("change",()=>{detection.mapping[i]=select.value;answers["column:"+i]=select.value;refresh();});
      }
      const body=node("tbody",undefined,grid);
      table.rows.forEach(row=>{const tr=node("tr",undefined,body);for(let i=0;i<width;i++)node("td",row[i]||"",tr);});
    }
    function parseText(){
      answers={};table=core.parseTable(textarea.value);detection=core.detect(table,schema);
      // Exact extra column names are supplied by the embedding app.
      (table.header||[]).forEach((h,i)=>{if(extras.includes(h)){detection.mapping[i]=h;detection.questions=detection.questions.filter(q=>q.id!=="column:"+i);}});
      renderPreview();refresh();
    }
    parse.addEventListener("click",parseText);
    textarea.addEventListener("input",()=>{fileRevision++;use.disabled=true;output=null;status.textContent="Text changed. Preview and convert to update the rows.";});
    file.addEventListener("change",async()=>{
      const chosen=file.files&&file.files[0];if(!chosen)return;
      const revision=++fileRevision;
      use.disabled=true;output=null;status.textContent="Reading file…";
      try{const text=await chosen.text();if(revision!==fileRevision)return;textarea.value=text;parseText();}
      catch(e){status.textContent="Could not read the file: "+e.message;use.disabled=true;}
    });
    use.addEventListener("click",async()=>{
      if(!output||use.disabled)return;
      const current=output;use.disabled=true;
      try{
        const response=await apply(current.records);
        if(response&&response.ok===false)throw new Error("The application did not accept these rows");
        global.AlmFeaturesState=global.AlmFeaturesState||{};
        global.AlmFeaturesState.entryLog=current.steps.concat(current.flags.map(f=>({text:f.text,flags:[f],method:"sanity check",citation:"Entry validation"})));
        status.textContent=`Applied ${current.records.length} rows.`;
      }catch(e){status.textContent="Could not apply rows: "+e.message;}
      finally{if(output===current)use.disabled=current.flags.some(f=>f.blocking)||!current.records.length;}
    });
    return {element:root,parse:parseText,getResult:()=>output,destroy(){fileRevision++;root.remove();}};
  }
  const api={mount};global.AlmEntryUI=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
