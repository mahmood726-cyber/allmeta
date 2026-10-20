/* Load alm-entry.js and alm-entry.css before mounting. No app wiring. */
(function(global){
  "use strict";
  let serial=0;
  function mount(el,{schema="generic",extras=[],apply,usedAs,provenance=false}={}){
    if(provenance||usedAs!==undefined)return mountProvenance(el,{schema,extras,apply,usedAs});
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
    const decimalGroup=node("div",undefined,root),decimal={value:"point",explicit:false},decimalRadios=[];
    decimalGroup.setAttribute("role","group");decimalGroup.setAttribute("aria-label","Decimal mark");
    node("span","Decimal mark: point · comma · ask",decimalGroup);
    for(const value of ["point","comma","ask"]){
      const lab=node("label",value,decimalGroup),radio=node("input",undefined,lab);
      radio.type="radio";radio.name=prefix+"decimal";radio.value=value;radio.checked=value==="point";decimalRadios.push(radio);
      radio.addEventListener("change",()=>{decimal.value=value;decimal.explicit=true;answers.decimal=value;if(table)refresh();});
    }
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
    const parse=node("button","Preview and convert",root);parse.type="button";
    const status=node("p","Paste a table to begin.",root);status.setAttribute("role","status");status.setAttribute("aria-live","polite");
    const preview=node("div",undefined,root);preview.className="alm-entry-preview";
    const questionBox=node("div",undefined,root);
    const logTitle=node("h3","Conversion log",root),log=node("ul",undefined,root);
    log.setAttribute("aria-labelledby",logTitle.id=prefix+"log");
    const use=node("button","Use these rows",root);use.type="button";use.disabled=true;
    const paper=node("button","Extract paper text with source confirmation",root);paper.type="button";
    paper.addEventListener("click",()=>{root.remove();mountProvenance(el,{schema,extras,apply,usedAs});});
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
          node("span",(q.labels&&q.labels[choice])||choice,wrap);
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
      if(/\d,\d/.test(core.normalize(textarea.value).text)&&!decimal.explicit)decimal.value="ask";
      decimalRadios.forEach(r=>r.checked=r.value===decimal.value);
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
      decimalRadios.forEach(r=>r.checked=r.value===decimal.value);
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
  function mountProvenance(el,{schema="generic",apply,usedAs=""}={}){
    const core=global.AlmEntry||(typeof module!=="undefined"&&module.exports?require("./alm-entry.js"):null);
    if(!core||typeof apply!=="function")throw new Error("AlmEntry and apply(records) are required");
    const doc=el.ownerDocument,prefix="alm-paper-"+(++serial)+"-",rows=[];
    let extraction=null,revision=0,applying=false;
    function node(tag,text,parent){const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;}
    function button(text,parent,fn){const e=node("button",text,parent);e.type="button";e.addEventListener("click",fn);return e;}
    function input(title,parent,value="",type="text"){
      const wrap=node("label",undefined,parent),caption=node("span",title,wrap),e=node("input",undefined,wrap);
      e.type=type;e.value=value;e.id=prefix+"field-"+(++serial);caption.id=e.id+"-label";e.setAttribute("aria-labelledby",caption.id);wrap.htmlFor=e.id;return e;
    }
    function select(title,parent,choices,change){
      const wrap=node("label",title,parent),e=node("select",undefined,wrap);e.id=prefix+"choice-"+(++serial);wrap.htmlFor=e.id;
      const blank=node("option","Choose…",e);blank.value="";
      choices.forEach(([value,label])=>{const option=node("option",label,e);option.value=String(value);});
      e.value="";e.addEventListener("change",()=>change(e.value));return e;
    }
    const root=node("section",undefined,el);root.className="alm-entry alm-entry-provenance";root.setAttribute("aria-label","Paper text and source confirmation");
    const pasteLabel=node("label","Paste the exact paper text or table",root),paste=node("textarea",undefined,root);
    paste.rows=7;paste.id=prefix+"paste";pasteLabel.htmlFor=paste.id;
    let decimalExplicit=false;
    const decimal=select("Decimal mark: point · comma · ask",root,[["point","point"],["comma","comma"],["ask","ask"]],()=>{decimalExplicit=true;extraction=null;candidatesBox.replaceChildren();questions.replaceChildren();});
    decimal.value="point";
    const wantedOutcome=input("Outcome to look for (used only to rank candidates)",root);
    const status=node("p","Add a source result, check its meaning, then confirm each study.",root);status.setAttribute("role","status");status.setAttribute("aria-live","polite");
    const questions=node("div",undefined,root),candidatesBox=node("div",undefined,root),cards=node("div",undefined,root);
    const use=button("Use these rows",root,async()=>{
      if(use.disabled||applying||!valid())return;
      const version=revision,snapshot=rows.map(r=>JSON.parse(JSON.stringify(r.rec))),records=rows.map(r=>({...r.raw,provenance:JSON.parse(JSON.stringify(r.rec))}));
      global.AlmFeaturesState=global.AlmFeaturesState||{};
      const state=global.AlmFeaturesState,previous=state.provenance;
      state.provenance=snapshot;applying=true;refreshGate();
      try{
        const response=await apply(records);
        if(response&&response.ok===false)throw new Error("The application did not accept these rows");
        state.entryLog=snapshot.flatMap(r=>r.conversions.map(c=>({...c,study:r.label,text:r.label+": "+c.formula,method:c.formula})));
        status.textContent=version===revision?`Applied ${records.length} confirmed rows.`:"Applied the confirmed snapshot. Review subsequent edits before applying again.";
      }catch(e){state.provenance=previous;status.textContent="Could not apply rows: "+e.message;}
      finally{applying=false;refreshGate();}
    });
    use.disabled=true;
    function valid(){return rows.length>0&&rows.every(r=>core.provenance.validate(r.rec).length===0&&r.issues.length===0);}
    function refreshGate(){use.disabled=applying||!valid();}
    function download(name,type,data){
      const blob=data instanceof Blob?data:new Blob([data],{type}),url=global.URL.createObjectURL(blob),a=node("a",name,root);
      a.href=url;a.download=name;a.click();a.remove();global.setTimeout(()=>global.URL.revokeObjectURL(url),0);
    }
    const csv=button("Export provenance CSV",root,()=>{if(rows.length)download("provenance.csv","text/csv;charset=utf-8",core.provenance.toCSV(rows.map(r=>r.rec)));});
    const docx=button("Export provenance DOCX",root,()=>{
      if(!global.AlmZip||typeof global.AlmZip.docx!=="function"){status.textContent="DOCX export needs AlmZip to be loaded by this app.";return;}
      if(rows.length)try{download("provenance.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",global.AlmZip.docx(core.provenance.toDocxParagraphs(rows.map(r=>r.rec))));}catch(e){status.textContent="Could not export DOCX: "+e.message;}
    });
    csv.disabled=true;docx.disabled=true;
    function highlights(parent,rec){
      parent.replaceChildren();let end=0;
      const spans=rec.values.slice().sort((a,b)=>a.span[0]-b.span[0]);
      for(const v of spans){
        if(v.span[0]<end)continue;
        node("span",rec.pastedText.slice(end,v.span[0]),parent);
        const mark=node("mark",undefined,parent),hidden=node("span",v.field+": ",mark);hidden.className="alm-entry-sr-only";
        node("span",rec.pastedText.slice(...v.span),mark);
        const visible=node("small"," ["+v.field+"]",mark);visible.setAttribute("aria-hidden","true");
        end=v.span[1];
      }
      node("span",rec.pastedText.slice(end),parent);
    }
    function rebuild(row){
      const old=row.rec,c=row.candidate,choice=row.choice;
      row.rec=core.provenance.fromCandidate(old,c,choice);row.rec.usedAs=usedAs;row.issues=[];
      if(!usedAs)row.issues.push("The app adapter must supply entry.usedAs to explain how these values will be used.");
      if(!choice.outcome)row.issues.push("Enter the outcome.");
      if(!choice.timepoint)row.issues.push("Enter the timepoint (or write not stated).");
      row.raw={study:old.label};
      const name=typeof schema==="object"?schema.name||schema.schema:schema;
      if(c.kind==="counts"){
        if(name==="proportion"){
          if(choice.armIndex===undefined)row.issues.push("Choose the arm to use.");
        }else if(choice.treatmentIndex===undefined||choice.controlIndex===undefined||choice.treatmentIndex===choice.controlIndex)row.issues.push("Choose distinct treatment and control arms.");
        row.rec.values.forEach(v=>{if(["ai","ci","n1i","n2i","xi","ni"].includes(v.field))row.raw[v.field]=v.value;});
        if(!["proportion","binary2x2"].includes(name))row.issues.push("These counts cannot fill this app's required inputs. Choose a compatible result.");
      }else if(c.kind==="effect_ci"&&["generic","contrast-nma","dose"].includes(name)){
        const measure=choice.measure||c.measure;
        if(!measure)row.issues.push("Choose the effect measure.");
        const ratio=["RR","OR","HR","IRR"].includes(measure),v=c.values,logScale=choice.scale==="log";
        if(ratio&&Object.values(v).some(x=>x<=0)&&!choice.scale)row.issues.push("Confirm whether these ratio values are already on the log scale.");
        const result=core.seFromCI({lo:v.lo,hi:v.hi,ratio:ratio&&!logScale,level:c.level});
        row.rec=core.provenance.applyConversion(row.rec,{...result,field:"sei",formula:ratio&&!logScale?"SE = (ln(U) - ln(L)) / (2 × z)":"SE = (U - L) / (2 × z)"});
        row.raw.yi=ratio&&!logScale?Math.log(v.effect):v.effect;row.raw.sei=result.value;
        if(ratio&&!logScale){
          row.rec=core.provenance.applyConversion(row.rec,{field:"yi",formula:"yi = ln(effect)",method:"log ratio",citation:result.citation,inputs:{effect:v.effect},value:row.raw.yi});
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
          row.rec=core.provenance.applyConversion(row.rec,{...result,field:"mean and SD",formula:"Luo/Wan/Shi mean and SD from median/IQR"});
          row.raw.mean=result.mean;row.raw.sd=result.sd;
        }else{row.raw.mean=c.values.mean;row.raw.sd=c.values.sd;}
        row.raw.n=n;
        row.issues.push("This summary needs a printed sample-size source and the app's remaining arm fields. Use the table workflow to supply these inputs.");
      }else row.issues.push("This result does not supply all raw inputs required by this app.");
      const sanity=core.sanity([row.raw],schema);row.rec.flags.push(...sanity);
      if(c.percentagesCorroborate===false)row.rec.flags.push({code:"PERCENT_MISMATCH",text:"Printed percentages do not corroborate this denominator assignment. Check the source."});
      for(const f of sanity)if(f.blocking)row.issues.push(f.text);
      row.confirm.checked=false;row.rec.confirmed=false;row.rec.confirmedAt=null;
      row.confirm.disabled=row.issues.length>0||core.provenance.validate({...row.rec,confirmed:true}).length>0;
      highlights(row.source,row.rec);row.sentence.textContent=core.provenance.sentence(row.rec);
      row.details.replaceChildren();
      row.rec.conversions.forEach(c=>node("li",`${c.field}: ${c.formula}; ${c.citation}; inputs ${JSON.stringify(c.inputs)}; result ${c.output}`,row.details));
      row.rec.flags.forEach(f=>node("li",(f.blocking?"Block: ":"Check: ")+f.text,row.details));
      row.issues.forEach(t=>node("li",t,row.details));
      const missing=core.provenance.validate({...row.rec,confirmed:true});
      if(missing.length)node("li","Required source details: "+missing.join(", "),row.details);
      revision++;refreshGate();
    }
    function addCandidate(candidate,text){
      const row={candidate,choice:{},rec:core.provenance.create({pastedText:text}),raw:{},issues:[]};
      rows.push(row);const card=node("fieldset",undefined,cards);node("legend","Study source "+rows.length,card);
      row.source=node("pre",undefined,card);row.source.className="alm-entry-source";
      for(const [key,title] of [["label","Study label (author and year, e.g. Smith 2019)"],["reference","Full reference"],["location","Location (table, figure or page)"],["doi","DOI"],["pmid","PMID"]]){
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
      if(candidate.kind==="counts"){
        const choices=candidate.values.arms.map((a,i)=>[i,`Printed arm ${i+1}${a.label?" ("+a.label+")":""}: ${a.events} of ${a.n}`]);
        const name=typeof schema==="object"?schema.name||schema.schema:schema;
        for(const [key,title] of (name==="proportion"?[["armIndex","Arm to use"]]:[["treatmentIndex","Treatment arm"],["controlIndex","Control arm"]]))select(title,card,choices,value=>{
          if(value==="")delete row.choice[key];else row.choice[key]=+value;
          row.choice.arms={};
          for(const [role,index] of [["treatment",row.choice.treatmentIndex],["control",row.choice.controlIndex],["selected",row.choice.armIndex]])if(index!==undefined)row.choice.arms[role]={index,label:candidate.values.arms[index].label||"Printed arm "+(index+1)};
          rebuild(row);
        });
      }
      if(candidate.kind==="effect_ci"&&!candidate.measure)select("Effect measure (RR = risk ratio; OR = odds ratio; HR = hazard ratio; MD = mean difference; SMD = standardized mean difference; IRR = incidence rate ratio; RD = risk difference)",card,["RR","OR","HR","MD","SMD","IRR","RD"].map(x=>[x,x]),value=>{row.choice.measure=value;rebuild(row);});
      if(candidate.kind==="effect_ci"&&Object.values(candidate.values).some(x=>x<=0))select("Ratio scale (natural values are positive; log values may be negative)",card,[["natural","Natural scale"],["log","Already log transformed"]],value=>{row.choice.scale=value;rebuild(row);});
      node("p","Decimal mark for this source: "+candidate.decimal+"; rule: "+candidate.rule,card);
      for(const [key,value] of Object.entries(candidate.facets||{})){
        const evidence=(candidate.facetEvidence[key]||[]).map(e=>e.text).join(", ");
        node("p",key+": "+value+(evidence?" (source cue: "+evidence+")":""),card);
      }
      for(const facet of candidate.requiredFacets||[])select("Choose "+facet.key,card,facet.choices.map(v=>[v,v]),value=>{
        row.choice.facets=row.choice.facets||{};row.choice.facets[facet.key]=value;rebuild(row);
      });
      if(candidate.kind==="median_iqr"||candidate.kind==="mean_sd"){
        const n=input("Printed sample size (for conversion preview)",card,"","number");n.addEventListener("input",()=>{row.choice.n=n.value;rebuild(row);});
        if(candidate.kind==="median_iqr")select("Skewness decision",card,[["keep unconverted","Keep unconverted if skewed"],["convert anyway","Convert anyway: data look skewed; the mean/SD estimate may be unreliable"]],value=>{row.choice.skew=value;rebuild(row);});
      }
      for(const [key,title] of [["outcome","Outcome measured"],["timepoint","Timepoint (or not stated)"]]){
        const e=input(title,card);e.addEventListener("input",()=>{row.choice[key]=e.value.trim();rebuild(row);});
      }
      node("h4","Conversions and checks",card);row.details=node("ul",undefined,card);
      node("h4","What we took and how we used it",card);row.sentence=node("p",undefined,card);
      row.confirm=input("I confirm this row",card,"","checkbox");
      row.confirm.addEventListener("change",()=>{
        if(row.confirm.disabled)return;
        row.rec.confirmed=row.confirm.checked;row.rec.confirmedAt=row.rec.confirmed?new Date().toISOString():null;revision++;refreshGate();
      });
      button("Remove this row",card,()=>{rows.splice(rows.indexOf(row),1);card.remove();revision++;refreshGate();csv.disabled=!rows.length;docx.disabled=!rows.length;});
      rebuild(row);csv.disabled=false;docx.disabled=false;return row;
    }
    function preview(){
      if(/\d,\d/.test(core.normalize(paste.value).text)&&!decimalExplicit)decimal.value="ask";
      extraction=core.extract(paste.value,schema,{decimal:decimal.value,outcome:wantedOutcome.value});questions.replaceChildren();candidatesBox.replaceChildren();
      extraction.questions.forEach(q=>node("p",q.text,questions));
      const original=paste.value;
      if(!extraction.candidates.length){status.textContent="No supported result found. Paste the full interval, explicit events and totals, or a table including its headers.";return;}
      const chooser=select("Choose the source result to add",candidatesBox,extraction.candidates.map((c,i)=>[i,`Rank ${i+1}, score ${c.score.toFixed(2)}: `+(c.measure?c.measure+" — ":"")+c.cue]),()=>{add.disabled=chooser.value===""||extraction.decimal==="ask";});
      const add=button("Add chosen result",candidatesBox,()=>{if(chooser.value!=="")addCandidate(extraction.candidates[+chooser.value],original);});add.disabled=true;
      status.textContent=`${extraction.candidates.length} candidates. Select each result you need and check its source.`;
    }
    button("Extract candidates",root,preview);
    paste.addEventListener("input",()=>{decimalExplicit=false;decimal.value=/\d,\d/.test(core.normalize(paste.value).text)?"ask":"point";extraction=null;candidatesBox.replaceChildren();questions.replaceChildren();});
    return {element:root,parse:preview,getResult:()=>({records:rows.map(r=>r.raw),provenance:rows.map(r=>r.rec),extraction}),destroy(){revision++;root.remove();}};
  }
  const api={mount,mountProvenance};global.AlmEntryUI=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
