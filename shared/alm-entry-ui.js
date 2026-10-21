/* Load alm-entry.js and alm-entry.css before mounting. No app wiring. */
(function(global){
  "use strict";
  let serial=0;
  const schemaName=schema=>typeof schema==="object"?schema.name||schema.schema:schema;
  // The paper-text path is offered only when extraction can fill this schema's inputs; otherwise the table path.
  const paperSupported=(core,schema)=>core.PROVENANCE_SCHEMAS.includes(schemaName(schema));
  function mount(el,{schema="generic",extras=[],apply,usedAs,provenance=false}={}){
    const core=global.AlmEntry||(typeof module!=="undefined"&&module.exports?require("./alm-entry.js"):null);
    if(!core)throw new Error("Load AlmEntry before mounting the paste panel");
    if((provenance||usedAs!==undefined)&&paperSupported(core,schema))return mountProvenance(el,{schema,extras,apply,usedAs});
    if(typeof apply!=="function")throw new Error("An apply(records) callback is required");
    const doc=el.ownerDocument,prefix="alm-entry-"+(++serial)+"-";
    let table=null,detection=null,answers={},output=null,fileRevision=0;
    function node(tag,text,parent){
      const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;
    }
    const root=node("section",undefined,el);root.className="alm-entry";root.setAttribute("aria-label","Smart data entry");
    const label=node("label","Paste from a paper, Excel, RevMan, Covidence or a PDF table",root);
    const textarea=node("textarea",undefined,root);textarea.id=prefix+"paste";textarea.rows=7;label.htmlFor=textarea.id;
    const parse=node("button","Preview and convert",root);parse.type="button";parse.className="alm-entry-primary";
    node("p","Percentages and p-values are never used as counts.",root).className="alm-entry-note";
    const decimalGroup=node("div",undefined,root),decimal={value:"point",explicit:false},decimalRadios=[];
    decimalGroup.setAttribute("role","group");decimalGroup.setAttribute("aria-label","Decimal mark");
    node("span","Decimal mark in this paste (1.5 = point, 1,5 = comma; ask = you decide each one):",decimalGroup);
    for(const value of ["point","comma","ask"]){
      const lab=node("label",value,decimalGroup),radio=node("input",undefined,lab);
      radio.type="radio";radio.name=prefix+"decimal";radio.value=value;radio.checked=value==="point";decimalRadios.push(radio);
      radio.addEventListener("change",()=>{decimal.value=value;decimal.explicit=true;answers.decimal=value;showDecimals();if(table)refresh();});
    }
    // How each comma-between-digits number will be read under the current setting.
    const decimalList=node("ul",undefined,root);decimalList.className="alm-entry-decimals";decimalList.setAttribute("aria-label","How numbers with a comma are read");
    function showDecimals(){decimalList.replaceChildren();core.decimalPreview(textarea.value,decimal.value).forEach(p=>node("li",p.message,decimalList));}
    // Five-number method selector, shown once a median/IQR/range conversion occurs; the choice is logged.
    const methodBox=node("div",undefined,root);let fivenumMethod=null;
    const methodAnswer=()=>!fivenumMethod||fivenumMethod.value==="luo/wan/shi"?undefined:fivenumMethod.value;
    function showMethodChoice(){
      if(fivenumMethod)return;
      const methodLabel=node("label","Mean/SD from median, IQR or range (conv.fivenum method)",methodBox);
      fivenumMethod=node("select",undefined,methodLabel);fivenumMethod.id=prefix+"fivenum";methodLabel.htmlFor=fivenumMethod.id;
      core.FIVENUM_METHODS.forEach(m=>{const o=node("option",m==="luo/wan/shi"?"luo/wan/shi (default)":m,fivenumMethod);o.value=m;});
      fivenumMethod.value="luo/wan/shi";
      fivenumMethod.addEventListener("change",()=>{answers.fivenumMethod=methodAnswer();if(table)refresh();});
    }
    const integerLabel=node("label","Means are from integer-scored items (enable GRIM check)",root),integerScale=node("input",undefined,integerLabel);
    integerScale.type="checkbox";integerScale.addEventListener("change",()=>{answers.integerScale=integerScale.checked;if(table)refresh();});
    const fileLabel=node("label","Or choose a CSV, TSV or text file",root);
    const file=node("input",undefined,root);file.type="file";file.accept=".csv,.tsv,.txt";file.id=prefix+"file";fileLabel.htmlFor=file.id;
    const status=node("p","Paste a table to begin.",root);status.setAttribute("role","status");status.setAttribute("aria-live","polite");
    const preview=node("div",undefined,root);preview.className="alm-entry-preview";
    const questionBox=node("div",undefined,root);
    const logTitle=node("h3","Conversion log",root),log=node("ul",undefined,root);
    log.setAttribute("aria-labelledby",logTitle.id=prefix+"log");
    const use=node("button","Use these rows",root);use.type="button";use.disabled=true;
    if(paperSupported(core,schema)){
      const paper=node("button","Extract paper text with source confirmation",root);paper.type="button";
      paper.addEventListener("click",()=>{root.remove();mountProvenance(el,{schema,extras,apply,usedAs});});
    }else node("p","Extracting from paper text is not available for this app's inputs; paste a table above instead.",root).className="alm-entry-note alm-entry-no-paper";
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
          node("span",(q.labels&&q.labels[choice])||(q.id.startsWith("column:")?columnName(choice):choice),wrap);
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
      if(output.steps.some(s=>s.fn==="convertFivenum"))showMethodChoice();
      log.replaceChildren();
      output.steps.forEach(s=>node("li","✓ "+s.text,log));
      output.flags.forEach(f=>{const li=node("li",(f.blocking?"⛔ Block: ":"⚠ Warning: ")+(f.study&&!f.text.includes(f.study)?f.study+": ":"")+f.text,log);li.className=f.blocking?"alm-entry-block":"alm-entry-warning";});
      const blocked=output.flags.some(f=>f.blocking);
      use.disabled=blocked||!output.records.length;
      status.textContent=`${core.plural(output.records.length,"row")}; ${core.plural(output.flags.filter(f=>f.blocking).length,"blocking issue")}; ${core.plural(output.flags.filter(f=>!f.blocking).length,"warning")}.`;
      if(focusId){const target=doc.getElementById(focusId);if(target)target.focus();}
    }
    // Column meanings in plain words; the schema's own columns first, the rest behind "More column types…".
    const columnName=v=>v==="ignore"?"Ignore column":core.FIELD_LABELS[v]||v;
    let moreColumns=false;
    function renderPreview(){
      preview.replaceChildren();
      const grid=node("table",undefined,preview);node("caption","Detected table — choose the meaning of each column",grid);
      const head=node("thead",undefined,grid),hr=node("tr",undefined,head);
      const fields=core.SCHEMAS[typeof schema==="object"?schema.name||schema.schema:schema]||core.SCHEMAS.generic;
      const basic=[...new Set(["ignore",...fields,...extras])];
      const more=["est","lo","hi","p","se","sd","mean","n","min","q1","median","q3","max","pct","ci_bounds","summary","summary1","summary2","se1","se2","lo1","hi1","lo2","hi2"].filter(v=>!basic.includes(v)&&!basic.some(b=>columnName(b)===columnName(v)));
      const width=Math.max((table.header||[]).length,...table.rows.map(r=>r.length),0);
      for(let i=0;i<width;i++){
        const th=node("th",undefined,hr);th.scope="col";
        const name=(table.header||[])[i]||"Column "+(i+1);
        const lab=node("label",name,th),select=node("select",undefined,th);
        select.id=prefix+"map-"+i;lab.htmlFor=select.id;
        const current=detection.mapping[i]||"ignore";
        [...new Set([...basic,...(moreColumns?more:[]),current])].forEach(v=>{const option=node("option",columnName(v),select);option.value=v;});
        select.value=current;
        select.addEventListener("change",()=>{detection.mapping[i]=select.value;answers["column:"+i]=select.value;refresh();});
      }
      const body=node("tbody",undefined,grid);
      table.rows.forEach(row=>{const tr=node("tr",undefined,body);for(let i=0;i<width;i++)node("td",row[i]||"",tr);});
      if(!moreColumns&&more.length){const b=node("button","More column types…",preview);b.type="button";b.addEventListener("click",()=>{moreColumns=true;renderPreview();});}
    }
    function parseText(){
      if(/\d,\d/.test(core.normalize(textarea.value).text)&&!decimal.explicit)decimal.value="ask";
      decimalRadios.forEach(r=>r.checked=r.value===decimal.value);showDecimals();
      answers={decimal:decimal.value,integerScale:integerScale.checked,fivenumMethod:methodAnswer()};table=core.parseTable(textarea.value);detection=core.detect(table,schema);
      // Extra column names are supplied by the embedding app; headers match them case-insensitively, and
      // every column question offers them so an extras column can always be confirmed.
      (table.header||[]).forEach((h,i)=>{const extra=extras.find(x=>x.toLowerCase()===String(h).trim().toLowerCase());if(extra){detection.mapping[i]=extra;detection.questions=detection.questions.filter(q=>q.id!=="column:"+i);}});
      detection.questions=detection.questions.map(q=>({...q,choices:[...new Set([...q.choices,...extras])]}));
      renderPreview();refresh();
    }
    parse.addEventListener("click",parseText);
    function resetDecimal(){
      decimal.explicit=false;decimal.value=/\d,\d/.test(core.normalize(textarea.value).text)?"ask":"point";
      decimalRadios.forEach(r=>r.checked=r.value===decimal.value);showDecimals();
    }
    textarea.addEventListener("input",()=>{resetDecimal();fileRevision++;use.disabled=true;output=null;status.textContent="Text changed. Preview and convert to update the rows.";});
    file.addEventListener("change",async()=>{
      const chosen=file.files&&file.files[0];if(!chosen)return;
      const revision=++fileRevision;
      use.disabled=true;output=null;status.textContent="Reading file…";
      try{const text=await chosen.text();if(revision!==fileRevision)return;textarea.value=text;resetDecimal();parseText();}
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
  // Adapters opt into the provenance workflow by supplying their entry.usedAs text.
  // mountProvenance is also available explicitly; all rows in this workflow require confirmation.
  const SAME_SOURCE_NOTICE="These rows are different arms of ONE trial. This app pools single groups; it does not compare arms. To compare intervention with control, use a two-group analysis.";
  const PHASE_LABELS={baseline:"at baseline","follow-up":"at follow-up",change:"change from baseline"};
  const DESIGN_FLAGS=["CLUSTER_NOT_ADJUSTED","CLUSTER_ANALYSIS_REPORTED","CROSSOVER_DESIGN","NOT_RANDOMISED"];
  // Citation per design flag; the user's "not stated" statements and NOT_RANDOMISED carry none.
  const FLAG_CITATIONS={CLUSTER_NOT_ADJUSTED:"Cochrane Handbook v6.5 §23.1.4",CLUSTER_ANALYSIS_REPORTED:"Cochrane Handbook v6.5 §23.1.4",CROSSOVER_DESIGN:"Cochrane Handbook v6.5 §23.2"};
  const UNKNOWN_FACET_TITLES={analysisSet:"Analysis population (not found in the text)",adjustment:"Adjusted for other factors? (not found in the text)",phase:"Type of value (not found in the text)"};
  const has=x=>x!==undefined&&x!==null&&x!=="";
  const SOURCE_CHANGED="Source text changed since confirmation: this row's stored source text no longer matches the text it was confirmed against. Check its stored text (Show full pasted text) and re-confirm.";
  function mountProvenance(el,{schema="generic",extras=[],apply,usedAs=""}={}){
    const core=global.AlmEntry||(typeof module!=="undefined"&&module.exports?require("./alm-entry.js"):null);
    if(!core||typeof apply!=="function")throw new Error("AlmEntry and apply(records) are required");
    if(!paperSupported(core,schema))return mount(el,{schema,extras,apply});
    const doc=el.ownerDocument,prefix="alm-paper-"+(++serial)+"-",rows=[],P=core.provenance;
    const name=schemaName(schema),singleGroup=core.SINGLE_GROUP_SCHEMAS.includes(name);
    let extraction=null,revision=0,applying=false,sameSourceKey="";
    function node(tag,text,parent){const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;}
    function button(text,parent,fn){const e=node("button",text,parent);e.type="button";e.addEventListener("click",fn);return e;}
    function input(title,parent,value="",type="text"){
      const wrap=node("label",undefined,parent),caption=node("span",title,wrap),e=node("input",undefined,wrap);
      e.type=type;e.value=value;e.id=prefix+"field-"+(++serial);caption.id=e.id+"-label";e.setAttribute("aria-labelledby",caption.id);wrap.htmlFor=e.id;return e;
    }
    function options(e,choices){
      e.replaceChildren();const blank=node("option","Choose…",e);blank.value="";
      choices.forEach(([value,label])=>{const option=node("option",label,e);option.value=String(value);});
    }
    function select(title,parent,choices,change){
      const wrap=node("label",undefined,parent),caption=node("span",title,wrap),e=node("select",undefined,wrap);
      e.id=prefix+"choice-"+(++serial);wrap.htmlFor=e.id;e.caption=caption;e.wrap=wrap;caption.id=e.id+"-label";e.setAttribute("aria-labelledby",caption.id);
      options(e,choices);e.value="";e.addEventListener("change",()=>change(e.value));return e;
    }
    const root=node("section",undefined,el);root.className="alm-entry alm-entry-provenance";root.setAttribute("aria-label","Paper text and source confirmation");
    const pasteLabel=node("label","Paste the exact paper text or table",root),edited=node("strong","",pasteLabel),paste=node("textarea",undefined,root);
    edited.className="alm-entry-edited";paste.rows=7;paste.id=prefix+"paste";pasteLabel.htmlFor=paste.id;
    const extractButton=button("Extract candidates",root,()=>preview());extractButton.className="alm-entry-primary";
    node("p","Percentages and p-values are never used as counts.",root).className="alm-entry-note";
    let decimalExplicit=false;
    const decimal=select("Decimal mark in this paste (1.5 = point, 1,5 = comma)",root,[["point","point (1.5)"],["comma","comma (1,5)"],["ask","ask me"]],()=>{decimalExplicit=true;extraction=null;candidatesBox.replaceChildren();questions.replaceChildren();showDecimals();});
    decimal.value="point";
    const decimalList=node("ul",undefined,root);decimalList.className="alm-entry-decimals";decimalList.setAttribute("aria-label","How numbers with a comma are read");
    function showDecimals(){decimalList.replaceChildren();core.decimalPreview(paste.value,decimal.value).forEach(p=>node("li",p.message,decimalList));}
    const wantedOutcome=input("Outcome to look for (used only to rank candidates)",root);
    // N4: the extractor's initials, asked once per session and stored with every confirmation.
    const initials=input("Your initials (recorded with each confirmation)",root);
    try{initials.value=global.sessionStorage&&global.sessionStorage.getItem("alm-entry-initials")||"";}catch(e){initials.value="";}
    const who=()=>String(initials.value||"").trim();
    initials.addEventListener("input",()=>{try{if(global.sessionStorage)global.sessionStorage.setItem("alm-entry-initials",who());}catch(e){}refreshAll();});
    const status=node("p","Add a source result, check its meaning, then confirm each study.",root);status.setAttribute("role","status");status.setAttribute("aria-live","polite");
    const questions=node("div",undefined,root),candidatesBox=node("div",undefined,root),cards=node("div",undefined,root);
    // Same-source guard (U2): blocking for single-group apps until an explicit opt-in.
    const sameSource=node("div",undefined,root);sameSource.className=singleGroup?"alm-entry-same-source":"alm-entry-same-source-info";sameSource.hidden=true;
    const sameSourceText=node("p","",sameSource),optIn=singleGroup?input("I understand these rows are arms of one trial and want them pooled as separate single groups",sameSource,"","checkbox"):null;
    if(optIn)optIn.addEventListener("change",()=>{revision++;refreshAll();});
    const use=button("Use these rows",root,async()=>{
      if(use.disabled||applying||!valid())return;
      const version=revision,groups=P.sameSource(rows.map(r=>r.rec)),optedIn=new Set(singleGroup&&optIn.checked?groups.flat():[]),at=new Date().toISOString();
      const snapshot=rows.map((r,i)=>({...JSON.parse(JSON.stringify(r.rec)),...(optedIn.has(i)?{sameSourceOptIn:{acknowledged:true,text:SAME_SOURCE_NOTICE,rows:groups.find(g=>g.includes(i)).length,acknowledgedAt:at}}:{})}));
      const records=rows.map((r,i)=>({...r.raw,provenance:JSON.parse(JSON.stringify(snapshot[i]))}));
      global.AlmFeaturesState=global.AlmFeaturesState||{};
      const state=global.AlmFeaturesState,previous=state.provenance,previousSummary=state.provenanceSummary;
      const previousMethods=state.entryMethods;
      state.provenance=snapshot;state.provenanceSummary=P.summary(snapshot);state.entryMethods=P.methods(snapshot);applying=true;refreshGate();
      try{
        const response=await apply(records);
        if(response&&response.ok===false)throw new Error("The application did not accept these rows");
        state.entryLog=snapshot.flatMap(r=>[...r.conversions.map(c=>({...c,study:r.label,text:r.label+": "+c.formula,method:c.formula})),
          ...r.flags.filter(f=>DESIGN_FLAGS.includes(f.code)||/^NOT_STATED_/.test(f.code)).map(f=>({study:r.label,text:r.label+": "+f.text,flags:[f],method:"design or reporting flag",...(FLAG_CITATIONS[f.code]?{citation:FLAG_CITATIONS[f.code]}:{})}))]);
        const n=core.plural(records.length,"confirmed row");
        status.textContent=[(version===revision?`Applied ${n}.`:"Applied the confirmed snapshot. Review subsequent edits before applying again."),P.summarySentence(snapshot),...state.entryMethods].join(" ");
        candidatesBox.replaceChildren();questions.replaceChildren();extraction=null;
      }catch(e){state.provenance=previous;state.provenanceSummary=previousSummary;state.entryMethods=previousMethods;status.textContent="Could not apply rows: "+e.message;}
      finally{applying=false;refreshGate();}
    });
    use.disabled=true;
    function sameSourceBlocked(){return singleGroup&&P.sameSource(rows.map(r=>r.rec)).length>0&&!optIn.checked;}
    function valid(){return rows.length>0&&rows.every(r=>P.validate(r.rec).length===0&&r.issues.length===0&&!P.sourceChanged(r.rec))&&!sameSourceBlocked();}
    function refreshGate(){use.disabled=applying||!valid();}
    function download(name,type,data){
      const blob=data instanceof Blob?data:new Blob([data],{type}),url=global.URL.createObjectURL(blob),a=node("a",name,root);
      a.href=url;a.download=name;a.click();a.remove();global.setTimeout(()=>global.URL.revokeObjectURL(url),0);
    }
    const csv=button("Export provenance CSV",root,()=>{if(rows.length)download("provenance.csv","text/csv;charset=utf-8",P.toCSV(rows.map(r=>r.rec)));});
    const docx=button("Export provenance DOCX",root,()=>{
      if(!global.AlmZip||typeof global.AlmZip.docx!=="function"){status.textContent="DOCX export needs AlmZip to be loaded by this app.";return;}
      if(rows.length)try{download("provenance.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",global.AlmZip.docx(P.toDocxParagraphs(rows.map(r=>r.rec))));}catch(e){status.textContent="Could not export DOCX: "+e.message;}
    });
    csv.disabled=true;docx.disabled=true;
    // N4: second extractor. Read-only per-row differences; nothing is merged or changed.
    const compareFile=input("Compare with another extraction (CSV)",root,"","file");compareFile.accept=".csv,text/csv";
    const compareOut=node("div",undefined,root);compareOut.className="alm-entry-compare";compareOut.hidden=true;compareOut.setAttribute("aria-live","polite");
    compareFile.addEventListener("change",async()=>{
      const chosen=compareFile.files&&compareFile.files[0];if(!chosen)return;
      compareOut.replaceChildren();compareOut.hidden=false;
      try{
        const report=P.compare(rows.map(r=>r.rec),P.fromCSV(await chosen.text()));
        node("p",`${core.plural(report.differences,"difference")} between this extraction and the other one. Read-only: nothing here was changed.`,compareOut);
        const list=node("ul",undefined,compareOut);
        for(const r of report.rows){
          const li=node("li",`${r.label||"[no label]"}: ${r.status==="matched"?core.plural(r.diffs.length,"difference"):r.status}`,list);
          if(r.diffs.length){const ul=node("ul",undefined,li);r.diffs.forEach(d=>node("li",`${d.what}: ${d.mine} here, ${d.theirs} in the other extraction`,ul));}
        }
      }catch(e){node("p","Could not compare: "+e.message,compareOut);}
    });
    const plainField=f=>core.FIELD_LABELS[f]||String(f).replace(/^arm(\d+)\.(events|n)$/,(m,i,k)=>`${k==="n"?"total":"events"} (printed arm ${+i+1})`);
    // Highlight the used values inside text[start, end).
    function highlights(parent,rec,start=0,end=rec.pastedText.length){
      parent.replaceChildren();let at=start;
      const spans=rec.values.filter(v=>Array.isArray(v.span)&&v.span[0]>=start&&v.span[1]<=end).sort((a,b)=>a.span[0]-b.span[0]);
      for(const v of spans){
        if(v.span[0]<at)continue;
        node("span",rec.pastedText.slice(at,v.span[0]),parent);
        const mark=node("mark",undefined,parent),hidden=node("span",plainField(v.field)+": ",mark);hidden.className="alm-entry-sr-only";
        node("span",rec.pastedText.slice(...v.span),mark);
        const visible=node("small"," ["+plainField(v.field)+"]",mark);visible.setAttribute("aria-hidden","true");
        at=v.span[1];
      }
      node("span",rec.pastedText.slice(at,end),parent);
    }
    const totalsOf=row=>{
      const arms=row.candidate.kind==="counts"?row.candidate.values.arms:[],c=row.choice;
      if(c.armIndex!==undefined)return [arms[c.armIndex]];
      return [c.treatmentIndex,c.controlIndex].filter(i=>i!==undefined).map(i=>arms[i]).filter(Boolean);
    };
    function rebuild(row){
      const old=row.rec,c=row.candidate,choice=row.choice;
      row.rec=P.fromCandidate(old,c,choice);row.rec.usedAs=usedAs;row.rec.candidateRank=row.rank;row.issues=[];
      if(row.outcomeDef)row.rec.outcomeDefinition=row.outcomeDef;else delete row.rec.outcomeDefinition;
      if(!usedAs)row.issues.push("The app adapter must supply entry.usedAs to explain how these values will be used.");
      row.raw={study:old.label};
      if(c.kind==="counts"){
        if(name==="proportion"){
          if(choice.armIndex===undefined)row.issues.push("Choose the printed arm to use.");
          if(!core.ROLE_NAMES[choice.role])row.issues.push("Say what this arm is: intervention, control or other.");
        }else if(choice.treatmentIndex===undefined||choice.controlIndex===undefined||choice.treatmentIndex===choice.controlIndex)row.issues.push("Choose distinct treatment and control arms.");
        if(!core.DENOMINATOR_CHOICES[choice.denominator])row.issues.push("Say who is counted in the total.");
        row.rec.values.forEach(v=>{if(["ai","ci","n1i","n2i","xi","ni"].includes(v.field))row.raw[v.field]=v.value;});
        Object.assign(row.raw,P.adjusted(row.rec));
        if(!["proportion","binary2x2"].includes(name))row.issues.push("These counts cannot fill this app's required inputs. Choose a compatible result.");
      }else if(c.kind==="effect_ci"&&["generic","contrast-nma","dose"].includes(name)){
        const measure=choice.measure||c.measure;
        if(!measure)row.issues.push("Choose the effect measure.");
        const ratio=["RR","OR","HR","IRR"].includes(measure),v=c.values,logScale=choice.scale==="log";
        if(ratio&&Object.values(v).some(x=>x<=0)&&!choice.scale)row.issues.push("Confirm whether these ratio values are already on the log scale.");
        const result=core.seFromCI({lo:v.lo,hi:v.hi,ratio:ratio&&!logScale,level:c.level});
        row.rec=P.applyConversion(row.rec,{...result,field:"sei",formula:ratio&&!logScale?"SE = (ln(U) - ln(L)) / (2 × z)":"SE = (U - L) / (2 × z)"});
        row.raw.yi=ratio&&!logScale?Math.log(v.effect):v.effect;row.raw.sei=result.value;
        if(ratio&&!logScale){
          row.rec=P.applyConversion(row.rec,{field:"yi",formula:"yi = ln(effect)",method:"log ratio",citation:result.citation,inputs:{effect:v.effect},value:row.raw.yi});
        }
        if(row.rec.design?.designEffect&&choice.cluster?.action==="adjust"&&Number.isFinite(row.raw.sei)){
          const adj=core.clusterSE({se:row.raw.sei,designEffect:row.rec.design.designEffect});
          row.rec=P.applyConversion(row.rec,{...adj,field:"sei",formula:"SE × √(design effect)"});row.raw.sei=adj.value;
        }
        row.raw.est=v.effect;row.raw.lo=v.lo;row.raw.hi=v.hi;row.raw.measure=measure;row.raw.ratio=ratio;row.raw.scale=logScale?"log":"natural";
        if(!Number.isFinite(row.raw.yi)||!Number.isFinite(row.raw.sei))row.issues.push("The values cannot be converted on the selected scale.");
        if(name!=="generic")row.issues.push("This app needs additional contrast or dose fields; supply these through its table workflow.");
      }else if(c.kind==="median_iqr"||c.kind==="mean_sd"){
        const n=Number(choice.n);
        if(!(n>0))row.issues.push("Enter the printed sample size.");
        if(c.kind==="median_iqr"){
          const args={...c.values,n};
          let result=core.convertFivenum(args);
          if(result.flags.some(f=>f.code==="fivenum-skew")&&choice.skew==="convert anyway")result=core.convertFivenum({...args,test:false});
          row.rec=P.applyConversion(row.rec,{...result,field:"mean and SD",formula:"Luo/Wan/Shi mean and SD from median/IQR"});
          row.raw.mean=result.mean;row.raw.sd=result.sd;
        }else{row.raw.mean=c.values.mean;row.raw.sd=c.values.sd;}
        row.raw.n=n;
        row.issues.push("This summary needs a printed sample-size source and the app's remaining arm fields. Use the table workflow to supply these inputs.");
      }else row.issues.push("This result does not supply all raw inputs required by this app.");
      if(!choice.outcome)row.issues.push("Enter the outcome.");
      if(!choice.timepoint)row.issues.push("Choose the timepoint (or Not stated).");
      for(const f of row.rec.requiredFacets||[])if(f.key!=="timepoint"&&!f.choices.includes(choice.facets?.[f.key]))row.issues.push(`Choose: ${facetTitle(f.key)}.`);
      for(const [k,v] of Object.entries(row.rec.facets||{}))if(v==="unknown"&&UNKNOWN_FACET_TITLES[k]&&c.kind!=="counts")row.issues.push(`Choose: ${facetTitle(k)} (or “Not stated in source”).`);
      if(!core.RANDOMISATION_CHOICES[choice.randomisation])row.issues.push("Say what was randomised (individuals, clusters, crossover periods).");
      else if(choice.randomisation==="clusters"&&!["adjust","decline",...(c.kind==="counts"?[]:["already"])].includes(choice.cluster?.action))row.issues.push("Say whether to adjust for clustering.");
      const sanity=core.sanity([row.raw],schema);row.rec.flags.push(...sanity);
      if(c.percentagesCorroborate===false)row.rec.flags.push({code:"PERCENT_MISMATCH",text:"Printed percentages do not corroborate this denominator assignment. Check the source."});
      for(const f of row.rec.flags)if(f.blocking)row.issues.push(f.text);
      row.rec.confirmed=false;row.rec.confirmedAt=null;row.confirm.checked=false;
      revision++;refreshAll();
    }
    const facetTitle=k=>({adjustment:"adjusted or unadjusted estimate",analysisSet:"who is counted (analysis set)",phase:"type of value",timepoint:"timepoint"})[k]||k;
    // Cross-row checks, per-card prompts, confirmation availability, same-source notice and the apply gate.
    function refreshAll(){
      const recs=rows.map(r=>r.rec),same=P.sameArm(recs);
      rows.forEach((row,i)=>{
        const rec=row.rec,arm=P.armIssues(rec),acked=arm.length>0&&row.choice.armAck===P.armAckKey(rec);
        row.cross=same.filter(s=>s.rows.includes(i)).map(s=>s.text);
        const ready=P.validate(rec,{beforeConfirm:true});
        const missing=ready.filter(m=>!["arm role","arm contradiction","blocking flags","randomisation","cluster adjustment"].includes(m)&&!m.startsWith("facet:")&&!m.startsWith("unknown:"));
        const todo=[...row.issues,...row.cross,...(arm.length&&!acked?["The arm you chose does not match the words in the paper. Change it, or tick “I have checked the arm”."]:[]),...(missing.length?["Fill in: "+missing.map(m=>({label:"study label (author and year)",reference:"full reference",location:"source type and location",decimal:"decimal mark (choose point or comma above)","source type":"source type (abstract, table, figure, text, supplement or registry)","outcome definition":"outcome definition (select it again from the paste box)"})[m]||m).join(", ")+"."]:[]),
          ...(who()?[]:["Enter your initials at the top of the panel (recorded with each confirmation)."])];
        row.todo.replaceChildren();todo.forEach(t=>node("li",t,row.todo));
        row.armBox.hidden=!arm.length;row.armText.replaceChildren();arm.forEach(a=>node("li",a.text,row.armText));row.ack.checked=acked;
        const blocked=todo.length>0||ready.length>0;
        if(blocked&&row.confirm.checked){row.confirm.checked=false;P.unconfirm(rec);}
        row.confirm.disabled=blocked;
        // N6: this row's own stored source no longer matches its hash at confirmation (the paste box may hold another paper).
        const changed=P.sourceChanged(rec);row.changed.hidden=!changed;row.reconfirm.disabled=!who()||blocked;
        // N1: cluster inputs only for cluster-randomised rows, with the design effect previewed.
        row.cluster.hidden=row.choice.randomisation!=="clusters";
        const de=rec.design?.designEffect,args=row.choice.cluster||{},adj=P.adjusted(rec,{exact:true});
        row.clusterPreview.textContent=!de?"Design effect: give the mean cluster size (or the number of clusters and the total) and the ICC, or a reported design effect.":
          (has(args.designEffect)?`Design effect (reported) = ${+de.toFixed(3)}`:`Design effect = 1 + (M − 1) × ICC = ${de.toFixed(3)}`+(has(args.m)?"":` (M = ${args.total} / ${args.k})`))+
          (Object.keys(adj).length?"; "+Object.entries(adj).map(([f,x])=>`${plainField(f)} ${rec.values.find(v=>v.field===f).text} → ${+x.toFixed(2)}`).join(", ")+
            ` (entered as ${rec.conversions.filter(x=>x.fn==="clusterCounts").map(x=>x.rounded.events+" of "+x.rounded.n).join(" and ")})`:"");
        row.line.textContent=P.line(rec);
        const clause=P.clause(rec);highlights(row.clause,rec,clause.start,clause.end);
        if(row.full.open)highlights(row.source,rec);
        row.sentence.textContent=P.sentence(rec);
        row.details.replaceChildren();
        rec.conversions.forEach(c=>node("li",`${c.field}: ${c.formula}; ${c.citation}; inputs ${JSON.stringify(c.inputs)}; result ${c.output}`,row.details));
        rec.flags.filter(f=>f.code!=="TIMEPOINT_CHOSEN").forEach(f=>node("li",(f.blocking?"Block: ":"Check: ")+f.text,row.details));
        const totals=totalsOf(row);
        if(row.denominator)row.denominator.caption.textContent=totals.length?`Who is counted in ${totals.map(a=>a.n).join(" and ")}?`:"Who is counted in the total?";
      });
      const groups=P.sameSource(recs),key=JSON.stringify(groups);
      if(key!==sameSourceKey){sameSourceKey=key;if(optIn)optIn.checked=false;}
      sameSource.hidden=!groups.length;
      sameSourceText.textContent=!groups.length?"":singleGroup?SAME_SOURCE_NOTICE+" Rows "+groups.map(g=>g.map(i=>i+1).join(" and ")).join("; ")+" come from the same report or pasted text.":"Rows "+groups.map(g=>g.map(i=>i+1).join(" and ")).join("; ")+" come from the same report. "+P.summarySentence(recs);
      edited.textContent=rows.some(r=>P.sourceChanged(r.rec))?" — Edited since confirmation":"";
      csv.disabled=!rows.length;docx.disabled=!rows.length;
      refreshGate();
    }
    function addCandidate(candidate,text,rank){
      const row={candidate,rank,choice:{},rec:P.create({pastedText:text}),raw:{},issues:[],cross:[]};
      rows.push(row);const card=node("fieldset",undefined,cards);node("legend","Study source "+rows.length,card);
      // What we took (one line), the source clause with highlights, and the confirmation right next to them.
      row.line=node("p","",card);row.line.className="alm-entry-line";
      row.clause=node("p","",card);row.clause.className="alm-entry-clause";
      const confirmBox=node("div",undefined,card);confirmBox.className="alm-entry-confirm";
      row.confirm=input("I confirm this row",confirmBox,"","checkbox");
      row.confirm.addEventListener("change",()=>{
        if(row.confirm.disabled)return;
        if(row.confirm.checked&&who())P.confirm(row.rec,{by:who(),via:"row"});else{row.confirm.checked=false;P.unconfirm(row.rec);}
        revision++;refreshAll();
      });
      row.changed=node("div",undefined,card);row.changed.className="alm-entry-source-changed";row.changed.setAttribute("role","alert");row.changed.hidden=true;
      node("p",SOURCE_CHANGED,row.changed);
      row.reconfirm=button("Re-confirm this row",row.changed,()=>{if(!who()||row.confirm.disabled)return;P.confirm(row.rec,{by:who(),via:"row"});row.confirm.checked=true;revision++;refreshAll();});
      row.todo=node("ul",undefined,card);row.todo.className="alm-entry-todo";row.todo.setAttribute("aria-label","Still to answer for this row");
      row.armBox=node("div",undefined,card);row.armBox.className="alm-entry-arm-check";row.armBox.setAttribute("role","alert");row.armBox.hidden=true;
      row.armText=node("ul",undefined,row.armBox);
      row.ack=input("I have checked the arm in the paper and my choice is correct",row.armBox,"","checkbox");
      row.ack.addEventListener("change",()=>{if(row.ack.checked)row.choice.armAck=P.armAckKey(row.rec);else delete row.choice.armAck;rebuild(row);});
      const set=(key,value)=>{if(value===""||value===undefined)delete row.choice[key];else row.choice[key]=value;};
      let timepoint=null,other=null;
      const timepointChoices=()=>[...core.timepointOptions(text,candidate,row.choice.armIndex).map(o=>[o.value,o.label]),["not stated","Not stated"],["__other__","Other…"]];
      if(candidate.kind==="counts"){
        const cues=candidate.armCues||[];
        const choices=candidate.values.arms.map((a,i)=>[i,`Printed arm ${i+1}: ${a.events} of ${a.n}`+(cues[i]?` (text next to it: “${cues[i].text}”)`:" (no arm phrase recognised next to these numbers)")]);
        for(const [key,title] of (name==="proportion"?[["armIndex","Arm to use"]]:[["treatmentIndex","Treatment arm"],["controlIndex","Control arm"]]))select(title,card,choices,value=>{
          set(key,value===""?undefined:+value);
          if(name==="proportion"){delete row.choice.denominator;if(row.denominator)row.denominator.value="";
            if(timepoint){const keep=timepoint.value;options(timepoint,timepointChoices());timepoint.value=keep;}}
          row.choice.arms={};
          for(const [role,index] of [["treatment",row.choice.treatmentIndex],["control",row.choice.controlIndex],["selected",row.choice.armIndex]])if(index!==undefined)row.choice.arms[role]={index,label:candidate.values.arms[index].label||"Printed arm "+(index+1)};
          rebuild(row);
        });
        if(name==="proportion")select("This arm is",card,[["intervention","Intervention"],["control","Control (usual care, placebo)"],["other","Other"]],value=>{set("role",value);delete row.choice.armAck;rebuild(row);});
      }
      if(candidate.kind==="effect_ci"&&!candidate.measure)select("Effect measure (RR = risk ratio; OR = odds ratio; HR = hazard ratio; MD = mean difference; SMD = standardized mean difference; IRR = incidence rate ratio; RD = risk difference)",card,["RR","OR","HR","MD","SMD","IRR","RD"].map(x=>[x,x]),value=>{row.choice.measure=value;rebuild(row);});
      if(candidate.kind==="effect_ci"&&Object.values(candidate.values).some(x=>x<=0))select("Ratio scale (natural values are positive; log values may be negative)",card,[["natural","Natural scale"],["log","Already log transformed"]],value=>{row.choice.scale=value;rebuild(row);});
      // One merged timepoint control: evidence-annotated options, "Not stated" and "Other…" (nothing preselected).
      timepoint=select("Timepoint",card,timepointChoices(),value=>{
        other.wrap.hidden=value!=="__other__";
        const chosen=value==="__other__"?other.value.trim():value;
        set("timepoint",chosen);row.choice.facets=row.choice.facets||{};
        if(chosen)row.choice.facets.timepoint=chosen;else delete row.choice.facets.timepoint;
        rebuild(row);
      });
      other=input("Other timepoint (as written in the paper)",card);
      const otherWrap=card.children[card.children.length-1];other.wrap=otherWrap;otherWrap.hidden=true;
      other.addEventListener("input",()=>{const v=other.value.trim();set("timepoint",v);row.choice.facets=row.choice.facets||{};if(v)row.choice.facets.timepoint=v;else delete row.choice.facets.timepoint;rebuild(row);});
      if(candidate.kind==="counts"){
        row.denominator=select("Who is counted in the total?",card,Object.entries(core.DENOMINATOR_CHOICES),value=>{set("denominator",value);rebuild(row);});
      }
      // N5: facets with no cue in the text need a value or "Not stated in source" (effect rows; counts ask in plain words above).
      if(candidate.kind!=="counts")for(const key of Object.keys(UNKNOWN_FACET_TITLES)){
        if(candidate.facets?.[key]!=="unknown"||(candidate.requiredFacets||[]).some(f=>f.key===key))continue;
        select(UNKNOWN_FACET_TITLES[key],card,[...core.FACET_CHOICES[key].map(v=>[v,key==="phase"?PHASE_LABELS[v]||v:v]),["not stated","Not stated in source"]],value=>{
          row.choice.facets=row.choice.facets||{};if(value)row.choice.facets[key]=value;else delete row.choice.facets[key];rebuild(row);
        });
      }
      // N1: unit of randomisation (required), with cluster inputs and an explicit adjust/decline choice.
      select("What was randomised?",card,Object.entries(core.RANDOMISATION_CHOICES),value=>{set("randomisation",value);rebuild(row);});
      row.cluster=node("div",undefined,card);row.cluster.className="alm-entry-cluster";row.cluster.hidden=true;
      node("p","Cluster-randomised trial: the design effect 1 + (M − 1) × ICC (Cochrane Handbook v6.5 §23.1.4) divides events and totals, or multiplies an SE by its square root.",row.cluster);
      const clusterSet=(key,value)=>{row.choice.cluster=row.choice.cluster||{};if(value===""||value===undefined)delete row.choice.cluster[key];else row.choice.cluster[key]=value;rebuild(row);};
      for(const [key,title] of [["m","Mean cluster size (M)"],["k","Number of clusters"],["total","Total participants in all clusters"],["icc","ICC (intracluster correlation)"],["designEffect","Or: design effect reported in the paper"]]){
        const e=input(title,row.cluster,"","number");e.step="any";e.min="0";e.addEventListener("input",()=>clusterSet(key,String(e.value||"").trim()===""?"":+e.value));
      }
      select("Source of the ICC or design effect",row.cluster,Object.entries(core.ICC_SOURCES),value=>clusterSet("iccSource",value));
      select("Adjust for clustering?",row.cluster,candidate.kind==="counts"?[["adjust","Yes: divide events and totals by the design effect"],["decline","No: keep the printed counts (flagged as not adjusted)"]]:
        [["already","The reported result already accounts for clustering"],["adjust","Yes: multiply the SE by the square root of the design effect"],["decline","No: keep it unadjusted (flagged as not adjusted)"]],value=>clusterSet("action",value));
      row.clusterPreview=node("p","",row.cluster);row.clusterPreview.className="alm-entry-cluster-preview";
      for(const facet of candidate.requiredFacets||[]){
        if(facet.key==="timepoint")continue;
        const cue=(candidate.facetEvidence?.[facet.key]||[]).map(e=>"“"+e.text+"”").join(", ");
        const title=facet.key==="phase"?"Type of value: at follow-up / change from baseline":facet.key==="adjustment"?"Choose adjustment (adjusted or unadjusted estimate)":"Choose analysis set (who is counted)";
        select(title+(cue?` — text next to the numbers: ${cue}`:""),card,facet.choices.map(v=>[v,facet.key==="phase"?PHASE_LABELS[v]||v:v]),value=>{
          row.choice.facets=row.choice.facets||{};if(value)row.choice.facets[facet.key]=value;else delete row.choice.facets[facet.key];rebuild(row);
        });
      }
      if(candidate.kind==="median_iqr"||candidate.kind==="mean_sd"){
        const n=input("Printed sample size (for conversion preview)",card,"","number");n.addEventListener("input",()=>{row.choice.n=n.value;rebuild(row);});
        if(candidate.kind==="median_iqr")select("Skewness decision",card,[["keep unconverted","Keep unconverted if skewed"],["convert anyway","Convert anyway: data look skewed; the mean/SD estimate may be unreliable"]],value=>{row.choice.skew=value;rebuild(row);});
      }
      const outcome=input("Outcome measured",card);outcome.addEventListener("input",()=>{set("outcome",outcome.value.trim());rebuild(row);});
      // N2: optional verbatim outcome definition, typed or taken from the selection in the paste box (with its span).
      const definition=input("Outcome as defined in the paper (optional, verbatim)",card);
      definition.addEventListener("input",()=>{row.outcomeDef=P.outcomeDefinition(row.rec,definition.value)||undefined;rebuild(row);});
      button("Use the text selected in the paste box",card,()=>{
        const a=paste.selectionStart,b=paste.selectionEnd;
        if(paste.value!==text){status.textContent="To select the outcome definition, the paste box must hold this row's source text.";return;}
        if(!(Number.isInteger(a)&&Number.isInteger(b)&&b>a)){status.textContent="Select the outcome definition in the paste box first.";return;}
        row.outcomeDef=P.outcomeDefinition(row.rec,text.slice(a,b),[a,b]);definition.value=row.outcomeDef.text;rebuild(row);
      });
      // N3: structured source: type + number/page; abstracts get a full-text warning and an optional "Verified against".
      row.source={type:"",detail:""};
      const setSource=()=>{
        const s={type:row.source.type,detail:row.source.detail,...(row.source.type==="Abstract"&&row.source.verifiedAgainst?{verifiedAgainst:row.source.verifiedAgainst}:{})};
        row.rec.source=s;row.rec.location=P.sourceLocation(s);abstractBox.hidden=s.type!=="Abstract";rebuild(row);
      };
      select("Source type",card,core.SOURCE_TYPES.map(t=>[t,t]),value=>{row.source.type=value;setSource();});
      const detail=input("Location: number or page (e.g. 2, p. 5 or Results paragraph)",card);detail.addEventListener("input",()=>{row.source.detail=detail.value.trim();setSource();});
      const abstractBox=node("div",undefined,card);abstractBox.className="alm-entry-abstract";abstractBox.hidden=true;
      node("p",core.ABSTRACT_NOTE,abstractBox).className="alm-entry-abstract-note";
      const verified=input("Verified against (optional, e.g. Table 2 of the full text)",abstractBox);verified.addEventListener("input",()=>{row.source.verifiedAgainst=verified.value.trim();setSource();});
      for(const [key,title] of [["label","Study label (author and year, e.g. Smith 2019)"],["reference","Full reference"],["doi","DOI"],["pmid","PMID"]]){
        const e=input(title,card);
        let link;
        if(key==="doi"||key==="pmid"){
          link=node("a",key==="doi"?"Open DOI":"Open PubMed",card);link.target="_blank";link.rel="noopener noreferrer";link.hidden=true;
        }
        e.addEventListener("input",()=>{
          row.rec[key]=e.value;
          if(link){
            const value=e.value.trim().replace(/^https:\/\/doi\.org\//i,""),ok=key==="doi"?/^10\.\d{4,9}\/\S+$/.test(value):/^\d+$/.test(value);
            link.hidden=!ok;link.href=ok?(key==="doi"?"https://doi.org/"+encodeURIComponent(value):"https://pubmed.ncbi.nlm.nih.gov/"+value+"/"):"";
          }
          rebuild(row);
        });
      }
      node("p","Decimal mark for this source: "+candidate.decimal,card);
      // Full paste behind a disclosure; rendered when opened.
      row.full=node("details",undefined,card);node("summary","Show full pasted text",row.full);
      row.source=node("pre",undefined,row.full);row.source.className="alm-entry-source";
      row.full.addEventListener("toggle",()=>{if(row.full.open)highlights(row.source,row.rec);});
      node("h4","Conversions and checks",card);row.details=node("ul",undefined,card);
      node("h4","What we took and how we used it",card);row.sentence=node("p",undefined,card);
      button("Remove this row",card,()=>{rows.splice(rows.indexOf(row),1);card.remove();revision++;refreshAll();});
      rebuild(row);return row;
    }
    function candidateLabel(c,i,original){
      const t=k=>original.slice(...c.spans[k]);
      if(c.flagged)return c.sanity.map(f=>f.text).join("; ");
      const what=c.kind==="counts"?c.values.arms.map((a,j)=>t("arms."+j+".events")+"/"+t("arms."+j+".n")).join(" vs "):c.kind==="effect_ci"?`${c.measure?c.measure+" ":""}${t("effect")} (${t("lo")} to ${t("hi")})`:c.cue;
      const wanted=wantedOutcome.value.trim();
      return (i===0&&wanted?`Best match for '${wanted}': `:"")+what;
    }
    function preview(){
      if(/\d,\d/.test(core.normalize(paste.value).text)&&!decimalExplicit)decimal.value="ask";
      showDecimals();
      extraction=core.extract(paste.value,schema,{decimal:decimal.value,outcome:wantedOutcome.value});questions.replaceChildren();candidatesBox.replaceChildren();
      extraction.questions.filter(q=>q.id==="decimal").forEach(q=>node("p",q.text,questions));
      const original=paste.value;
      if(!extraction.candidates.length){status.textContent="No supported result found. Paste the full interval, explicit events and totals, or a table including its headers.";return;}
      const chooser=select("Choose the source result to add",candidatesBox,extraction.candidates.map((c,i)=>[i,candidateLabel(c,i,original)]),()=>{add.disabled=chooser.value===""||extraction.decimal==="ask";});
      const add=button("Add chosen result",candidatesBox,()=>{if(chooser.value!=="")addCandidate(extraction.candidates[+chooser.value],original,+chooser.value+1);});add.disabled=true;
      const flagged=extraction.candidates.filter(c=>c.flagged).length;
      status.textContent=`${core.plural(extraction.candidates.length,"candidate")}${flagged?` (${flagged} flagged: check the paper)`:""}. Select each result you need and check its source.`;
    }
    paste.addEventListener("input",()=>{decimalExplicit=false;decimal.value=/\d,\d/.test(core.normalize(paste.value).text)?"ask":"point";extraction=null;candidatesBox.replaceChildren();questions.replaceChildren();showDecimals();refreshAll();});
    return {element:root,parse:preview,getResult:()=>({records:rows.map(r=>r.raw),provenance:rows.map(r=>r.rec),extraction}),destroy(){revision++;root.remove();}};
  }
  const api={mount,mountProvenance};global.AlmEntryUI=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
