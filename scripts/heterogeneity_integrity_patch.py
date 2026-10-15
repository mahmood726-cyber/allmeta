"""Temporary branch-only patch materialiser; remove after verified source commit."""
from pathlib import Path
import hashlib

p=Path('heterogeneity/index.html'); b=p.read_bytes()
assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='34a25983b301cd06dcaa6be765b0d7b3f67bd95a'
s=b.decode('utf-8')
def rep(old,new,count=1):
    global s
    assert s.count(old)==count,(old[:100],s.count(old))
    s=s.replace(old,new)
def between(a,z,new):
    global s
    assert s.count(a)==1,a
    i=s.index(a);j=s.index(z,i+len(a));s=s[:i]+new+s[j:]

between('    function parseStudies(text) {','    function weightedSums(',r'''    function parseStudies(text) {
      const studies=[], warnings=[];
      let first=true;
      const lines=String(text||"").split(/\r?\n/);
      for (let i=0;i<lines.length;i++) {
        const raw=lines[i].trim();
        if (!raw || raw.startsWith("#")) continue;
        const parts=raw.split(/\s*[,\t]\s*/);
        const ys=(parts[parts.length-2]||"").trim(), ss=(parts[parts.length-1]||"").trim();
        const header=first && parts.length>=3 && /^(yi|est|effect|estimate)$/i.test(ys) && /^(se|sei|standard[ _-]?error)$/i.test(ss);
        first=false;
        if (header) continue;
        const est=Number(ys),se=Number(ss),v=se*se;
        if (parts.length<3 || !ys || !ss || !Number.isFinite(est) || !Number.isFinite(se)) {
          warnings.push("Line "+(i+1)+": need label and complete finite estimate/SE values"); continue;
        }
        if (!(se>0 && Number.isFinite(v) && v>0 && Number.isFinite(1/v) && Number.isFinite(est/v))) {
          warnings.push("Line "+(i+1)+": positive, numerically representable SE required"); continue;
        }
        const label=parts.slice(0,-2).join(", ") || ("Study "+(studies.length+1));
        studies.push({label,est,se,v});
      }
      if (warnings.length) warnings.unshift("Analysis blocked: correct all study rows; no partial dataset was pooled.");
      return {studies:warnings.length?[]:studies,warnings};
    }

''')
rep('      const I2 = df > 0 ? Math.max(0, 100*(Q0 - df)/Q0) : 0;', '''      // Q-based I2 is the historical output convention; retain it explicitly.
      const I2 = df > 0 && Q0 > df ? 100*(Q0-df)/Q0 : 0;
      const fixed=weightedSums(studies,0);
      const typical=df>0 ? df/(fixed.sw-fixed.sw2/fixed.sw) : NaN;
      const I2Model=df>0 && tau2>0 ? 100*tau2/(tau2+typical) : 0;''')
rep('        Q:Q0, df, pQ, I2, tau2','        Q:Q0, df, pQ, I2, I2Model, vTypical:typical, tau2')
rep('      let tCrit = Z975; // z for k>=30','      let tCrit = Z975; // Single-study fallback; otherwise use the exact t quantile.')
rep('      parts.push(statCard("I²", fmt(sum.I2, 1) + "%" +\n        (qpci ? " [" + fmt(qpci.I2Lo, 1) + ", " + fmt(qpci.I2Hi, 1) + "]" : "")));', '''      parts.push(statCard("I² (Q-based)",fmt(sum.I2,1)+"%"));
      parts.push(statCard("I² (model-based)",fmt(sum.I2Model,1)+"%"+
        (qpci ? " ["+fmt(qpci.I2Lo,1)+", "+fmt(qpci.I2Hi,1)+"] (Q-profile)" : "")));''')
# Preserve numerical contracts for the z CI, floored HK CI, and model-SE prediction interval.
rep('      parts.push(statCard("RE pooled (HKSJ + t)",', '      parts.push(statCard("RE pooled (modified HK + t)",')
rep('      parts.push(statCard("95% PI",', '      parts.push(statCard("95% PI (model SE + t)",')
rep('      // Prediction interval (k ≥ 2). Uses t_{k-1} per Cochrane Handbook v6.5; the older IntHout-2016 t_{k-2} is\n      // superseded and gives a PI that is too wide — ~3x at k=3 (t_1=12.7 vs t_2=4.3).', '      // Prediction interval uses unadjusted model SE and t_(k-1), matching\n      // predict(rma(...,test="t")). This is an approximation, not a universally exact convention.')
rep('      const info = renderStats(parsed.studies, state.tau2);\n      _lastInfo = info; _lastStudies = parsed.studies;', '''      _lastInfo=null; _lastStudies=[];
      let info=null;
      try {
        info=renderStats(parsed.studies,state.tau2);
        if (info && ![info.sum.mu,info.sum.se,info.sum.ciLo,info.sum.ciHi,info.sum.seHKSJ,
            info.sum.ciLoHKSJ,info.sum.ciHiHKSJ,info.sum.Q,info.sum.I2,info.sum.I2Model,
            info.tau2,info.pi.lo,info.pi.hi].every(Number.isFinite)) throw new Error('Non-finite numerical result');
      } catch (error) {
        parsed.studies=[];info=null;
        statsWrap.innerHTML="";looTable.innerHTML="";
        extras.push("Analysis blocked: "+(error.message||String(error)));
      }
      _lastInfo=info;_lastStudies=parsed.studies;''')
# Failed imports are visible, clear any fitted result, and preserve the prior state in Undo.
rep('    function loadSaved() {', '''    window.__almRejectImport=function(message) {
      document.getElementById('f-data').value='';
      render();
      renderWarnings([String(message), 'No analysis retained. Use Undo to recover the previous input.']);
    };

    function loadSaved() {''')
between('    window.__almLoad = function (rows) {','    // Return the last pooled result',r'''    window.__almLoad = function (rows) {
      if (window.alm && window.alm.resetUndo) window.alm.resetUndo.snapshot();
      try {
        if (!Array.isArray(rows) || !rows.length) throw new Error('CSV has no study rows');
        const number=v=>typeof v==='number'?v:(typeof v==='string' && v.trim()!==''?Number(v):NaN);
        const lines=rows.map(function(r,i) {
          if (!r || typeof r!=='object' || r.study==null || !String(r.study).trim() || /[\r\n\t]/.test(String(r.study)))
            throw new Error('CSV row '+(i+1)+': a single-line study label is required');
          const yi=number(r.yi),vi=number(r.vi);
          if (!Number.isFinite(yi) || !Number.isFinite(vi) || vi<=0 || !Number.isFinite(1/vi) || !Number.isFinite(yi/vi))
            throw new Error('CSV row '+(i+1)+': finite yi and positive, representable vi are required');
          return String(r.study)+', '+String(yi)+', '+String(Math.sqrt(vi));
        });
        const ta=document.getElementById('f-data');ta.value=lines.join('\n');
        ta.dispatchEvent(new Event('input',{bubbles:true}));
      } catch(error) { window.__almRejectImport('CSV rejected: '+(error.message||String(error))); }
    };

''')
rep('''      onParse: function (result) {
        window.alm.resetUndo.snapshot();  // snapshot BEFORE loading new data
        window.__almLoad(result.rows);
      },''', '''      onParse: function (result) {
        const headers=result.headers||[];
        const exact=['study','yi','vi'].every(n=>headers.filter(h=>h===n).length===1);
        if (!exact || new Set(headers).size!==headers.length || (result.warnings||[]).length) {
          window.alm.resetUndo.snapshot();
          window.__almRejectImport('CSV rejected: use unique, exact study/yi/vi headers and valid numeric fields. '+(result.warnings||[]).join('; '));
          return;
        }
        window.__almLoad(result.rows);
      },''')
rep("      var out = { _schema: 'heterogeneity-results-v1', k: studies.length };", '''      var out = { _schema: 'heterogeneity-results-v1', k: studies.length,
        I2_definition:'Q-based; retained for backwards compatibility',
        I2_model_definition:'100*tau2/(tau2+v_typical)',
        I2_ci_definition:'Model-based I2 obtained by transforming Q-profile tau2 limits',
        normal_interval_test:'z', modified_HK_test:'adhoc', prediction_interval_test:'t',
        prediction_interval_SE:'unadjusted model SE',
        studies:studies.map(function(x){return Object.assign({},x);}) };''')
rep('        out.I2 = s.I2;', '        out.I2 = s.I2;\n        out.I2_Q=s.I2;out.I2_model=s.I2Model;out.se_modified_hk=s.seHKSJ;')
# Actual x/y axes. Unspecified bounds retain automatic values; manual crop is explicit.
rep('''      function x(v) { return L + v/xMax * plotW; }
      function y(v) { return T + plotH - v/yMax * plotH; }''', '''      const axis=window.__almAxis||{};
      function limits(key,automaticMax) {
        const a=Array.isArray(axis[key])?axis[key]:[null,null];
        const lo=Number.isFinite(a[0])?a[0]:0;
        const hi=Number.isFinite(a[1])?a[1]:Math.max(automaticMax,lo+Math.max(1,Math.abs(lo)*0.1));
        return lo>=0 && hi>lo ? [lo,hi] : [0,automaticMax];
      }
      const [xMin,xHi]=limits('x',xMax),[yMin,yHi]=limits('y',yMax);
      xMax=xHi;yMax=yHi;
      const visible=p=>p.x>=xMin && p.x<=xMax && p.y>=yMin && p.y<=yMax;
      const cropped=points.filter(p=>!visible(p)).length;
      const cropNote=document.getElementById('baujat-range-note');
      if (cropNote) cropNote.textContent=cropped ? cropped+' study point(s) outside the selected axis range. The analysis and exports still include every study.' : '';
      function x(v) { return L+(v-xMin)/(xMax-xMin)*plotW; }
      function y(v) { return T+plotH-(v-yMin)/(yMax-yMin)*plotH; }''')
rep('const xTicks = niceTicks(0, xMax, 5);','const xTicks = niceTicks(xMin, xMax, 5);')
rep('const yTicks = niceTicks(0, yMax, 5);','const yTicks = niceTicks(yMin, yMax, 5);')
rep('        const p = points[i], px = x(p.x), py = y(p.y), w = 7.2 * String(p.label).length;', '        const p = points[i]; if (!visible(p)) continue;\n        const px = x(p.x), py = y(p.y), w = 7.2 * String(p.label).length;')
rep('      points.forEach((p, i) => {', '      points.forEach((p, i) => {\n        if (!visible(p)) return;')
# Accessible chart title and description identify the actual model and any crop.
rep('      parts.push("<rect x=\\"0\\" y=\\"0\\" width=\\""+W+"\\" height=\\""+H+"\\" fill=\\"#fff\\"/>");', '''      parts[parts.length-1]=parts[parts.length-1].replace('<svg ', '<svg role="img" aria-labelledby="baujat-title baujat-description" ');
      parts.push('<title id="baujat-title">Baujat plot for '+studies.length+' studies</title>');
      parts.push('<desc id="baujat-description">Squared Pearson residuals at fitted tau squared on the horizontal axis; influence from leave-one-out refits on the vertical axis. '+
        escapeXml('Estimator '+(info&&info.estimator?info.estimator:'specified')+'. '+cropped+' points outside the selected view; all studies retained in analysis.')+'</desc>');
      parts.push("<rect x=\\"0\\" y=\\"0\\" width=\\""+W+"\\" height=\\""+H+"\\" fill=\\"#fff\\"/>");''')
rep('      <div id="svg-host"></div>', '      <div id="svg-host"></div>\n      <p id="baujat-range-note" class="hint" role="status" aria-live="polite"></p>')
rep('      svgHost.innerHTML = svg;','      svgHost.innerHTML = svg;\n      if (!info) document.getElementById("baujat-range-note").textContent="";')
a=s.index('    window.alm.axisControls({');z=s.index('    window.alm.resultsExport({',a)
s=s[:a]+'''    window.alm.axisControls({
      target:'#alm-axis-mount',
      axes:[{key:'x',label:'Baujat X',range:[null,null],log:false},
            {key:'y',label:'Baujat Y',range:[null,null],log:false}],
      onChange:function(state) {
        const invalid=['x','y'].some(key=>(state[key]||[]).some(v=>v!=null && (!Number.isFinite(v)||v<0)));
        const error=document.querySelector('#alm-axis-mount [data-error]');
        if (invalid) { if(error)error.textContent='Baujat axis limits must be finite and nonnegative.'; return; }
        window.__almAxis=state;
        const ta=document.getElementById('f-data');if(ta)ta.dispatchEvent(new Event('input',{bubbles:true}));
      }
    });
    document.querySelectorAll('#alm-axis-mount [data-edge="log"]').forEach(function(el){
      el.disabled=true;el.title='Baujat diagnostics can be zero; logarithmic axes are not supported';
    });

'''+s[z:]
rep('          <span class="hint">Lines starting with <code>#</code> or blanks are ignored.</span>', '          <span class="hint">Blank/comment lines and one recognised estimate/SE header are ignored. Every study row must be valid; malformed rows block pooling. Uploaded CSV requires exact <code>study,yi,vi</code> headers.</span>')
rep('      <div id="stats-wrap"></div>', '''      <p id="het-method-note" class="hint">The normal CI uses <code>test="z"</code>; the modified Hartung–Knapp CI uses a variance floor of 1 (<code>test="adhoc"</code>). The prediction interval uses the unadjusted model SE and t<sub>k−1</sub> (<code>test="t"</code>). These are distinct approximations. Q-based I² and model-based I² are labelled separately; Q-profile intervals refer to model-based I².</p>
      <div id="stats-wrap"></div>''')
rep('  </style>', '''    #alm-axis-mount .alm-axis-row { grid-template-columns: auto auto minmax(3rem,1fr) auto minmax(3rem,1fr) auto; }
    #alm-axis-mount .alm-axis input[type=number] { width:100%; min-width:3rem; }
    @media (max-width:600px) { #alm-axis-mount .alm-axis-row>label:first-child { grid-column:1/-1; } }
  </style>''')
p.write_text(s,encoding='utf-8')

# Warning content includes untrusted file text: never interpret it as HTML.
c=Path('hub/shared/csv-upload.js');raw=c.read_bytes()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()=='50714946704c8a6ec10c29e9f1d2e326785a0adf'
x=raw.decode('utf-8');old="      warnEl.innerHTML = result.warnings.map(w => '<div>' + String.fromCharCode(8226) + ' ' + w + '</div>').join('');"
assert x.count(old)==1
x=x.replace(old,"      warnEl.textContent = result.warnings.map(w => String.fromCharCode(8226) + ' ' + w).join('\\n');\n      warnEl.style.whiteSpace = 'pre-wrap';")
c.write_text(x,encoding='utf-8')
print('Patched Heterogeneity and safe shared CSV warning rendering; no statistical estimator changes.')
