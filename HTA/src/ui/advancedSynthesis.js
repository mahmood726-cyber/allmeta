/* Actual-data input, result and plot contracts for HTA's persistent synthesis panels.
 * No statistical estimator is implemented or replaced in this UI adapter.
 */
(function (root) {
    'use strict';
    const S = root.HTASynthesisPlots;
    const $ = id => document.getElementById(id);
    const clone = value => JSON.parse(JSON.stringify(value));
    const fmt = value => Number.isFinite(value) ? value.toFixed(4) : 'Not estimable';
    const text = (id, value) => { if ($(id)) $(id).textContent = String(value); };
    function save(content, name, type) {
        const url = URL.createObjectURL(new Blob([content], {type}));
        const a = document.createElement('a'); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function csvCell(value) {
        let s = String(value ?? '');
        if (typeof value === 'string' && /^[=+@-]/.test(s)) s = "'" + s;
        return '"' + s.replaceAll('"', '""') + '"';
    }
    // RFC-4180 quoted fields, including escaped quotes and embedded newlines.
    function parseCSV(source) {
        const rows = []; let row = [], cell = '', quoted = false, afterQuote = false;
        source = source.replace(/^\uFEFF/, '');
        for (let i = 0; i <= source.length; i++) {
            const c = i === source.length ? '\n' : source[i];
            if (quoted) {
                if (c === '"') {
                    if (source[i + 1] === '"') { cell += '"'; i++; }
                    else { quoted = false; afterQuote = true; }
                } else { if (i === source.length) throw new Error('Unclosed CSV quote'); cell += c; }
            } else if (c === ',' || c === '\n' || c === '\r') {
                row.push(cell.trim()); cell = ''; afterQuote = false;
                if (c !== ',') { if (row.some(v => v !== '')) rows.push(row); row = []; if (c === '\r' && source[i + 1] === '\n') i++; }
            } else if (c === '"') {
                if (cell.trim() || afterQuote) throw new Error('Malformed CSV quotation'); quoted = true;
            } else {
                if (afterQuote && c.trim()) throw new Error('Unexpected text after CSV quote'); cell += c;
            }
        }
        if (rows.length < 2) throw new Error('CSV needs a header and data rows');
        const headers = rows.shift();
        if (new Set(headers).size !== headers.length || headers.some(h => !h || ['__proto__','constructor','prototype'].includes(h))) throw new Error('Invalid or duplicate CSV headers');
        return rows.map((r, i) => { if (r.length !== headers.length) throw new Error(`CSV row ${i + 2} has the wrong number of columns`); return Object.fromEntries(headers.map((h, j) => [h, r[j]])); });
    }
    function number(value, field, row) {
        if (value == null || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(Number(value))) throw new Error(`Row ${row}: ${field} must be finite and nonblank`);
        return Number(value);
    }
    function name(value, row) {
        if (typeof value !== 'string' || !value.trim()) throw new Error(`Row ${row}: a study name is required`);
        return value.trim();
    }
    function canonical(rows, kind, outcome) {
        if (!Array.isArray(rows) || rows.length < 2 || rows.length > 500) throw new Error('Import 2–500 rows of study-level summaries');
        const seen = new Set(), groups = new Map();
        const data = rows.map((r, i) => {
            if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error(`Row ${i+1}: expected an object`);
            const study = name(r.study ?? r.label, i+1);
            if (kind === 'ma') {
                if (seen.has(study)) throw new Error(`Duplicate study ${study}: dependent effects require a multilevel method`);
                seen.add(study);
                const effect = number(r.effect ?? r.yi, 'effect', i+1), se = number(r.se ?? r.sei, 'se', i+1);
                if (se <= 0) throw new Error(`Row ${i+1}: se must be positive`);
                const result = {study, label: study, effect, se};
                if (r.year != null && String(r.year).trim()) result.year = number(r.year, 'year', i+1);
                return result;
            }
            const treatment = name(r.treatment, i+1), n = number(r.n, 'n', i+1);
            if (!Number.isInteger(n) || n < 2) throw new Error(`Row ${i+1}: n must be an integer of at least two`);
            const key = JSON.stringify([study,treatment]);
            if (seen.has(key)) throw new Error(`Duplicate ${study}/${treatment} arm`); seen.add(key);
            groups.set(study, (groups.get(study) || 0) + 1);
            if (outcome === 'binary') {
                const events = number(r.events, 'events', i+1);
                if (!Number.isInteger(events) || events < 0 || events > n) throw new Error(`Row ${i+1}: events must be an integer between zero and n`);
                return {study,treatment,n,events};
            }
            if (outcome !== 'continuous') throw new Error('Time-to-event NMA is not supported by this arm-level input route');
            const mean = number(r.mean,'mean',i+1), sd = number(r.sd,'sd',i+1);
            if (sd <= 0) throw new Error(`Row ${i+1}: sd must be positive`);
            return {study,treatment,n,mean,sd};
        });
        if (kind === 'nma' && (groups.size < 2 || [...groups.values()].some(n => n !== 2))) throw new Error('This HTA route requires at least two independent two-arm studies; multi-arm covariance is not validated here');
        return data;
    }
    function mount(id) {
        let target = $(id);
        if (!target) throw new Error('Missing chart target: ' + id);
        if (target.tagName === 'CANVAS') {
            root.Chart?.getChart(target)?.destroy();
            const replacement = document.createElement('div'); replacement.id = id; target.replaceWith(replacement); target = replacement;
        }
        target.parentElement.style.height = 'auto'; target.parentElement.style.minWidth = '0';
        target.replaceChildren(); return target;
    }
    function tableRows(id, rows) {
        const target = $(id); if (!target) return; target.replaceChildren();
        for (const row of rows) { const tr = S.element('tr',null,target); row.forEach(v => S.element('td',v,tr)); }
    }
    class HTAAdvancedSynthesis {
        constructor(app) {
            this.app = app; this.data = {ma:null,nma:null}; this.fit = {ma:null,nma:null,pb:null}; this.revision = {ma:0,nma:0};
            this.frame = null; this.setup();
        }
        status(kind, message, error = false) {
            const id = 'hta-' + kind + '-status'; let el = $(id);
            if (!el) { el = S.element('p'); el.id = id; $('section-' + (kind === 'ma' ? 'meta-methods' : kind === 'pb' ? 'pub-bias' : 'nma')).querySelector('.content-body').prepend(el); }
            el.setAttribute('role',error?'alert':'status'); el.dataset.state = error?'error':'info'; el.textContent = message;
        }
        invalidate(kind, message) {
            this.fit[kind] = null;
            const panel = $(kind === 'pb' ? 'pub-bias-results' : kind + '-results');
            if (panel) { panel.style.display = 'none'; panel.querySelectorAll('svg, [data-synthesis-export]').forEach(el => el.remove()); }
            if (kind === 'ma') this.invalidate('pb','Run the assessment after fitting the current pairwise data.');
            if (message) this.status(kind,message);
        }
        setup() {
            const style = S.element('style',null,document.head);
            style.textContent = '.hta-synthesis-panel{min-width:0}.hta-synthesis-panel .card,.hta-synthesis-panel .chart-container{min-width:0}.hta-synthesis-panel [data-synthesis-export]{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.hta-synthesis-panel .data-table{display:block;overflow-x:auto} @media(max-width:800px){.hta-synthesis-panel [style*="grid-template-columns"]{grid-template-columns:minmax(0,1fr)!important}.hta-synthesis-panel .content-header{flex-wrap:wrap}}';
            for (const section of ['meta-methods','nma','pub-bias']) $('section-'+section)?.classList.add('hta-synthesis-panel');
            const restrict = (id, allowed, fallback) => {
                const select = $(id); if (!select) return;
                for (const option of select.options) if (!allowed.includes(option.value)) { option.disabled = true; option.textContent += ' — unavailable in this panel'; }
                if (!allowed.includes(select.value)) select.value = fallback;
            };
            restrict('ma-hksj',['false'],'false'); restrict('ma-small-study',['none'],'none');
            restrict('ma-pub-bias',['none'],'none');
            restrict('nma-model',['fixed'],'fixed'); restrict('nma-method',['frequentist'],'frequentist');
            restrict('nma-outcome',['binary','continuous'],'binary');
            const binary = $('nma-outcome')?.querySelector('option[value="binary"]'); if (binary) binary.textContent = 'Binary (log odds ratio)';
            const continuous = $('nma-outcome')?.querySelector('option[value="continuous"]'); if (continuous) continuous.textContent = 'Continuous (standardized mean difference)';
            for (const id of ['nma-iterations','nma-burnin','nma-seed']) if ($(id)) $(id).disabled = true;
            const selection = document.querySelector('.pub-bias-test[value="selection"]'); if (selection) { selection.checked = false; selection.disabled = true; selection.title = 'Selection-model estimation is not connected in this panel'; }
            this.status('ma','Import CSV/JSON: study,effect,se[,year]. Ratio measures require log effects and log-scale SEs. This panel fits random effects with normal intervals; HKSJ and small-study corrections are unavailable. Publication-bias tests are in the separate assessment panel.');
            this.status('nma','Import arm-level CSV/JSON: study,treatment,n,events (binary), or study,treatment,n,mean,sd (continuous). This panel supports fixed-effect frequentist, independent two-arm networks only; no Bayesian or random-effects substitution is performed.');
            this.status('pb','Uses the current imported pairwise data. Selection models are unavailable here. No graphic is shown before an assessment is run.');
            for (const kind of ['ma','nma']) {
                $('btn-import-'+kind+'-data').addEventListener('click',()=>$ (kind+'-file-input').click());
                $(kind+'-file-input').addEventListener('change',e=>this.importFile(kind,e.target.files[0]));
                const ids = kind === 'ma' ? ['ma-tau-method','ma-effect-measure','ma-ci-level','ma-pred-int','ma-hksj','ma-i2-ci','ma-small-study','ma-pub-bias'] : ['nma-model','nma-method','nma-outcome','nma-reference'];
                for (const id of ids) $(id)?.addEventListener('change',()=>this.invalidate(kind,'Settings changed. Run again; previous-data plots and downloads have been cleared.'));
            }
            for (const el of document.querySelectorAll('.pub-bias-test')) el.addEventListener('change',()=>this.invalidate('pb','Assessment choices changed. Run again.'));
            document.addEventListener('click',e=>{if(e.target.closest('.tab,[data-section]'))this.schedulePaint();});
            window.addEventListener('resize',()=>this.schedulePaint());
        }
        async importFile(kind,file) {
            if (!file) return;
            const revision = ++this.revision[kind]; this.data[kind] = null; this.invalidate(kind,'Reading input…');
            try {
                if (file.size > 1024*1024) throw new Error('Import files must be smaller than 1 MB');
                const source = await file.text(); if (revision !== this.revision[kind]) return;
                const parsed = file.name.toLowerCase().endsWith('.json') ? JSON.parse(source) : parseCSV(source);
                const rows = Array.isArray(parsed) ? parsed : parsed.studies;
                const data = canonical(rows,kind,$('nma-outcome').value); this.data[kind] = data;
                if (kind === 'nma') {
                    const select = $('nma-reference'); select.replaceChildren(new Option('Auto (most connected)','auto'));
                    [...new Set(data.map(r=>r.treatment))].sort().forEach(t=>select.add(new Option(t,t)));
                }
                this.status(kind,`Imported ${data.length} validated rows from ${file.name}. Choose settings and run. No analysis has been fitted yet.`);
            } catch (error) { if (revision === this.revision[kind]) this.status(kind,error.message,true); }
        }
        maSettings() {
            if ($('ma-hksj').value !== 'false' || $('ma-small-study').value !== 'none') throw new Error('HKSJ/small-study corrections are not implemented in this HTA panel; no normal result is substituted');
            const level = Number($('ma-ci-level').value), method = $('ma-tau-method').value;
            if (![.9,.95,.99].includes(level) || !['REML','DL','PM','EB'].includes(method)) throw new Error('Unsupported confidence level or estimator');
            return {method,ciLevel:level,alpha:1-level,predictionInterval:$('ma-pred-int').value==='true',useHKSJ:false,autoHKSJ:false,effectMeasure:$('ma-effect-measure').value,interval:'normal',showI2CI:$('ma-i2-ci').value==='true'};
        }
        async runMA() {
            this.invalidate('ma'); this.app.showLoading('Fitting imported pairwise studies…');
            try {
                const data = canonical(this.data.ma,'ma'), options = this.maSettings();
                const engine = new MetaAnalysisMethods(options), result = engine.calculatePooledEffect(data);
                if (![result.random.effect,result.random.se,result.random.ci_lower,result.random.ci_upper,...result.weights.random].every(Number.isFinite)) throw new Error('The selected fit returned non-finite values');
                const z = engine.normalQuantile(1-options.alpha/2), dated = data.every(s=>Number.isFinite(s.year));
                const cumulative = engine.cumulativeMetaAnalysis(data.map((s,i)=>({...s,year:dated?s.year:i+1})),'year');
                const loo = engine.leaveOneOut(data), influence = engine.influenceDiagnostics(data);
                this.fit.ma = {data:clone(data),options:clone(options),result:clone(result),dated,cumulative:clone(cumulative),loo:clone(loo),influence:clone(influence),rows:data.map((s,i)=>({name:s.study,effect:s.effect,lo:s.effect-z*s.se,hi:s.effect+z*s.se,weight:result.weights.random[i]}))};
                $('ma-results').style.display='block'; this.paintMA();
                this.status('ma',`Fitted ${data.length} studies: random effects (${options.method}), ${options.ciLevel*100}% normal intervals; ${['OR','RR','HR'].includes(options.effectMeasure)?'log '+options.effectMeasure:options.effectMeasure} input scale. ${dated?'Cumulative fits use year order.':'Cumulative fits use input order because year is missing.'} HKSJ is not applied.`);
            } catch(error) { this.invalidate('ma'); this.status('ma',error.message,true); }
            finally { this.app.hideLoading(); }
        }
        exports(kind, container, payload, csv) {
            container.querySelectorAll('[data-synthesis-export]').forEach(el=>el.remove());
            const group = S.element('div',null,container); group.dataset.synthesisExport=kind;
            const add = (label,action) => { const b = S.element('button',label,group);b.type='button';b.className='btn btn-secondary';b.addEventListener('click',action); };
            add('Download fitted '+kind+' JSON',()=>save(JSON.stringify(payload,null,2),'hta-advanced-'+kind+'.json','application/json'));
            if(csv) add('Download fitted '+kind+' CSV',()=>save(csv.map(r=>r.map(csvCell).join(',')).join('\r\n'),'hta-advanced-'+kind+'.csv','text/csv;charset=utf-8'));
        }
        paintMA() {
            const v=this.fit.ma;if(!v)return;const {result:r,options:o}=v, h=r.heterogeneity, level=o.ciLevel*100;
            text('ma-pooled-effect',fmt(r.random.effect));text('ma-pooled-ci',`${level}% normal CI [${fmt(r.random.ci_lower)}, ${fmt(r.random.ci_upper)}]`);
            text('ma-fixed-effect',fmt(r.fixed.effect));text('ma-i2',fmt(h.I2)+'%');text('ma-tau2',fmt(h.tauSquared));
            text('ma-pred-interval',h.predictionInterval?`[${fmt(h.predictionInterval.lower)}, ${fmt(h.predictionInterval.upper)}] (${h.predictionInterval.method})`:'Not requested');
            if($('high-i2-warning'))$('high-i2-warning').style.display=h.I2>75?'block':'none';
            S.forest(mount('ma-forest-chart'),'hta-advanced-ma-forest',`Forest plot (${level}% normal intervals)`,v.rows,{name:'Pooled random effects',effect:r.random.effect,lo:r.random.ci_lower,hi:r.random.ci_upper},`Effect (${o.effectMeasure} input scale); ${level}% normal intervals`);
            S.forest(mount('ma-cumulative-chart'),'hta-advanced-ma-cumulative',`Cumulative meta-analysis (${level}% normal intervals)`,v.cumulative.results.map(x=>({name:`${x.nStudies}: ${x.lastStudy}`,effect:x.effect,lo:x.ci_lower,hi:x.ci_upper})),null,`${level}% normal intervals; input analysis scale`);
            tableRows('ma-heterogeneity-body', [['Q',fmt(h.Q),'—',fmt(h.pValueQ),'df = '+h.df],['I²',fmt(h.I2)+'%',o.showI2CI?`[${fmt(h.I2_lower)}, ${fmt(h.I2_upper)}]`:'Not requested','—','Descriptive heterogeneity'],['τ²',fmt(h.tauSquared),'—','—',o.method]]);
            tableRows('ma-loo-body',v.loo.results?v.loo.results.map(x=>[x.studyLabel,fmt(x.effect),`[${fmt(x.ci_lower)}, ${fmt(x.ci_upper)}]`,fmt(x.I2)+'%',fmt(x.change)]):[[v.loo.error]]);
            tableRows('ma-influence-body',v.influence.diagnostics?v.influence.diagnostics.map(x=>[x.study,fmt(x.cooksD),fmt(x.dffits),fmt(x.dfbetas),fmt(x.hatValue),x.isInfluential?'Flagged by engine':'Not flagged']):[[v.influence.error || 'Influence diagnostics not available']]);
            this.exports('ma',$('ma-results'),v,[['study','effect','se','weight_random_percent','lower','upper','method','confidence','interval','effect_measure'],...v.data.map((s,i)=>[s.study,s.effect,s.se,r.weights.random[i],v.rows[i].lo,v.rows[i].hi,o.method,o.ciLevel,o.interval,o.effectMeasure]),['Pooled',r.random.effect,r.random.se,100,r.random.ci_lower,r.random.ci_upper,o.method,o.ciLevel,o.interval,o.effectMeasure]]);
        }
        async runNMA() {
            this.invalidate('nma');this.app.showLoading('Fitting imported network…');
            try {
                if($('nma-model').value!=='fixed'||$('nma-method').value!=='frequentist')throw new Error('Only fixed-effect frequentist NMA is supported by this HTA route; no model substitution is made');
                const outcome=$('nma-outcome').value,data=canonical(this.data.nma,'nma',outcome),reference=$('nma-reference').value;
                const options={method:'frequentist',model:'fixed',referenceArm:reference==='auto'?null:reference};
                if(options.referenceArm&&!data.some(s=>s.treatment===options.referenceArm))throw new Error('Reference treatment is not in the imported data');
                const engine=new NetworkMetaAnalysis(options);engine.setData(data,outcome);
                if(!engine.network.isConnected)throw new Error('The imported network is disconnected. Select a connected network; no combined fit is shown.');
                const result=await engine.run();
                if(!result.effects.length||!result.effects.every(r=>[r.mean,r.se,r.ci_lower,r.ci_upper].every(Number.isFinite)))throw new Error('The network fit did not return finite contrasts');
                const scores=engine.calculatePScores(), funnel=engine.generateFunnelPlot();
                this.fit.nma={data:clone(data),outcome,options:clone(options),result:clone(result),network:clone(engine.network),scores:clone(scores),funnel:clone(funnel)};
                $('nma-results').style.display='block';this.paintNMA();
                this.status('nma',`Fixed-effect frequentist NMA; reference ${result.reference}. ${outcome==='binary'?'Effects are log ORs for reference / named treatment.':'Effects are standardized mean differences (named treatment minus reference), not mean differences.'} P-scores summarize larger fitted contrasts, not rank probabilities or clinical superiority. Multi-arm designs and random/Bayesian models remain unavailable in this panel.`);
            }catch(error){this.invalidate('nma');this.status('nma',error.message,true);}
            finally{this.app.hideLoading();}
        }
        paintNMA() {
            const v=this.fit.nma;if(!v)return;const r=v.result,nodes=v.network.nodes;
            const svg=S.figure(mount('nma-network-chart'),'hta-advanced-network','Observed treatment network',360),width=svg.viewBox.baseVal.width;
            const positions=new Map(nodes.map((n,i)=>[n.id,{x:width/2+width*.23*Math.cos(i*2*Math.PI/nodes.length),y:165+100*Math.sin(i*2*Math.PI/nodes.length)}]));
            for(const e of v.network.edges){const a=positions.get(e.treatment1),b=positions.get(e.treatment2);S.mark(svg,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#64748b','stroke-width':Math.max(1,Math.sqrt(e.nStudies)*3),'data-first':e.treatment1,'data-second':e.treatment2});}
            for(const n of nodes){const p=positions.get(n.id);S.mark(svg,'circle',{cx:p.x,cy:p.y,r:12,fill:'#176b87','data-treatment':n.id});S.mark(svg,'text',{x:p.x,y:p.y+28,'text-anchor':'middle',fill:'#172033','font-size':11},n.id.slice(0,18));}
            text('nma-n-treatments',nodes.length);text('nma-n-studies',new Set(v.data.map(d=>d.study)).size);text('nma-n-comparisons',v.network.edges.length);text('nma-connected','Yes');
            S.forest(mount('nma-forest-chart'),'hta-advanced-nma-forest','Fixed-effect fitted contrasts (95% CI)',r.effects.map(e=>({name:e.treatment,effect:e.mean,lo:e.ci_lower,hi:e.ci_upper})),null,v.outcome==='binary'?'log OR: reference / named treatment':'SMD: named treatment minus reference');
            const rank=S.figure(mount('nma-ranking-chart'),'hta-advanced-nma-pscore','Frequentist P-scores',80+v.scores.length*30),w=rank.viewBox.baseVal.width,left=w<500?115:210,span=w-left-45;
            v.scores.forEach((s,i)=>{S.mark(rank,'text',{x:8,y:28+i*30,fill:'#172033','font-size':11},s.treatment.slice(0,w<500?15:28));S.mark(rank,'rect',{x:left,y:15+i*30,width:s.pScore/100*span,height:15,fill:'#176b87','data-treatment':s.treatment,'data-pscore':s.pScore});S.mark(rank,'text',{x:w-40,y:28+i*30,fill:'#172033','font-size':11},s.pScore.toFixed(1));});
            tableRows('nma-sucra-body',v.scores.map((s,i)=>[i+1,s.treatment,'Not computed',fmt(s.pScore),'Not computed']));
            S.funnel(mount('nma-funnel-chart'),'hta-advanced-nma-funnel','Comparison-adjusted funnel',v.funnel.data.map(d=>({name:d.study,effect:d.adjustedEffect,se:d.se})),0);
            const league=$('nma-league-table');league.replaceChildren();
            S.table(league,['Named treatment','Fitted effect relative to reference','95% lower','95% upper'],r.effects.map(e=>[e.treatment,fmt(e.mean),fmt(e.ci_lower),fmt(e.ci_upper)]));
            S.element('p','All-pairs league and consistency inferences are not exposed by this repaired panel; use a separately validated method. The table above lists fitted reference contrasts.',league);
            tableRows('nma-consistency-body',[['Not assessed by this plot repair; no consistency conclusion is inferred from visible plots.']]);
            for(const id of ['nma-i2','nma-tau2','nma-q','nma-q-pvalue'])text(id,'Not reported by this fixed-effect view');
            this.exports('nma',$('nma-results'),v,[['treatment','reference','effect','se','lower','upper','model','method','scale'],...r.effects.map(e=>[e.treatment,r.reference,e.mean,e.se,e.ci_lower,e.ci_upper,'fixed','frequentist',v.outcome==='binary'?'logOR_reference_over_treatment':'SMD_treatment_minus_reference'])]);
        }
        async runPB() {
            this.invalidate('pb');this.app.showLoading('Calculating publication-bias diagnostics…');
            try {
                const data=canonical(this.data.ma,'ma'),options=this.maSettings();if(data.length<3)throw new Error('At least three studies are required; small-study tests are unreliable with very few studies');
                const selected=[...document.querySelectorAll('.pub-bias-test:checked')].map(e=>e.value);
                if(selected.includes('selection'))throw new Error('Selection models are unavailable in this panel');
                const ma=new MetaAnalysisMethods(options),result=ma.calculatePooledEffect(data);
                this.fit.pb={data:clone(data),options,result:clone(result),selected,egger:selected.includes('egger')?ma.eggerTest(data):null,begg:selected.includes('begg')?ma.beggTest(data):null,trimFill:selected.includes('trim-fill')?ma.trimAndFill(data):null};
                $('pub-bias-results').style.display='block';this.paintPB();this.status('pb','Plots use the imported studies. Asymmetry is not specific to publication bias; a non-significant test does not establish its absence. Trim-and-fill uses the engine’s fixed-effect adjustment, not the primary random-effects estimate.');
            }catch(error){this.invalidate('pb');this.status('pb',error.message,true);}finally{this.app.hideLoading();}
        }
        paintPB() {
            const v=this.fit.pb;if(!v)return;const observed=v.data.map(s=>({name:s.study,effect:s.effect,se:s.se}));
            S.funnel(mount('pub-bias-funnel-chart'),'hta-advanced-pb-funnel','Observed-study funnel',observed,v.result.random.effect);
            const tf=v.trimFill,container=mount('trim-fill-chart');
            if(tf?.adjusted)S.funnel(container,'hta-advanced-trimfill','Trim-and-fill funnel',observed,tf.adjusted.effect,tf.imputedStudies||[]);
            else S.element('p',tf?.error||'Trim-and-fill was not selected.',container);
            text('pub-bias-summary',`Selected: ${v.selected.join(', ')||'funnel only'}. All diagnostics use the current imported pairwise dataset.`);
            text('egger-intercept',v.egger?fmt(v.egger.intercept):'Not selected');text('egger-se',v.egger?fmt(v.egger.se):'Not selected');text('egger-pvalue',v.egger?fmt(v.egger.pValue):'Not selected');text('egger-conclusion',v.egger?.error||'Small-study-effect test, not proof of publication bias');
            text('begg-tau',v.begg?fmt(v.begg.tau):'Not selected');text('begg-z',v.begg?fmt(v.begg.z):'Not selected');text('begg-pvalue',v.begg?fmt(v.begg.pValue):'Not selected');text('begg-conclusion',v.begg?.error||'Interpret cautiously, especially with few studies');
            text('tf-imputed',tf?.nMissing??'Not selected');text('tf-original',fmt(tf?.original?.effect));text('tf-adjusted',fmt(tf?.adjusted?.effect));text('tf-change',tf?.adjusted?fmt(tf.adjusted.effect-tf.original.effect):'Not selected');
            tableRows('selection-model-body',[['Selection-model estimation is unavailable in this panel.']]);this.exports('pb',$('pub-bias-results'),v);
        }
        schedulePaint() {
            if(this.frame!==null)cancelAnimationFrame(this.frame);
            this.frame=requestAnimationFrame(()=>{this.frame=null;for(const [kind,section,method]of[['ma','meta-methods','paintMA'],['nma','nma','paintNMA'],['pb','pub-bias','paintPB']])if(this.fit[kind]&&$('section-'+section)?.getBoundingClientRect().width)this[method]();});
        }
    }
    // The standalone DTA app already accepts UTF-8 URL-fragment state. Fragments
    // are not sent to the server. Large datasets use its existing JSON importer.
    function dtaRoute(dataset) {
        try {
            const rows=dataset?.studies;if(!Array.isArray(rows)||rows.length<2)throw new Error('DTA needs at least two studies');
            const csv=rows.map((r,i)=>{
                const study=name(r.study??r.label,i+1);if(/[\r\n\t]/.test(study))throw new Error('DTA study names must not contain line breaks or tabs');
                const cells=['TP','FP','FN','TN'].map(k=>number(r[k]??r[k.toLowerCase()],k,i+1));
                if(cells.some(v=>!Number.isInteger(v)||v<0)||cells[0]+cells[2]===0||cells[1]+cells[3]===0)throw new Error('DTA requires nonnegative integer 2×2 cells and both diseased/non-diseased participants');
                return [study,...cells].join(',');
            }).join('\n');
            const state={data:csv,title:dataset.name||'HTA diagnostic accuracy data',method:'reml',cc:'all',cov:''};
            const {body}=S.modal('hta-dta-route','Diagnostic-accuracy analysis','Continue in AllMeta’s dedicated DTA/SROC app with these study counts.');
            S.element('p',`${rows.length} studies validated. The standalone app will fit and draw its own results; HTA has not fitted a DTA model. Review its model, continuity correction, convergence and warnings.`,body);
            const url=new URL('../dta-sroc/index.html',location.href),hash=btoa(unescape(encodeURIComponent(JSON.stringify({v:1,...state}))));
            if(hash.length<=4096)url.hash=hash;
            else S.element('p','This dataset is too large for fragment transfer. Download the DTA project JSON, open the tool, then use Import JSON.',body);
            const a=S.element('a',hash.length<=4096?'Open DTA with these data':'Open DTA tool',body);a.href=url.href;a.target='_blank';a.rel='noopener';a.className='btn btn-primary';a.id='hta-open-dta';
            const b=S.element('button','Download DTA project JSON',body);b.type='button';b.className='btn btn-secondary';b.addEventListener('click',()=>save(JSON.stringify(state,null,2),'hta-dta-project.json','application/json'));
        }catch(error){document.getElementById('hta-dta-route')?.remove();S.error(error.message);}
    }
    root.HTAAdvancedSynthesis=HTAAdvancedSynthesis;
    root.HTADiagnosticRoute=dtaRoute;
})(window);
