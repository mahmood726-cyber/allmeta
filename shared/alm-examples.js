/* Published example inputs. Statistical fits stay in the original app engines. */
(function (global) {
  'use strict';
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  function validateDataset(d) {
    if (!d || typeof d !== 'object') throw Error('Invalid example dataset');
    for (const key of ['source_package', 'version', 'dataset', 'citation', 'licence']) {
      if (typeof d[key] !== 'string' || !d[key].trim()) throw Error('Missing example ' + key);
    }
    if (!Array.isArray(d.values) || !d.values.length || d.values.some(r=>!r || typeof r!=='object' || Array.isArray(r))) throw Error('Invalid example values');
    return d;
  }
  const columns = {
    Baker2009: ['study','year','id','treatment','exac','total'],
    'dat.bcg': ['trial','author','year','tpos','tneg','cpos','cneg','ablat','alloc'],
    'dat.konstantopoulos2011': ['district','school','study','year','yi','vi'],
    'dat.molloy2014': ['authors','year','ni','ri','controls','design','a_measure','c_measure','meanage','quality'],
    'AuditC': ['TP','FN','FP','TN'],
    'smokingcessation': ['event1','n1','event2','n2','event3','n3','treat1','treat2','treat3']
  };
  const datasets = {
    'dta-sroc':'AuditC', nma:'smokingcessation', heterogeneity:'dat.bcg', 'pubbias-tests':'dat.bcg',
    'multilevel-ma':'dat.konstantopoulos2011', 'meta-regression':'dat.bcg', 'proportion-ma':'dat.bcg',
    'mh-peto':'dat.bcg', influence:'dat.bcg', 'limit-ma':'dat.bcg', gosh:'dat.bcg', 'cumulative-subgroup':'dat.bcg',
    'rve-meta':'dat.konstantopoulos2011', 'nma-inconsistency':'smokingcessation', 'correlation-ma':'dat.molloy2014',
    'component-nma':'Baker2009'
  };
  function number(x, field) { if (!finite(x)) throw Error('Nonfinite field ' + field); return x; }
  function count(x, field) { if (!Number.isInteger(x) || x<0) throw Error('Invalid count ' + field); return x; }
  function label(x) { if (typeof x !== 'string' || !x.trim() || /[,\r\n|]/.test(x)) throw Error('Invalid label field'); return x; }
  function project(app, data) {
    const d = validateDataset(data);
    if (datasets[app] !== d.dataset) throw Error('Dataset is not registered for this app');
    const required = columns[d.dataset];
    d.values.forEach(r=>required.forEach(key=>{ if (!Object.hasOwn(r,key)) throw Error('Missing source column ' + key); }));
    const rows=[], lines=[], excluded=[];
    if(d.dataset==='Baker2009') {
      const groups=new Map();
      d.values.forEach((r,i)=>{
        label(r.study);label(r.treatment);number(r.id,'id');number(r.year,'year');count(r.exac,'exac');count(r.total,'total');
        if(r.total<=0 || r.exac>r.total) throw Error('Invalid network count denominator');
        if(!groups.has(r.id)) groups.set(r.id,[]);
        groups.get(r.id).push({...r,row:i+1});
      });
      for(const arms of groups.values()) {
        if(new Set(arms.map(a=>a.treatment)).size!==arms.length || new Set(arms.map(a=>a.study)).size!==1) throw Error('Inconsistent study fields');
        if(arms.length!==2) {excluded.push(...arms.map(a=>a.row));continue;}
        const [a,b]=arms, cc=[a.exac,a.total-a.exac,b.exac,b.total-b.exac].includes(0)?.5:0;
        const ai=a.exac+cc,bi=a.total-a.exac+cc,ci=b.exac+cc,di=b.total-b.exac+cc;
        const yi=Math.log((ai/bi)/(ci/di)),vi=1/ai+1/bi+1/ci+1/di,se=Math.sqrt(vi);
        // The original component parser lowercases every ingredient name.
        const A=a.treatment==='Placebo'?'control':a.treatment.toLowerCase(), B=b.treatment==='Placebo'?'control':b.treatment.toLowerCase();
        rows.push({row:a.row,arm_rows:arms.map(x=>x.row),study:a.study,A,B,yi,vi,se,correction:cc});
        lines.push([A,B,yi,se].join(' | '));
      }
      return {rows,excluded,text:lines.join('\n')};
    }
    for (const [index,r] of d.values.entries()) {
      const row = index+1;
      if (d.dataset === 'dat.bcg') {
        ['tpos','tneg','cpos','cneg'].forEach(k=>count(r[k],k));
        number(r.year,'year'); number(r.ablat,'ablat'); number(r.trial,'trial'); label(r.alloc);
        const study=label(r.author)+' '+r.year+' [trial '+r.trial+']';
        const nt=r.tpos+r.tneg, nc=r.cpos+r.cneg;
        if (!(r.tpos>0 && r.cpos>0 && nt>0 && nc>0)) throw Error('BCG risk ratio needs positive event counts');
        const yi=Math.log((r.tpos/nt)/(r.cpos/nc)), vi=1/r.tpos-1/nt+1/r.cpos-1/nc, se=Math.sqrt(vi);
        if(app==='proportion-ma') { rows.push({row,study,x:r.cpos,n:nc}); lines.push([r.cpos,nc,study].join(', ')); }
        else if(app==='mh-peto') { rows.push({row,study,e1:r.tpos,n1:nt,e2:r.cpos,n2:nc}); lines.push([study,r.tpos,nt,r.cpos,nc].join(', ')); }
        else {
          rows.push({row,study,yi,vi,se,year:r.year,moderator:r.ablat,group:r.alloc});
          if(app==='meta-regression') lines.push([study,yi,se,r.ablat].join(', '));
          else if(app==='cumulative-subgroup') lines.push([study,yi,se,r.year,r.alloc].join(', '));
          else if(app==='heterogeneity' || app==='pubbias-tests') lines.push([study,yi,se].join(', '));
          else lines.push([yi,se,study].join(', '));
        }
      } else if(d.dataset==='dat.konstantopoulos2011') {
        for (const k of required) number(r[k],k);
        if(r.vi<=0) throw Error('Variance must be positive');
        rows.push({row,cluster:r.district,study:r.study,yi:r.yi,vi:r.vi,se:Math.sqrt(r.vi)});
        lines.push((app==='rve-meta' ? [r.district,r.yi,r.vi] : [r.district,r.yi,Math.sqrt(r.vi),'school '+r.school+' [study '+r.study+']']).join(', '));
      } else if(d.dataset==='dat.molloy2014') {
        const study=label(r.authors)+' '+number(r.year,'year');
        number(r.ri,'ri'); count(r.ni,'ni');
        if(Math.abs(r.ri)>=1 || r.ni<=3) throw Error('Invalid correlation or sample size');
        rows.push({row,study,r:r.ri,n:r.ni}); lines.push([study,r.ri,r.ni].join(', '));
      } else if(d.dataset==='AuditC') {
        required.forEach(k=>count(r[k],k));
        if(r.TP+r.FN<=0 || r.FP+r.TN<=0) throw Error('Empty diagnostic denominator');
        rows.push({row,...r}); lines.push(['AuditC row '+row,r.TP,r.FP,r.FN,r.TN].join(', '));
      } else {
        // Validate all arms before excluding whole multi-arm studies.
        const arms=[];
        for(let j=1;j<=3;j++) {
          if(j===3 && r.treat3==='') {
            if(r.event3!==null || r.n3!==null) throw Error('Incomplete absent-arm fields');
            continue;
          }
          const t=label(r['treat'+j]), e=count(r['event'+j],'event'+j), n=count(r['n'+j],'n'+j);
          if(n<=0 || e>n) throw Error('Invalid network count denominator');
          arms.push({t,e,n});
        }
        if(arms.length!==2) { excluded.push(row); continue; }
        const [a,b]=arms, cc=[a.e,a.n-a.e,b.e,b.n-b.e].includes(0)?0.5:0;
        const ai=a.e+cc, bi=a.n-a.e+cc, ci=b.e+cc, di=b.n-b.e+cc;
        const yi=Math.log((ai/bi)/(ci/di)), vi=1/ai+1/bi+1/ci+1/di, se=Math.sqrt(vi);
        const A=app==='component-nma'&&a.t==='A'?'control':a.t, B=app==='component-nma'&&b.t==='A'?'control':b.t;
        const study='package_row_'+row;
        rows.push({row,study,A,B,yi,vi,se,correction:cc});
        if(app==='nma') lines.push([study,B,A,yi,se].join(', ')); // app is t2 minus t1
        else if(app==='component-nma') lines.push([A,B,yi,se].join(' | '));
        else lines.push([A,B,yi,se,study].join(', '));
      }
    }
    if(rows.length<2) throw Error('Not enough source rows for this example');
    if(app==='rve-meta') lines.unshift('cluster,yi,vi');
    return {rows,excluded,text:lines.join('\n')};
  }

  // Display precision is an exact formatting check, not a substitute for the
  // original full-precision app/R tolerance exported by each live adapter.
  function checkDisplay(display, values) {
    const map=new Map(values.map(v=>[v.key,v.value]));
    if(!display.length) throw Error('Missing display evidence');
    for(const d of display) {
      const v=map.get(d.key), expected=finite(v)?Number((v*d.scale).toFixed(d.digits)):NaN;
      if(!finite(d.value) || d.value!==expected) throw Error('Displayed result mismatch: '+d.key);
    }
  }
  const specifications={
    'dta-sroc':{input:'#f-data', options:{'f-method':'reml','f-cc':'all','f-cov':''}, display:[{card:'Summary Se (',key:'sens',digits:3}]},
    nma:{input:'#f-data',options:{'f-model':'fe','f-ci':'classic','f-scale':'log','f-dir':'undesirable'},display:[{selector:'#ref-host tbody tr:first-child td:nth-child(2)',key:'TE_1',digits:3}]},
    heterogeneity:{input:'#f-data',options:{'f-tau2':'pm'},display:[{card:'RE pooled (z)',key:'mu',digits:3}]},
    'pubbias-tests':{input:'#src',options:{format:'te-se'},display:[{selector:'#body tr:first-child td:nth-child(2)',key:'egger_lm_statistic',digits:3}]},
    'multilevel-ma':{input:'#src',display:[{selector:'#summary table:nth-of-type(2) tr:first-child td:nth-child(2)',key:'mu',digits:3}]},
    'meta-regression':{input:'#f-data',options:{'f-modlabel':'Absolute latitude (degrees)','f-effectlabel':'Log risk ratio','f-title':'BCG: latitude meta-regression'},display:[{card:'β₁ (slope)',key:'slope',digits:4}]},
    'proportion-ma':{input:'#src',options:{trans:'logit','tau-est':'PM'},display:[{selector:'#res-body .pooled-row td:nth-child(3)',key:'poolP',digits:1,scale:100}]},
    'mh-peto':{input:'#src',options:{measure:'OR'},display:[{selector:'#pooled-body tr:first-child td:nth-child(2)',key:'mh_est',digits:3}]},
    influence:{input:'#src',display:[{selector:'#model-body tr:nth-child(2) td:first-of-type',key:'full.mu',digits:4}]},
    'limit-ma':{input:'#src',display:[{selector:'#body tr:nth-child(3) td:nth-child(2)',key:'limit_est',digits:3}]},
    gosh:{input:'#src',options:{model:'FE'},display:[{selector:'#m-est',key:'median_est',digits:3}]},
    'cumulative-subgroup':{input:'#f-data',options:{'f-view':'cumulative'},display:[{card:'Final pooled',key:'export.mu_final',digits:3}]},
    'rve-meta':{input:'#src',options:{'f-rho':'0.8','f-names':'','f-centre':false},display:[{selector:'#coef-body tr:first-child td:first-of-type',key:'coef.0.estimate',digits:3}]},
    'nma-inconsistency':{input:'#src',options:{'f-model':'FE'},display:[{selector:'#dbt code:first-of-type',key:'dbt.Q',digits:2}]},
    'correlation-ma':{input:'#f-data',options:{'f-method':'REML'},display:[{selector:'#headline strong',key:'r',digits:3}]},
    'component-nma':{input:'#src',display:[{selector:'#comp-body tr:first-child td:nth-child(2)',key:'component.fluticasone.est',digits:3}]}
  };
  function addDisplay(app, entries) { specifications[app].display.push(...entries); }
  const card=(name,key,digits,index=0,scale=1)=>({card:name,key,digits,index,scale});
  const cell=(selector,key,digits,index=0,scale=1)=>({selector,key,digits,index,scale});
  addDisplay('dta-sroc',[card('Summary Se (','sensLo',3,1),card('Summary Se (','sensHi',3,2),
    card('Summary Sp (','spec',3),card('Summary Sp (','specLo',3,1),card('Summary Sp (','specHi',3,2),
    cell('#stats-wrap table.coef tr:first-child td:first-of-type','tauSe',4),cell('#stats-wrap table.coef tr:nth-child(2) td:first-of-type','tauFpr',4)]);
  addDisplay('nma',[cell('#ref-host tbody tr:first-child td:nth-child(2)','lower_1',3,1),
    cell('#ref-host tbody tr:first-child td:nth-child(2)','upper_1',3,2),card('I²','I2',1,0,100),cell('#het-host tr:first-child td','tau2',4)]);
  addDisplay('heterogeneity',[card('RE pooled (z)','ci_lb',3,1),card('RE pooled (z)','ci_ub',3,2),
    card('τ² used','tau2',4),card('I² (Q-based)','I2',1)]);
  addDisplay('pubbias-tests',[{rows:'#body tr',method:'Trim-and-fill',column:'td:nth-child(4)',key:'trimfill_est',digits:3}]);
  addDisplay('multilevel-ma',[cell('#summary table:nth-of-type(2) tr:nth-child(2) td:nth-child(2)','ciLo',3),
    cell('#summary table:nth-of-type(2) tr:nth-child(2) td:nth-child(2)','ciHi',3,1),
    cell('#summary table:nth-of-type(2) tr:nth-child(3) td:nth-child(2)','sigma2Between',4),
    cell('#summary table:nth-of-type(2) tr:nth-child(4) td:nth-child(2)','sigma2Within',4)]);
  const mom=(row,key,digits,index=0,scale=1)=>cell('#summary table:first-of-type tr:nth-child('+row+') td:nth-child(2)','mom.'+key,digits,index,scale);
  addDisplay('multilevel-ma',[mom(1,'mu',3),mom(2,'ci_lb_z',3),mom(2,'ci_ub_z',3,1),mom(3,'ci_lb_hk',3),mom(3,'ci_ub_hk',3,1),
    mom(5,'tau2_study',4),mom(6,'tau2_within',4),mom(5,'I2_study',1,1,100),mom(6,'I2_within',1,1,100),mom(7,'I2_sampling',1,0,100)]);
  addDisplay('meta-regression',[card('β₁ (slope)','slope_ci_lb',4,1),card('β₁ (slope)','slope_ci_ub',4,2),
    card('β₀ (intercept)','intercept',3),card('β₀ (intercept)','intercept_ci_lb',3,1),card('β₀ (intercept)','intercept_ci_ub',3,2),card('τ² (PM)','tau2_pm',4)]);
  addDisplay('proportion-ma',[cell('#res-body .pooled-row td:nth-child(4)','poolLo',1,0,100),
    cell('#res-body .pooled-row td:nth-child(4)','poolHi',1,1,100),cell('#het code:nth-of-type(1)','tau2',4),cell('#het code:nth-of-type(3)','i2',1)]);
  addDisplay('mh-peto',[cell('#pooled-body tr:first-child td:nth-child(3)','mh_lo',3),cell('#pooled-body tr:first-child td:nth-child(3)','mh_hi',3,1),cell('#het-body tr:first-child td:nth-child(4)','mh_I2',1)]);
  addDisplay('influence',[cell('#model-body tr:nth-child(4) td:first-of-type','full.ciLo',4),cell('#model-body tr:nth-child(5) td:first-of-type','full.ciHi',4),
    cell('#model-body tr:nth-child(8) td:first-of-type','full.tau2',4),cell('#model-body tr:nth-child(9) td:first-of-type','full.I2',1)]);
  addDisplay('limit-ma',[cell('#body tr:nth-child(3) td:nth-child(4)','limit_ci_lo',3),cell('#body tr:nth-child(3) td:nth-child(4)','limit_ci_hi',3,1)]);
  addDisplay('gosh',[cell('#m-i2','median_i2',1)]);
  addDisplay('cumulative-subgroup',[card('Final pooled','export.lo_final',3,1),card('Final pooled','export.hi_final',3,2),card('Final τ²','export.tau2_final',4)]);
  addDisplay('rve-meta',[cell('#coef-body tr:first-child td:nth-of-type(5)','coef.0.ci_lo',3),
    cell('#coef-body tr:first-child td:nth-of-type(5)','coef.0.ci_hi',3,1),cell('#meta-row .summary-line code:first-of-type','tau2',4)]);
  addDisplay('correlation-ma',[cell('#headline','r_lo',3,2),cell('#headline','r_hi',3,3),
    cell('#headline','tau2_z',4,4),cell('#headline','I2',1,5,100)]);
  addDisplay('component-nma',[cell('#comp-body tr:first-child td:nth-child(4)','component.fluticasone.ci_lo',3),cell('#comp-body tr:first-child td:nth-child(4)','component.fluticasone.ci_hi',3,1)]);
  function readNumber(text,index=0) {
    const matches=text.match(/[−-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/gi);
    if(!matches || !matches[index]) throw Error('Displayed result is not numeric at position '+index);
    const value=Number(matches[index].replace('−','-'));
    if(!finite(value)) throw Error('Displayed result is not finite');
    return value;
  }
  let active=null, selected=null;
  function displayElement(document, d) {
    let el;
    if(d.rows) {
      const rows=Array.from(document.querySelectorAll(d.rows)).filter(row=>row.querySelector('td:first-child code')?.textContent.trim()===d.method);
      if(rows.length>1) throw Error('Ambiguous displayed result method: '+d.method);
      el=rows[0]?.querySelector(d.column);
    }
    else if(d.selector) el=document.querySelector(d.selector);
    else el=Array.from(document.querySelectorAll('#stats-wrap .stat')).find(e=>e.querySelector('.k')?.textContent.trim().startsWith(d.card))?.querySelector('.v');
    if(!el) throw Error('Displayed result element missing: '+(d.method||d.selector||d.card));
    return el;
  }
  const element=d=>displayElement(document,d);
  function displayElements() { if(!active) throw Error('No example app registered'); return active.spec.display.map(element); }
  function readDisplay() {
    return active.spec.display.map(d=>{
      const text=element(d).textContent.trim();
      return {key:d.key,text,value:readNumber(text,d.index||0),digits:d.digits,scale:d.scale||1};
    });
  }
  function adapter() {
    const special=active.spec.adapter;
    const found=special?special():global.AlmLiveAdapters?.[active.app] || global.AlmValidate?.adapters?.[active.app]?.live;
    if(!found?.currentState || !found?.buildScript || !found?.appValues) throw Error('Live R adapter unavailable: '+active.app);
    return found;
  }
  function fingerprint() {
    return JSON.stringify(Array.from(document.querySelectorAll('input,textarea,select')).filter(e=>!e.closest('#alm-real-example-panel,#alm-validate,#alm-plus,#alm-features')).map(e=>[e.id,e.value,e.checked]));
  }
  function capture() {
    if(!selected) throw Error('Load a real example first');
    if(fingerprint()!==selected.fingerprint) throw Error('Example inputs changed; load the example again');
    const display=readDisplay(); // Read BEFORE legacy adapters that rerun the page.
    const a=adapter(), state=a.currentState(), values=a.appValues(state);
    const comparison=structuredClone(a.compare);
    // These legacy adapters omit some already-reported primary summary fields.
    // Read those fields from the original page's result, without fitting a model.
    if(active.app==='influence') {
      const result=global._almLastInfluence();
      for(const key of ['ciLo','ciHi','I2']) values.push({key:'full.'+key,label:key,value:result[key]});
    }
    if(active.app==='mh-peto') values.push({key:'mh_I2',label:'I²',value:global._almLastMhPeto().mh_I2});
    if(active.app==='multilevel-ma') {
      const result=global._almLastMlma();
      for(const key of ['mu','ci_lb_z','ci_ub_z','ci_lb_hk','ci_ub_hk','tau2_study','tau2_within','I2_study','I2_within','I2_sampling']) {
        const name='mom.'+key;values.push({key:name,label:key,value:result[key]});
        comparison.kind[name]='rel';comparison.tolerance[name]=key.startsWith('I2_')?1e-9:1e-6;
      }
    }
    if(!Array.isArray(values) || !values.length || values.some(v=>v.value===undefined || (typeof v.value==='number'&&!finite(v.value)))) throw Error('Invalid app result evidence');
    checkDisplay(display,values);
    if(JSON.stringify(display)!==JSON.stringify(readDisplay())) throw Error('Displayed result changed while capturing');
    return {app:active.app,dataset:selected.data.dataset,source_package:selected.data.source_package,version:selected.data.version,
      source_blob:selected.data.source_blob,citation:selected.data.citation,input:document.querySelector(active.spec.input).value,
      projection:selected.projection,options:active.spec.options||{},packages:a.packages,script:a.buildScript(state),
      compare:comparison,appValues:values,display};
  }
  function mountPanel(document,panel) {
    const features=document.getElementById('alm-features');
    if(features) {
      if(features.closest('main, #results, #stats-wrap, .plot-container, .chart-download-bar'))
        throw Error('Example features host must be outside app results');
      features.insertAdjacentElement('afterend',panel);
    } else {
      const host=document.createElement('div');host.id='alm-features';
      document.body.append(host,panel);
    }
  }
  function register(app, extension) {
    if(!specifications[app]) throw Error('Unknown example app '+app);
    if(active) throw Error('Example app already registered');
    active={app,spec:Object.assign({},specifications[app],extension||{})};
    if(typeof document==='undefined') return;
    const mount=()=>{
      const spec=active.spec, panel=document.createElement('section');
      panel.id='alm-real-example-panel'; panel.style.cssText='margin:1rem auto;padding:1rem;max-width:72rem;border:1px solid #aaa;border-radius:6px';
      const heading=document.createElement('h2');heading.id='alm-real-example-title';heading.textContent='Real example';
      panel.setAttribute('aria-labelledby',heading.id);
      const labelEl=document.createElement('label');labelEl.textContent='Published dataset: ';
      const select=document.createElement('select');select.id='alm-real-example-choice';
      const option=document.createElement('option');option.value=datasets[app];option.textContent=datasets[app];select.append(option);labelEl.append(select);
      const button=document.createElement('button');button.id='alm-real-example-load';button.type='button';button.textContent='Load real example';button.style.marginLeft='0.5rem';
      const status=document.createElement('p');status.id='alm-real-example-status';status.setAttribute('role','status');
      const citation=document.createElement('p');citation.id='alm-real-example-citation';
      panel.append(heading,labelEl,button,status,citation);
      // Append beside the shared feature host after the original content, so
      // neither results text nor pinned plot positions include this new UI.
      mountPanel(document,panel);
      button.addEventListener('click',async()=>{
        button.disabled=true;selected=null;status.dataset.state='loading';status.textContent='Loading published dataset…';citation.textContent='';
        try {
          const response=await fetch('../validation/examples/'+app+'/'+select.value+'.json',{cache:'no-store'});
          if(!response.ok) throw Error('Example download failed: '+response.status);
          const data=validateDataset(await response.json()), projection=project(app,data);
          if(spec.prepare) await spec.prepare();
          const input=document.querySelector(spec.input); if(!input) throw Error('App input unavailable');
          for(const [id,value] of Object.entries(spec.options||{})) {
            const el=document.getElementById(id);if(!el) throw Error('App option unavailable: '+id);
            if(typeof value==='boolean') el.checked=value; else { el.value=value; if(el.value!==value) throw Error('Unsupported option '+id+': '+value); }
          }
          input.value=projection.text;input.dispatchEvent(new Event('input',{bubbles:true}));
          const run=document.getElementById('btn-run');if(run) run.click();
          if(app==='nma') {
            const reference=document.getElementById('f-ref');reference.value='A';
            if(reference.value!=='A') throw Error('Source reference treatment A unavailable');
            run.click();
          }
          // Allow the page's own synchronous render and observation callbacks to finish.
          await new Promise(resolve=>setTimeout(resolve,0));
          selected={data,projection,fingerprint:fingerprint()};
          capture();
          citation.textContent=data.citation+' Source: '+data.source_package+' '+data.version+', '+data.dataset+'. '+data.licence+' '+data.notes+
            (projection.excluded.length?' Excluded whole multi-arm package rows: '+projection.excluded.join(', ')+'.':'');
          const link=document.createElement('a');link.href=data.source_documentation;link.textContent=' Package documentation';citation.append(link);
          status.dataset.state='ready';status.textContent='Loaded '+projection.rows.length+' source rows. Analysis updated.';
        } catch(e) {selected=null;status.dataset.state='error';status.textContent=e.message;}
        finally {button.disabled=false;}
      });
    };
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
  }
  const api={validateDataset,project,checkDisplay,readNumber,register,capture,displayElements,displayElement,mountPanel,specifications};
  global.AlmExamples=api;
  if(typeof module!=='undefined') module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
