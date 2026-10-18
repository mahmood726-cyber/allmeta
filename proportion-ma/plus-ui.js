(function () {
  'use strict';
  const C = AlmPropPlusCore, el = id => document.getElementById(id);
  const labels = {k:'Studies',mu:'Pooled value on analysis scale',se:'Standard error on analysis scale',tau2:'Between-study variance on analysis scale',estimate:'Pooled proportion',ciLo:'95% confidence interval: lower',ciHi:'95% confidence interval: upper',piLo:'95% prediction interval: lower',piHi:'95% prediction interval: upper'};
  const originalKeys = ['k','mu_re','seRE','tau2','poolP','poolLo','poolHi','poolPiLo','poolPiHi'];
  let state = null, revision = 0, running = false;
  const signature = () => JSON.stringify(['src','trans','tau-est'].map(id=>el(id).value));
  function clear() { revision++; state=null; el('plus-result').replaceChildren(); el('plus-provenance').textContent=''; el('plus-parity').textContent=''; el('plus-export').disabled=true; el('plus-status').textContent='Run the GLMM for the current inputs.'; }
  function render(result, original, source, inputSignature=signature(), rows=C.parse(el('src').value)) {
    C.validateResult(result);
    state = {result:structuredClone(result),original:structuredClone(original),source,inputSignature,rows:structuredClone(rows),validation:AlmPropPlusParity.assess(rows)};
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const text of ['Quantity','Existing transformed-scale result','Binomial-normal GLMM (logit scale)']) { const th=document.createElement('th'); th.textContent=text; head.append(th); }
    const body=table.createTBody();
    const entries=Object.entries(C.flat(result));
    for (const [key,value] of entries) {
      const row=body.insertRow(); row.dataset.key=key;
      row.insertCell().textContent=labels[key] || key;
      const i=C.fields.indexOf(key);
      row.insertCell().textContent=i>=0 && original ? C.format(original[originalKeys[i]]) : '—';
      row.insertCell().textContent=C.format(value);
    }
    el('plus-result').replaceChildren(table);
    el('plus-provenance').textContent=source;
    el('plus-parity').textContent=AlmPropPlusParity.label(state.validation);
    el('plus-status').textContent=result.status==='ok'?'GLMM fit available.':'GLMM refused: '+result.reason;
    el('plus-export').disabled=false;
  }
  function snapshot() {
    if (!state || state.inputSignature!==signature()) throw new Error('Run the GLMM for the current inputs first');
    return structuredClone(state);
  }
  function exported() {
    const s=snapshot();
    return JSON.stringify({method:'Binomial-normal GLMM',source:s.source,inputs:s.rows,result:s.result,validation:s.validation},null,2);
  }
  function display() {
    return Object.fromEntries([...el('plus-result').querySelectorAll('tbody tr')].map(r=>[r.dataset.key,r.cells[2]?.textContent]));
  }
  function labelsOK(result) {
    const keys=Object.keys(C.flat(result));
    const rows=[...el('plus-result').querySelectorAll('tbody tr')];
    return JSON.stringify([...el('plus-result').querySelectorAll('th')].map(e=>e.textContent))===JSON.stringify(['Quantity','Existing transformed-scale result','Binomial-normal GLMM (logit scale)']) && rows.length===keys.length && rows.every((r,i)=>r.dataset.key===keys[i] && r.cells.length===3 && r.cells[0].textContent===(labels[keys[i]]||keys[i]));
  }
  function audit() {
    const s=snapshot(), flat=C.flat(s.result), shown=display();
    const originalOK=[...el('plus-result').querySelectorAll('tbody tr')].every(row=>{const i=C.fields.indexOf(row.dataset.key);return row.cells[1].textContent===(i>=0 && s.original ? C.format(s.original[originalKeys[i]]) : '—');});
    if (JSON.stringify(s.validation)!==JSON.stringify(AlmPropPlusParity.assess(s.rows)) || el('plus-parity').textContent!==AlmPropPlusParity.label(s.validation) || !originalOK || !labelsOK(s.result) || Object.keys(flat).some(k=>shown[k]!==C.format(flat[k])) || el('plus-provenance').textContent!==s.source || el('plus-status').textContent!==(s.result.status==='ok'?'GLMM fit available.':'GLMM refused: '+s.result.reason)) throw new Error('GLMM display differs from the result');
    return s;
  }
  async function run() {
    if(running) return;
    clear(); running=true; el('plus-run').disabled=true;
    const token=revision, sig=signature();
    try {
      const rows=C.parse(el('src').value);
      window.__almPropValidation.run();
      const original=window.__almPropValidation.snapshot()?.values || null;
      const r=await AlmWebR.runR({packages:['metafor','lme4'],script:C.buildScript(rows),onStatus:s=>{if(token===revision)el('plus-status').textContent=s;}});
      if (token!==revision || sig!==signature()) { clear(); return; }
      if (!r.ok) throw new Error(r.error);
      render(C.decode(r.stdout),original,'Live R: '+Object.entries(r.versions).map(([k,v])=>k+' '+v).join('; '),sig);
    } catch(e) { if(token===revision) {state=null;el('plus-status').textContent='GLMM unavailable: '+e.message;} }
    finally {running=false;el('plus-run').disabled=false;}
  }
  el('plus-run').onclick=run;
  for(const id of ['src','trans','tau-est']) for(const event of ['input','change']) el(id).addEventListener(event,clear);
  // Original run/example/undo/bus actions may update inputs programmatically.
  new MutationObserver(()=>{if(state && state.inputSignature!==signature())clear();}).observe(el('res-body'),{childList:true,subtree:true});
  el('plus-export').onclick=()=>{
    try {audit();const blob=new Blob([exported()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='proportion-glmm.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
    catch(e){el('plus-status').textContent=e.message;}
  };
  window.AlmPropPlus={run,render,snapshot,exported,display,labelsOK,audit,signature,
    save:()=>({state:structuredClone(state),html:el('plus-result').innerHTML,status:el('plus-status').textContent,source:el('plus-provenance').textContent,parity:el('plus-parity').textContent,disabled:el('plus-export').disabled}),
    restore:s=>{if(s.state && s.state.inputSignature!==signature()){clear();return;}state=s.state;el('plus-result').innerHTML=s.html;el('plus-status').textContent=s.status;el('plus-provenance').textContent=s.source;el('plus-parity').textContent=s.parity;el('plus-export').disabled=s.disabled;}};
})();
