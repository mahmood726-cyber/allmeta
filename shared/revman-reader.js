/* RevMan reader: strict, local .rm5 XML and CSV/tab study tables.
 * No pooling or effect-size conversion occurs here. Numeric inputs are retained.
 * XML vocabulary checked against meta::read.rm5 (R/read.rm5-internal.R).
 * Web CSV vocabulary: Cochrane RevMan Knowledge Base, data-package-specification-249561249.
 * parse(buffer) remains asynchronous; parseText(text) is pure and Node/browser compatible.
 * select(review, {comparison,outcome,subgroup}, schema, {filename}) requires all three choices.
 */
(function (global) {
  'use strict';
  const fields = {
    binary2x2: ['ai','n1i','ci','n2i'],
    continuous: ['m1i','sd1i','n1i','m2i','sd2i','n2i'],
    generic: ['yi','sei']
  };
  const typeSchema = {binary:'binary2x2',continuous:'continuous',generic:'generic',o_e_var:'generic'};
  const fail = message => { throw new Error(message); };
  const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  function number(value, label) {
    const text = String(value == null ? '' : value).trim();
    if (!NUMBER.test(text) || !Number.isFinite(Number(text))) fail('Invalid number for '+label+': '+text);
    return Number(text);
  }
  function year(value) {
    if (value == null || value === '') return null;
    const text = String(value).trim();
    if (!/^[12]\d{3}[a-z]?$/.test(text)) fail('Invalid study year: '+text);
    return /^\d+$/.test(text) ? Number(text) : text;
  }
  function validateRecords(records, schema) {
    if (!fields[schema]) fail('Unsupported input schema: '+schema);
    if (!Array.isArray(records) || !records.length) fail('No study rows to import or export.');
    const ids = new Set();
    records.forEach((r,i) => {
      const where = 'row '+(i+1)+' ('+r.study+')';
      if (typeof r.study !== 'string' || !r.study.trim()) fail('Missing study name in '+where);
      fields[schema].forEach(f => { if (typeof r[f] !== 'number' || !Number.isFinite(r[f])) fail('Invalid number '+f+' in '+where); });
      if (r.year != null) year(r.year);
      const id = r.studyId || r.study;
      if (ids.has(id)) fail('Duplicate study ID in selected subgroup: '+id);
      ids.add(id);
      if (schema === 'generic') {
        const v = r.sei*r.sei;
        if (!(r.sei>0 && Number.isFinite(v) && v>0 && Number.isFinite(1/v) && Number.isFinite(r.yi/v))) fail('SE must be positive and numerically representable in '+where);
      } else {
        for (const f of ['n1i','n2i']) if (!Number.isSafeInteger(r[f]) || r[f]<=0) fail('Invalid positive whole total '+f+' in '+where);
        if (schema==='binary2x2') {
          if (!Number.isSafeInteger(r.ai) || !Number.isSafeInteger(r.ci) || r.ai<0 || r.ci<0 || r.ai>r.n1i || r.ci>r.n2i) fail('Invalid events/total in '+where);
        } else if (!(r.sd1i>0 && r.sd2i>0 && r.n1i>1 && r.n2i>1)) fail('Invalid SD or continuous total in '+where+' (SD > 0 and total > 1 required).');
      }
    });
    return records;
  }
  function measure(value) {
    const s=String(value||'').trim().toUpperCase();
    return ({'ODDS RATIO':'OR','PETO_OR':'OR','PETO ODDS RATIO':'OR','RISK RATIO':'RR','RISK DIFFERENCE':'RD','MEAN DIFFERENCE':'MD','STANDARDIZED MEAN DIFFERENCE':'SMD','STD. MEAN DIFFERENCE':'SMD','HAZARD RATIO':'HR'})[s] || s || 'OTHER';
  }

  // Deliberately bounded XML subset: no DTD, entities, network or recovery parsing.
  // One strict parser is used in Node and browsers so malformed files cannot pass only in tests.
  function xmlTree(input) {
    const text=String(input).replace(/^\uFEFF/,'');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('DOCTYPE/DTD is not supported in RevMan imports.');
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) fail('Malformed XML: invalid control character.');
    const entity=s=>s.replace(/&([^;\s<]*);|&/g,(all,name)=>{
      const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
      if(Object.hasOwn(named,name))return named[name];
      if (/^#(?:x[0-9a-f]+|\d+)$/i.test(name||'')) {
        const n=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));
        if (n===9||n===10||n===13||(n>=32&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)&&n!==0xfffe&&n!==0xffff)) return String.fromCodePoint(n);
      }
      fail('Malformed XML: invalid entity '+all);
    });
    const doc={tag:'#document',attrs:{},children:[],text:''}, stack=[doc];
    const token=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/[A-Za-z_][\w.:-]*\s*>|<[A-Za-z_][\w.:-]*(?:[^<>"']|"[^"<]*"|'[^'<]*')*>|[^<]+/gy;
    let pos=0,m;
    while(pos<text.length){
      token.lastIndex=pos;m=token.exec(text);
      if(!m)fail('Malformed XML near character '+pos);
      const raw=m[0], parent=stack[stack.length-1];pos=token.lastIndex;
      if(raw.startsWith('<!--')){if(raw.slice(4,-3).includes('--'))fail('Malformed XML comment');continue;}
      if(raw.startsWith('<?'))continue;
      if(raw.startsWith('<![CDATA[')){if(stack.length===1)fail('Malformed XML: CDATA outside root');parent.text+=raw.slice(9,-3);continue;}
      if(raw.startsWith('</')){
        if(stack.length===1||parent.tag!==raw.slice(2,-1).trim())fail('Malformed XML: mismatched closing tag '+raw);
        parent.end=pos;stack.pop();continue;
      }
      if(raw[0]!=='<'){
        if(stack.length===1&&raw.trim())fail('Malformed XML: text outside root');
        if(raw.includes(']]>'))fail('Malformed XML text');parent.text+=entity(raw);continue;
      }
      const name=/^<([A-Za-z_][\w.:-]*)/.exec(raw)[1];
      let rest=raw.slice(name.length+1).replace(/\/?\s*>$/,'');
      const attrs=Object.create(null);
      while(rest.trim()){
        const a=/^\s+([A-Za-z_][\w.:-]*)\s*=\s*("[^"]*"|'[^']*')/.exec(rest);
        if(!a||Object.hasOwn(attrs,a[1]))fail('Malformed XML: invalid or duplicate attribute on '+name);
        attrs[a[1]]=entity(a[2].slice(1,-1));rest=rest.slice(a[0].length);
      }
      const n={tag:name,attrs,children:[],text:'',start:m.index,end:pos};parent.children.push(n);
      if(!/\/\s*>$/.test(raw))stack.push(n);
      if(stack.length>128)fail('Malformed XML: nesting exceeds 128 levels.');
    }
    if(stack.length!==1||doc.children.length!==1)fail('Malformed XML: unclosed tags or multiple roots.');
    return doc.children[0];
  }
  const children=(node,tag)=>node.children.filter(n=>n.tag===tag);
  function descendants(node,tag){return node.children.flatMap(n=>(n.tag===tag?[n]:[]).concat(descendants(n,tag)));}
  function content(n){return n.text+n.children.map(content).join('');}
  function prop(n,key){const c=children(n,key);return n.attrs[key] || (c.length?content(c[0]).trim():null);}
  function rawRecord(s,type){
    const r={study:s.name,studyId:s.id,year:s.year,effectMeasure:s.scale};
    if(type==='binary')Object.assign(r,{ai:s.arms[0].events,n1i:s.arms[0].n,ci:s.arms[1].events,n2i:s.arms[1].n});
    else if(type==='continuous')Object.assign(r,{m1i:s.arms[0].mean,sd1i:s.arms[0].sd,n1i:s.arms[0].n,m2i:s.arms[1].mean,sd2i:s.arms[1].sd,n2i:s.arms[1].n});
    else Object.assign(r,{yi:s.precomputed.est,sei:s.precomputed.se});
    return r;
  }
  function _parseXmlString(text){
    text=String(text).replace(/^\uFEFF/,'');
    const root=xmlTree(text);
    if(root.tag!=='COCHRANE_REVIEW')fail('Not a RevMan file (no <COCHRANE_REVIEW> root)');
    const studies=Object.create(null);
    descendants(root,'STUDY').forEach(n=>{
      const id=prop(n,'ID');if(!id)fail('Missing study ID');if(studies[id])fail('Duplicate study ID: '+id);
      studies[id]={id,name:prop(n,'NAME')||id,year:year(prop(n,'YEAR')||prop(n,'YEAR_OF_PUB'))};
    });
    const kinds={DICH_OUTCOME:['binary','DICH_DATA','DICH_SUBGROUP'],CONT_OUTCOME:['continuous','CONT_DATA','CONT_SUBGROUP'],CONTINUOUS_OUTCOME:['continuous','CONTINUOUS_DATA','CONTINUOUS_SUBGROUP'],IV_OUTCOME:['generic','IV_DATA','IV_SUBGROUP'],O_E_AND_VARIANCE_OUTCOME:['o_e_var','O_E_AND_VARIANCE_DATA','O_E_AND_VARIANCE_SUBGROUP']};
    const comparisons=descendants(root,'COMPARISON').map((n,ci)=>{
      const outcomes=n.children.filter(o=>/_OUTCOME$/.test(o.tag)).map((o,oi)=>{
        if(!kinds[o.tag])fail('Unsupported RevMan outcome type: '+o.tag);
        const [type,dataTag,groupTag]=kinds[o.tag], em=measure(prop(o,'EFFECT_MEASURE'));
        const arm1Name=prop(o,'GROUP_LABEL_1')||prop(n,'GROUP_LABEL_1')||'Experimental';
        const arm2Name=prop(o,'GROUP_LABEL_2')||prop(n,'GROUP_LABEL_2')||'Control';
        const groups=children(o,groupTag), direct=children(o,dataTag);
        const containers=groups.slice();if(direct.length||!groups.length)containers.unshift(o);
        const subgroups=containers.map((g,gi)=>{
          const data=children(g,dataTag), ss=data.map(d=>{
            const sid=prop(d,'STUDY_ID'),meta=studies[sid];if(!meta)fail('Unresolved study ID: '+sid);
            const s={...meta,scale:em,source:text.slice(d.start,d.end),arms:[]};
            const num=(...keys)=>number(keys.map(k=>prop(d,k)).find(v=>v!==null),sid+' '+keys[0]);
            if(type==='binary')s.arms=[{treatment:arm1Name,events:num('EVENTS_1'),n:num('TOTAL_1')},{treatment:arm2Name,events:num('EVENTS_2'),n:num('TOTAL_2')}];
            else if(type==='continuous')s.arms=[{treatment:arm1Name,mean:num('MEAN_1'),sd:num('SD_1'),n:num('TOTAL_1','N_1')},{treatment:arm2Name,mean:num('MEAN_2'),sd:num('SD_2'),n:num('TOTAL_2','N_2')}];
            else if(type==='generic')s.precomputed={est:num('EFFECT_SIZE','ESTIMATE'),se:num('SE')};
            else {const oe=num('O_MINUS_E','O_E'),v=num('VARIANCE','VAR');if(v<=0)fail('Invalid O-E variance');s.precomputed={est:oe/v,se:1/Math.sqrt(v)};}
            return s;
          });
          if(ss.length)validateRecords(ss.map(s=>rawRecord(s,type)),typeSchema[type]);
          return {id:g===o?'ungrouped':(prop(g,'ID')||prop(g,'NO')||String(gi+1)),name:g===o?'No subgroup':(prop(g,'NAME')||'Subgroup '+(gi+1)),studies:ss};
        });
        if(descendants(o,dataTag).length!==subgroups.reduce((s,g)=>s+g.studies.length,0))fail('Unsupported nested subgroup data in '+prop(o,'NAME'));
        return {id:prop(o,'ID')||prop(o,'NO')||String(oi+1),name:prop(o,'NAME')||'Outcome '+(oi+1),type,effectMeasure:em,logData:prop(o,'LOG_DATA'),arm1Name,arm2Name,subgroups,studies:subgroups.flatMap(g=>g.studies)};
      });
      return {id:prop(n,'ID')||prop(n,'NO')||String(ci+1),name:prop(n,'NAME')||'Comparison '+(ci+1),outcomes};
    });
    if(!comparisons.length)fail('No comparisons in RevMan file.');
    return {title:prop(root,'TITLE')||(descendants(root,'TITLE')[0]?content(descendants(root,'TITLE')[0]):null),version:prop(root,'VERSION'),studies,comparisons,studyCount:comparisons.reduce((s,c)=>s+c.outcomes.reduce((t,o)=>t+o.studies.length,0),0)};
  }

  function splitTable(text, delimiter){
    text=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    delimiter=delimiter||(text.split('\n')[0].includes('\t')?'\t':',');
    const rows=[];let row=[],cell='',quoted=false,closed=false;
    function endCell(){row.push(cell);cell='';closed=false;}
    function endRow(){endCell();if(row.some(v=>v.trim()))rows.push(row);row=[];}
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
      else if(c===delimiter)endCell();
      else if(c==='\n')endRow();
      else if(c==='"'&&!cell&&!closed)quoted=true;
      else if(c==='"'||closed)fail('Malformed CSV quoting near character '+i);
      else cell+=c;
    }
    if(quoted)fail('Malformed CSV: unclosed quote.');
    if(cell||row.length||closed)endRow();return rows;
  }
  const norm=s=>s.trim().toLowerCase().replace(/[_.-]/g,' ').replace(/\s+/g,' ');
  const aliases={
    study:['study','study or subgroup','study name','name'],studyId:['study id'],year:['year','study year','year of study'],
    comparison:['comparison','analysis group'],outcome:['outcome','analysis name'],outcomeId:['analysis number'],subgroup:['subgroup'],effectMeasure:['effect measure'],applicability:['applicability'],
    ai:['experimental events','experimental cases','events 1','ai','e1'],n1i:['experimental total','experimental n','total 1','n1i','n1'],
    ci:['control events','control cases','events 2','ci','e2'],n2i:['control total','control n','total 2','n2i','n2'],
    m1i:['experimental mean','mean 1','m1i','m1'],sd1i:['experimental sd','sd 1','sd1i','sd1'],
    m2i:['control mean','mean 2','m2i','m2'],sd2i:['control sd','sd 2','sd2i','sd2'],
    yi:['giv mean','effect estimate','estimate','est','yi'],sei:['giv se','se','sei','standard error']
  };
  function parseTable(text){
    const rows=splitTable(text);if(rows.length<2)fail('CSV needs headers and study rows.');
    const header=rows.shift(), map={};
    header.forEach((h,i)=>{for(const [key,names] of Object.entries(aliases))if(names.includes(norm(h))){if(map[key]!==undefined)fail('Ambiguous duplicate header: '+h);map[key]=i;}});
    // RevMan's copy-table order is experimental arm followed by control arm.
    // Recognise the COMPLETE repeated pattern only, never guess an isolated Mean/Total.
    const repeated=header.slice(1).map(norm);
    const binary=['events','total','events','total'],continuous=['mean','sd','total','mean','sd','total'];
    if(norm(header[0])==='study or subgroup'){
      const schema=continuous.every((v,i)=>repeated[i]===v)?'continuous':binary.every((v,i)=>repeated[i]===v)?'binary2x2':null;
      if(schema)fields[schema].forEach((f,i)=>map[f]=i+1);
    }
    if(map.study===undefined&&map.studyId===undefined)fail('Missing Study header in CSV.');
    const review={title:null,version:'CSV',studies:Object.create(null),comparisons:[],studyCount:0};
    rows.forEach((row,ri)=>{
      if(row.length!==header.length)fail('CSV row '+(ri+2)+' has '+row.length+' columns; expected '+header.length+'.');
      const get=k=>map[k]===undefined?'':row[map[k]].trim();
      const populated=list=>list.some(k=>get(k)!=='');
      const types=[populated(['ai','ci'])?'binary2x2':null,populated(['m1i','sd1i','m2i','sd2i'])?'continuous':null,populated(['yi','sei'])?'generic':null].filter(Boolean);
      if(types.length!==1)fail('Unsupported or ambiguous mixed data/header in CSV row '+(ri+2));
      if(get('applicability')&&!['SUBGROUP_AND_OVERALL','SUBGROUP_ONLY','OVERALL_ONLY'].includes(get('applicability')))fail('Unsupported applicability in row '+(ri+2));
      // Separate overall-only rows explicitly: never double-count combined and subgroup arms.
      const subgroup=get('subgroup')||'No subgroup';
      const groupName=get('applicability')==='OVERALL_ONLY'?'Overall only (combined arms)':subgroup;
      const schema=types[0], name=get('study')||get('studyId'), id=get('studyId')||name;
      for(const f of fields[schema]) if(map[f]===undefined) fail('Missing or unsupported CSV header for '+f+'.');
      const record={study:name,studyId:id,year:year(get('year')),effectMeasure:measure(get('effectMeasure'))};
      fields[schema].forEach(f=>record[f]=number(get(f),'row '+(ri+2)+' '+f));validateRecords([record],schema);
      const compName=get('comparison')||'Unspecified comparison',outName=get('outcome')||'Unspecified outcome',outId=get('outcomeId')||outName;
      let c=review.comparisons.find(c=>c.id===compName);if(!c)review.comparisons.push(c={id:compName,name:compName,outcomes:[]});
      let o=c.outcomes.find(o=>o.id===outId);
      const type=schema==='binary2x2'?'binary':schema;
      if(!o)c.outcomes.push(o={id:outId,name:outName,type,effectMeasure:record.effectMeasure,subgroups:[],studies:[],arm1Name:'Experimental',arm2Name:'Control'});
      if(o.type!==type||o.effectMeasure!==record.effectMeasure||o.name!==outName)fail('Mixed data types or effect measures in outcome '+outName);
      let g=o.subgroups.find(g=>g.name===groupName);if(!g)o.subgroups.push(g={id:groupName,name:groupName,studies:[]});
      const s={id,name,year:record.year,scale:record.effectMeasure,source:csvRows([header,row]),arms:[]};
      if(schema==='generic')s.precomputed={est:record.yi,se:record.sei};
      else if(schema==='binary2x2')s.arms=[{treatment:o.arm1Name,events:record.ai,n:record.n1i},{treatment:o.arm2Name,events:record.ci,n:record.n2i}];
      else s.arms=[{treatment:o.arm1Name,mean:record.m1i,sd:record.sd1i,n:record.n1i},{treatment:o.arm2Name,mean:record.m2i,sd:record.sd2i,n:record.n2i}];
      g.studies.push(s);o.studies.push(s);review.studies[id]={id,name,year:s.year};review.studyCount++;
    });
    review.comparisons.forEach(c=>c.outcomes.forEach(o=>o.subgroups.forEach(g=>validateRecords(g.studies.map(s=>rawRecord(s,o.type)),typeSchema[o.type]))));
    return review;
  }
  function parseText(text){
    if(typeof text!=='string'||!text.trim())fail('RevMan file is empty.');
    if(text.length>20*1024*1024)fail('RevMan file exceeds 20 MB limit.');
    return text.trimStart().startsWith('<')?_parseXmlString(text):parseTable(text);
  }
  function bytes(buffer){return ArrayBuffer.isView(buffer)?new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength):new Uint8Array(buffer);}
  function _isZip(buffer){const b=bytes(buffer);return b.length>=4&&b[0]===80&&b[1]===75&&b[2]===3&&b[3]===4;}
  async function parse(buffer,opts){
    if(typeof buffer==='string')return parseText(buffer);
    if(_isZip(buffer)){
      const Zip=(opts&&opts.jszip)||global.JSZip;if(!Zip)fail('File is zipped but JSZip is not loaded. Use an uncompressed .rm5 XML file.');
      const zip=await Zip.loadAsync(buffer),names=Object.keys(zip.files).filter(n=>!zip.files[n].dir&&/\.(rm5|rm6|xml)$/i.test(n));
      if(names.length!==1)fail('ZIP must contain exactly one review XML file; choose the file explicitly.');
      return parseText(await zip.file(names[0]).async('string'));
    }
    return parseText(new TextDecoder('utf-8',{fatal:true}).decode(bytes(buffer)));
  }
  function selected(review,choice){
    const at=(list,key)=>{
      const i=choice&&choice[key];if(!Number.isInteger(i)||i<0||!list||!list[i])fail('Choose a valid '+key+'.');return list[i];
    };
    const comparison=at(review&&review.comparisons,'comparison'),outcome=at(comparison.outcomes,'outcome'),subgroup=at(outcome.subgroups,'subgroup');
    return {comparison,outcome,subgroup};
  }
  function select(review,choice,schema,opts){
    const {comparison,outcome,subgroup}=selected(review,choice);
    if(outcome.type==='o_e_var')fail('O-E/variance rows require a separate conversion workflow; select a generic IV estimate/SE outcome.');
    if(typeSchema[outcome.type]!==schema)fail('This '+outcome.type+' outcome is not compatible with the app input schema '+schema+'.');
    const filename=(opts&&opts.filename)||'unnamed file';
    return validateRecords(subgroup.studies.map(s=>{
      const r=rawRecord(s,outcome.type);
      r.provenance={id:'revman:'+JSON.stringify([filename,comparison.id,outcome.id,subgroup.id,s.id]),label:s.name,studyId:s.id,year:s.year,
        reference:filename,source:{type:'RevMan file',detail:filename},location:'RevMan file '+filename+', comparison '+comparison.name+', outcome '+outcome.name,
        pastedText:s.source,choice:{comparison:comparison.name,outcome:outcome.name,subgroup:subgroup.name},measure:outcome.effectMeasure,
        values:fields[schema].map(f=>({field:f,value:r[f],text:String(r[f])})),conversions:[],flags:[],usedAs:schema,confirmed:false,imported:true,rulesVersion:'revman-1'};
      return r;
    }),schema);
  }
  function safeText(value){const s=String(value==null?'':value);if(/^[\s]*[=+@-]/.test(s)||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s))fail('Unsafe spreadsheet formula/control text: '+s.slice(0,40));return s;}
  function csvRows(rows){return rows.map(row=>row.map(v=>{const s=String(v==null?'':v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\r\n')+'\r\n';}
  const headers={binary2x2:['Experimental Events','Experimental Total','Control Events','Control Total'],continuous:['Experimental Mean','Experimental SD','Experimental Total','Control Mean','Control SD','Control Total'],generic:['Effect Estimate','SE']};
  const note='RevMan will recompute study effects from arm data, weights, pooled estimates, confidence intervals and heterogeneity using its chosen analysis settings. Generic estimates and SE are on the analysis scale (log scale for ratio measures). No pooled results or analysis settings are exported.';
  function exportCSV(records,schema,meta){
    validateRecords(records,schema);meta=meta||{};
    const head=['Comparison','Outcome','Subgroup','Study ID','Study','Year','Effect measure'].concat(headers[schema]);
    const rows=records.map(r=>[safeText(meta.comparison||'Unspecified comparison'),safeText(meta.outcome||'Unspecified outcome'),safeText(r.subgroup===undefined?(meta.subgroup||'No subgroup'):(r.subgroup||'No subgroup')),safeText(r.studyId||r.study),safeText(r.study),r.year==null?'':r.year,safeText(r.effectMeasure||meta.effectMeasure||'OTHER'),...fields[schema].map(f=>r[f])]);
    return {csv:csvRows([head,...rows]),note};
  }
  // Cochrane's study-centric CSV import requires three files; a wide analysis table
  // is not a substitute for Study results. Retain the documented unused columns.
  const resultColumns=['Study','Outcome','Data type','Effect measure','Arm','Reference arm','Sample size','Cases','Mean','SD','SE','Variance','CI level','CI start','CI end','Exp mean','Exp CI start','Exp CI end','t-test','z-test','P value','Covariance method','Covariance','Other arm 1','Other arm 2','Correlation arm 1','Correlation arm 2','Correlation','Other mean','Other SE','Other variance','Other CI level','Other CI start','Other CI end','Other exp mean','Other exp CI start','Other exp CI end','Other t-test','Other z-test','Other P value','Footnotes'];
  const effectLabels={OR:'log[Odds Ratio]',RR:'log[Risk Ratio]',HR:'log[Hazard Ratio]',MD:'Mean Difference',SMD:'Std. Mean Difference',RD:'Risk Difference'};
  function exportPackage(records,schema,meta){
    validateRecords(records,schema);meta=meta||{};
    for(const k of ['outcome','arm1','arm2'])if(typeof meta[k]!=='string'||!meta[k].trim())fail('Enter '+k+' exactly as configured in RevMan.');
    const outcome=safeText(meta.outcome.trim()),arm1=safeText(meta.arm1.trim()),arm2=safeText(meta.arm2.trim());
    if(arm1===arm2)fail('RevMan arm names must be distinct.');
    if(schema==='generic'&&!effectLabels[meta.effectMeasure])fail('Choose a supported effect measure for contrast-level export.');
    const information=[['Study','Year']],arms=[['Study','Arm','Description','Intervention']],results=[resultColumns];
    records.forEach(r=>{
      const id=safeText(r.studyId||r.study);safeText(r.study);
      information.push([id,r.year==null?'':r.year]);
      [arm1,arm2].forEach((arm,i)=>{
        arms.push([id,arm,'',arm]);
        const row={Study:id,Outcome:outcome,'Data type':schema==='generic'?'Contrast level':'Arm level','Effect measure':schema==='generic'?effectLabels[meta.effectMeasure]:'',Arm:arm};
        if(schema==='generic'){
          row['Reference arm']=i===1?'true':'false';
          if(i===0){row.Mean=r.yi;row.SE=r.sei;}
        }else{
          row['Sample size']=i===0?r.n1i:r.n2i;
          if(schema==='binary2x2')row.Cases=i===0?r.ai:r.ci;
          else{row.Mean=i===0?r.m1i:r.m2i;row.SD=i===0?r.sd1i:r.sd2i;}
        }
        results.push(resultColumns.map(k=>row[k]==null?'':row[k]));
      });
    });
    return {information:csvRows(information),arms:csvRows(arms),results:csvRows(results),note:'Import all three CSV files with study-centric data enabled and matching outcome/intervention names. Subgroups and analysis settings must be configured in RevMan. '+note};
  }
  function comparisonToBus(comparison) {
    if (!comparison || !Array.isArray(comparison.outcomes)) return null;
    // Prefer a non-empty outcome the bus can represent as arm-level counts
    // (DICH / CONTINUOUS). O-E/Variance outcomes are summary log-HR / Peto effects,
    // NOT 2x2 counts: the bus carries arm counts and ma-comparisons normalizeStudy
    // strips any precomputed sidecar, so emitting placeholder 0/1 arms for them
    // would silently feed a downstream meta-analysis garbage (0/1-vs-0/1). So skip
    // O-E outcomes here and, if that's all the comparison has, signal "unsupported"
    // so the caller can refuse the push with a clear message instead of corrupting.
    var firstOutcome = null, oeOnly = null;
    for (var i = 0; i < comparison.outcomes.length; i++) {
      var o = comparison.outcomes[i];
      if (!o.studies || o.studies.length === 0) continue;
      if ((o.type === "o_e_var" || o.type === "generic")) { if (!oeOnly) oeOnly = o; continue; }
      firstOutcome = o; break;
    }
    if (!firstOutcome) {
      if (oeOnly) return { _unsupported: oeOnly.type, name: oeOnly.name, effectMeasure: oeOnly.effectMeasure };
      return null;
    }

    // Binary or continuous: arm rows carry events/n or mean/sd directly.
    var studies = firstOutcome.studies.map(function (s) {
      return {
        id: s.id, year: s.year, arms: s.arms,
      };
    });
    if (!global.MaComparisons) {
      return {
        _schema: "ma-comparisons-v1",
        _savedAt: new Date().toISOString(),
        effectMeasure: firstOutcome.effectMeasure,
        studies: studies,
      };
    }
    // buildEnvelope drops studies whose rows are incomplete or impossible
    // (missing counts, events>n, sd<=0). Report how many so the importer can
    // tell the user instead of silently shipping fewer studies than they saw.
    var env = global.MaComparisons.buildEnvelope(studies, firstOutcome.effectMeasure);
    var dropped = studies.length - (env.studies ? env.studies.length : 0);
    if (dropped > 0) env._dropped = dropped;
    return env;
  }

  const api={parse,parseText,parseTable,select,selected,exportCSV,exportPackage,resultColumns,fields,validateRecords,splitTable,csvRows,safeText,note,comparisonToBus,_parseXmlString,_isZip};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  global.RevmanReader=api;
})(typeof window!=='undefined'?window:globalThis);
